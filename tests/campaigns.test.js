import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCampaigns, summarizeScreenshotTracker } from '../js/adapters/campaigns.js';

test('legacy Typeform count is accepted as an evidence-submission alias', () => {
  const csv = 'campaign_id,name,brand,store,country,status,start_date,end_date,audience_size,emails_sent,delivered,typeform_submissions,pending_review,approved,rejected,rewards_granted,verified_review_count,source_updated_at\nC1,Campaign,IQ Option,GooglePlay,Brazil,active,2026-08-01,2026-08-31,100,90,80,12,3,8,1,0,0,2026-08-12\n';
  const schema = ['campaign_id', 'name', 'brand', 'store', 'country', 'status', 'start_date', 'end_date', 'audience_size', 'emails_sent', 'delivered', 'evidence_submissions', 'pending_review', 'approved', 'rejected', 'rewards_granted', 'verified_review_count', 'source_updated_at'];
  const result = parseCampaigns(csv, schema);
  assert.equal(result.errors.length, 0);
  assert.equal(result.records[0].evidence_submissions, 12);
  assert.equal(result.records[0].countryCode, 'BR');
});

test('screenshot tracker excludes tests and emits only campaign aggregates', () => {
  const participants = [
    { user_id: 'private-1', token_hash: 'secret', current_campaign_id: 'br_august' },
    { user_id: 'private-2', token_hash: 'secret', current_campaign_id: 'automated_smoke_test' },
  ];
  const submissions = [
    { user_id: 'private-1', screenshot_url: 'private-url', review_notes: 'private note', campaign_id: 'br_august', status: 'pending_verification', selected_language: 'pt', submitted_at: '2026-08-12' },
    { user_id: 'private-2', screenshot_url: 'private-url', campaign_id: 'automated_smoke_test', status: 'successful', submitted_at: '2026-08-12' },
  ];
  const registry = [{ campaign_id: 'br_august', name: 'Brazil August', brand: 'IQ Option', store: 'GooglePlay', country: 'Brazil', status: 'active' }];
  const result = summarizeScreenshotTracker(participants, submissions, registry);
  assert.equal(result.campaigns.length, 1);
  assert.equal(result.campaigns[0].countryCode, 'BR');
  assert.equal(result.campaigns[0].audience_size, 1);
  assert.equal(result.campaigns[0].evidence_submissions, 1);
  assert.equal(result.campaigns[0].pending_review, 1);
  assert.equal(result.metadata.excludedTestParticipants, 1);
  assert.equal(result.metadata.excludedTestSubmissions, 1);
  const serialized = JSON.stringify(result);
  for (const forbidden of ['private-1', 'private-2', 'secret', 'private-url', 'private note']) {
    assert.equal(serialized.includes(forbidden), false);
  }
});
