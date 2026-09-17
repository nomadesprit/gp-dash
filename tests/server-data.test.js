import test from 'node:test';
import assert from 'node:assert/strict';
import { freshness, summarizeCampaignTracker, summarizeFeedback } from '../functions/lib/server-data.js';

test('server feedback aggregation returns operational counts without personal fields', () => {
  const rows = [
    ['brand_name', 'country_name', 'user_segment', 'ticket_message_created_ts', 'ticket_message_locale', 'ticket_message_language', 'star_rate'],
    ['IQ Option', 'Brazil', 'core', '2026-08-01 10:00:00', 'pt_BR', 'Português', '1'],
    ['IQ Option', 'Brazil', 'core', '2026-08-02 10:00:00', 'pt_BR', 'Português', '4'],
  ];
  const result = summarizeFeedback(rows);
  assert.equal(result[0].ticketCount, 2);
  assert.equal(result[0].lowScoreCount, 1);
  assert.equal(result[0].averageStar, 2.5);
  assert.equal(JSON.stringify(result).includes('ticket_message'), false);
});

test('server campaign aggregation joins the registry and keeps discontiguous tracker columns aligned', () => {
  const registryRows = [
    ['campaign_id', 'name', 'brand', 'store', 'country', 'status', 'start_date', 'end_date', 'audience_size', 'emails_sent', 'delivered', 'evidence_submissions', 'pending_review', 'approved', 'rejected', 'rewards_granted', 'verified_review_count', 'source_updated_at'],
    ['br_aug', 'Brazil August', 'IQ Option', 'GooglePlay', 'Brazil', 'active', '2026-08-01', '2026-08-31', '50', '45', '40', '', '', '', '', '3', '', '2026-08-12'],
  ];
  const result = summarizeCampaignTracker({
    registryRows,
    participantRanges: [
      [['status', 'current_campaign_id'], ['eligible', 'br_aug'], ['blocked', 'automated_smoke_test']],
      [['BRAND'], ['IQ Option'], ['IQ Option']],
    ],
    submissionRanges: [
      [['campaign_id'], ['br_aug'], ['automated_smoke_test']],
      [['status'], ['successful'], ['pending_verification']],
      [['selected_language'], ['pt'], ['en']],
      [['submitted_at', 'reviewed_at'], ['2026-08-12T10:00:00Z']],
      [['retention_deleted_at'], ['2026-08-12T11:00:00Z']],
    ],
  });
  assert.equal(result.campaigns.length, 1);
  assert.equal(result.campaigns[0].campaign_id, 'br_aug');
  assert.equal(result.campaigns[0].audience_size, 50);
  assert.equal(result.campaigns[0].evidence_submissions, 1);
  assert.equal(result.campaigns[0].approved, 1);
  assert.equal(result.campaigns[0].retention_deleted, 1);
  assert.equal(result.metadata.excludedTestParticipants, 1);
  assert.equal(result.metadata.excludedTestSubmissions, 1);
  const serialized = JSON.stringify(result);
  for (const forbidden of ['user_id', 'token_hash', 'file_id', 'screenshot_url', 'review_notes']) assert.equal(serialized.includes(forbidden), false);
});

test('TEST country uploads are visible in aggregate while smoke campaigns stay excluded', () => {
  const registryRows = [
    ['campaign_id', 'name', 'brand', 'store', 'country', 'status'],
    ['pilot_20260917', 'Internal pilot', 'IQ Option', 'GooglePlay', 'TEST', 'ready_for_mailing'],
  ];
  const result = summarizeCampaignTracker({
    registryRows,
    participantRanges: [
      [['status', 'current_campaign_id'], ['eligible', 'pilot_20260917'], ['eligible', 'pilot_20260917'], ['blocked', 'automated_smoke_test']],
      [['brand'], ['IQ Option'], ['IQ Option'], ['IQ Option']],
    ],
    submissionRanges: [
      [['campaign_id'], ['pilot_20260917'], ['automated_smoke_test']],
      [['status'], ['pending_verification'], ['pending_verification']],
      [['selected_language'], ['en'], ['en']],
      [['submitted_at', 'reviewed_at'], ['2026-09-17T12:00:00Z'], ['2026-09-17T12:00:00Z']],
      [['retention_deleted_at'], [], []],
    ],
  });
  assert.equal(result.campaigns.length, 1);
  assert.equal(result.campaigns[0].is_test, true);
  assert.equal(result.campaigns[0].audience_size, 2);
  assert.equal(result.campaigns[0].evidence_submissions, 1);
  assert.equal(result.campaigns[0].pending_review, 1);
  assert.equal(result.metadata.productionCampaignRegistryRows, 0);
  assert.equal(result.metadata.testCampaignRegistryRows, 1);
  assert.equal(result.metadata.excludedTestSubmissions, 1);
});

test('freshness follows the documented Friday and monthly warning windows', () => {
  const now = new Date('2026-08-12T12:00:00Z');
  assert.equal(freshness('2026-08-07T12:00:00Z', 10, now).status, 'current');
  assert.equal(freshness('2026-06-01T12:00:00Z', 45, now).status, 'stale');
});
