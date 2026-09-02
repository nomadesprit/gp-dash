import test from 'node:test';
import assert from 'node:assert/strict';
import { campaignProgress, mixedForecast, reviewsNeeded, rightmostRating } from '../js/calculations.js';

test('uses the rightmost non-empty AppFollow weekly value', () => {
  const headers = ['App', 'Store', 'GEO', 'Start', 'Week 1', 'Week 2', 'Week 3'];
  const row = { Start: '4.10', 'Week 1': '4.11', 'Week 2': '4.13', 'Week 3': '' };
  assert.deepEqual(rightmostRating(row, headers), { value: 4.13, column: 'Week 2' });
});

test('simple review formula is used only when S is above target', () => {
  assert.equal(reviewsNeeded({ currentRating: 4, target: 4.2, effectiveRatingCount: 100, expectedScore: 4.7 }), 40);
  assert.equal(reviewsNeeded({ currentRating: 4, target: 4.2, effectiveRatingCount: 100, expectedScore: 4.1 }), null);
});

test('missing effective rating count makes forecast unavailable', () => {
  const result = mixedForecast({
    currentRating: 4.1, target: 4.2, effectiveRatingCount: '',
    popupExposure: 1000, acceptanceRate: .5, redirectToVerifiedRate: .1, popupExpectedScore: 4.6,
    campaignAudience: 0,
  });
  assert.equal(result.state, 'unavailable');
  assert.match(result.missing.join(' '), /effective rating count/);
});

test('mixed scenario calculates channels separately and solves remaining gap', () => {
  const result = mixedForecast({
    currentRating: 4, target: 4.2, effectiveRatingCount: 100,
    popupExposure: 100, acceptanceRate: .5, redirectToVerifiedRate: .2, popupExpectedScore: 4.6,
    campaignAudience: 50, campaignVerificationRate: .1, campaignExpectedScore: 4.4,
    remainingExpectedScore: 4.5, inputsVerified: false,
  });
  assert.equal(result.state, 'assumption-driven');
  assert.equal(result.popupVerified, 10);
  assert.equal(result.campaignVerified, 5);
  assert.equal(result.remainingReviews, 50);
});

test('planned popup forecast rejects a blank acceptance rate', () => {
  const result = mixedForecast({
    currentRating: 4.1, target: 4.2, effectiveRatingCount: 1000,
    popupExposure: 500, acceptanceRate: '', redirectToVerifiedRate: .1, popupExpectedScore: 4.5,
    campaignAudience: 0,
  });
  assert.equal(result.state, 'unavailable');
  assert.match(result.missing.join(' '), /acceptance rate/);
});

test('campaign progress projects final evidence at observed pace', () => {
  const result = campaignProgress({
    audience_size: 1_000, evidence_submissions: 100, pending_review: 20,
    approved: 60, rejected: 20, rewards_granted: 50,
    start_date: '2026-08-01', end_date: '2026-08-20',
  }, '2026-08-10');
  assert.equal(result.state, 'observed-pace');
  assert.equal(result.projectedSubmissions, 200);
  assert.equal(result.projectedAcceptedEvidence, 150);
  assert.equal(result.completionRate, 0.1);
  assert.equal(result.scheduleProgress, 0.5);
  assert.equal(result.confidence, 'low');
});

test('campaign pace forecast stays unavailable without dates or audience', () => {
  const result = campaignProgress({ evidence_submissions: 12 }, '2026-08-10');
  assert.equal(result.state, 'unavailable');
  assert.match(result.missing.join(' '), /audience size/);
  assert.match(result.missing.join(' '), /start and end dates/);
  assert.equal(result.projectedSubmissions, null);
});
