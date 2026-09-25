import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARTICIPANT_COLUMNS,
  SUBMISSION_COLUMNS,
  approvedUsersCsv,
  approvedUsersForCampaign,
  buildReviewSnapshot,
  planReviewDecision,
  planReviewUndo,
} from '../functions/lib/reviews.js';
import {
  GOOGLE_JWT_GRANT_TYPE, reviewAuthorized, reviewHostAllowed, sameOriginWrite,
} from '../functions/lib/google-review.js';
import { readFile } from 'node:fs/promises';

const row = (columns, values) => columns.map(column => values[column] ?? '');

function pendingFixture() {
  return buildReviewSnapshot({
    participantRows: [
      row(PARTICIPANT_COLUMNS, {
        user_id: '95375019', status: 'eligible', current_campaign_id: 'older',
        token_hash: 'old-token', updated_at: '2026-09-17T12:00:00Z',
      }),
      row(PARTICIPANT_COLUMNS, {
        user_id: '95375019', status: 'pending_verification', current_campaign_id: 'pilot_20260917_2',
        token_hash: 'current-token', latest_submission_id: 'submission-1',
        latest_submitted_at: '2026-09-22T10:00:00Z', updated_at: '2026-09-22T10:00:00Z',
      }),
    ],
    submissionRows: [
      row(SUBMISSION_COLUMNS, {
        submission_id: 'submission-1', user_id: '95375019', campaign_id: 'pilot_20260917_2',
        status: 'pending_verification', token_hash: 'current-token', selected_language: 'pt',
        drive_file_id: 'private-drive-id', submitted_at: '2026-09-22T10:00:00Z',
      }),
    ],
    registryRows: [['pilot_20260917_2', 'Internal pilot']],
  });
}

test('review queue exposes review context without Drive or token identifiers', () => {
  const snapshot = pendingFixture();
  assert.deepEqual(snapshot.campaigns, [{
    campaignId: 'pilot_20260917_2', campaignName: 'Internal pilot', pending: 1, approved: 0, rejected: 0,
  }]);
  assert.deepEqual(snapshot.items, [{
    reviewId: 'submission-1', userId: '95375019', campaignId: 'pilot_20260917_2',
    campaignName: 'Internal pilot', selectedLanguage: 'pt', submittedAt: '2026-09-22T10:00:00Z',
    imageAvailable: true,
  }]);
  assert.equal(JSON.stringify(snapshot.items).includes('private-drive-id'), false);
  assert.equal(JSON.stringify(snapshot.items).includes('current-token'), false);
});

test('technical smoke campaigns never enter reward review or export data', () => {
  const snapshot = buildReviewSnapshot({
    submissionRows: [
      row(SUBMISSION_COLUMNS, {
        submission_id: 'smoke-1', user_id: 'technical-user', campaign_id: 'automated_smoke_test',
        status: 'pending_verification', drive_file_id: 'private-smoke-image',
      }),
      row(SUBMISSION_COLUMNS, {
        submission_id: 'pilot-1', user_id: 'real-user', campaign_id: 'pilot_20260917_2',
        status: 'pending_verification', drive_file_id: 'private-pilot-image',
      }),
    ],
  });
  assert.deepEqual(snapshot.items.map(item => item.reviewId), ['pilot-1']);
  assert.deepEqual(snapshot.campaigns.map(campaign => campaign.campaignId), ['pilot_20260917_2']);
  assert.equal(snapshot.submissions.some(item => item.submission_id === 'smoke-1'), false);
});

test('review APIs require the production host and a Cloudflare Access identity', () => {
  const anonymous = new Request('https://gp-dash.pages.dev/api/reviews');
  const protectedRequest = new Request('https://gp-dash.pages.dev/api/reviews', {
    headers: { 'cf-access-authenticated-user-email': 'reviewer@iqoption.com' },
  });
  assert.equal(reviewHostAllowed(anonymous), true);
  assert.equal(reviewAuthorized(anonymous), false);
  assert.equal(reviewAuthorized(protectedRequest), true);
  assert.equal(reviewHostAllowed(new Request('https://preview.pages.dev/api/reviews')), false);
  assert.equal(reviewAuthorized(new Request('http://localhost:8788/api/reviews')), true);
});

test('review API uses the standard Google JWT bearer grant type', () => {
  assert.equal(GOOGLE_JWT_GRANT_TYPE, 'urn:ietf:params:oauth:grant-type:jwt-bearer');
});

test('review preview fails closed and automatically rejects unsupported stored file types', async () => {
  const [app, imageApi] = await Promise.all([
    readFile(new URL('../js/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../functions/api/reviews/image.js', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /data-review-image-error/);
  assert.match(app, /data-review-image-retry/);
  assert.match(app, /review-approve[^>]+disabled/);
  assert.match(app, /response\.status === 415/);
  assert.match(app, /Automatically rejected: the uploaded file is not a supported JPEG, PNG, or WebP image/);
  assert.match(app, /decision: 'reject'/);
  assert.match(imageApi, /DISPLAYABLE_IMAGE_TYPES/);
  assert.match(imageApi, /supported image.*415/s);
});

test('review writes accept only the same browser origin', () => {
  assert.equal(sameOriginWrite(new Request('https://gp-dash.pages.dev/api/reviews/action', {
    headers: { origin: 'https://gp-dash.pages.dev' },
  })), true);
  assert.equal(sameOriginWrite(new Request('https://gp-dash.pages.dev/api/reviews/action', {
    headers: { origin: 'https://attacker.example' },
  })), false);
});

test('approval atomically marks reward eligibility and permanently blocks the current participant', () => {
  const plan = planReviewDecision(pendingFixture(), {
    reviewId: 'submission-1', decision: 'approve', notes: 'Readable evidence',
    reviewerEmail: 'Reviewer@iqoption.com', reviewedAt: '2026-09-22T11:00:00Z',
  });
  const submission = Object.fromEntries(SUBMISSION_COLUMNS.map((column, index) => [column, plan.submissionValues[index]]));
  const participant = Object.fromEntries(PARTICIPANT_COLUMNS.map((column, index) => [column, plan.participantValues[index]]));
  assert.equal(plan.submissionRange, "'Submissions'!A2:Q2");
  assert.equal(plan.participantRange, "'Participants'!A3:K3");
  assert.equal(plan.campaignRange, "'Campaigns'!A2:R2");
  assert.equal(submission.status, 'successful');
  assert.equal(submission.reward_eligible, 'yes');
  assert.equal(submission.reviewer_email, 'reviewer@iqoption.com');
  assert.equal(submission.review_notes, 'Readable evidence');
  assert.equal(participant.status, 'successful');
  assert.equal(participant.first_success_at, '2026-09-22T11:00:00Z');
  assert.equal(participant.updated_at, '2026-09-22T11:00:00Z');
  assert.deepEqual(plan.campaignValues.slice(11, 15), [1, 0, 1, 0]);
});

test('rejection marks reward ineligibility and leaves the link retryable', () => {
  const plan = planReviewDecision(pendingFixture(), {
    reviewId: 'submission-1', decision: 'reject', notes: 'Image is unreadable',
    reviewedAt: '2026-09-22T11:00:00Z',
  });
  const submission = Object.fromEntries(SUBMISSION_COLUMNS.map((column, index) => [column, plan.submissionValues[index]]));
  const participant = Object.fromEntries(PARTICIPANT_COLUMNS.map((column, index) => [column, plan.participantValues[index]]));
  assert.equal(submission.status, 'rejected');
  assert.equal(submission.reward_eligible, 'no');
  assert.equal(participant.status, 'rejected');
  assert.equal(participant.token_hash, 'current-token');
  assert.deepEqual(plan.campaignValues.slice(11, 15), [1, 0, 0, 1]);
});

test('undo restores a reviewed submission, participant, and campaign to pending', () => {
  const approved = planReviewDecision(pendingFixture(), {
    reviewId: 'submission-1', decision: 'approve', notes: 'Readable evidence',
    reviewerEmail: 'reviewer@iqoption.com', reviewedAt: '2026-09-22T11:00:00Z',
  });
  const decidedSnapshot = buildReviewSnapshot({
    participantRows: [approved.participantValues],
    submissionRows: [approved.submissionValues],
    registryRows: [approved.campaignValues],
  });
  const undone = planReviewUndo(decidedSnapshot, {
    reviewId: 'submission-1', reviewerEmail: 'reviewer@iqoption.com', reviewedAt: '2026-09-22T11:01:00Z',
  });
  const submission = Object.fromEntries(SUBMISSION_COLUMNS.map((column, index) => [column, undone.submissionValues[index]]));
  const participant = Object.fromEntries(PARTICIPANT_COLUMNS.map((column, index) => [column, undone.participantValues[index]]));
  assert.equal(submission.status, 'pending_verification');
  assert.equal(submission.reward_eligible, '');
  assert.equal(submission.reviewed_at, '');
  assert.equal(participant.status, 'pending_verification');
  assert.equal(participant.first_success_at, '');
  assert.match(participant.notes, /Review undone by reviewer@iqoption\.com/);
  assert.deepEqual(undone.campaignValues.slice(11, 15), [1, 1, 0, 0]);
});

test('review decisions use an undo action instead of modal confirmation', async () => {
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /window\.confirm/);
  assert.match(app, /data-review-undo/);
  assert.match(app, /decision: 'undo'/);
});

test('review decisions advance locally without reloading the protected queue', async () => {
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const submitStart = app.indexOf('async function submitReview');
  const submitEnd = app.indexOf('async function undoReviewDecision');
  const submitBody = app.slice(submitStart, submitEnd);
  assert.match(submitBody, /applyReviewDecisionLocally/);
  assert.doesNotMatch(submitBody, /loadReviewQueue/);
  assert.match(app, /queueMinHeight/);
  assert.match(app, /restoreReviewDecisionLocally/);
});

test('approved reward CSV is campaign scoped and unavailable while reviews are pending', () => {
  assert.throws(() => approvedUsersForCampaign(pendingFixture(), 'pilot_20260917_2'), /still need review/);
  const snapshot = buildReviewSnapshot({
    submissionRows: [
      row(SUBMISSION_COLUMNS, { submission_id: 'a', user_id: '95375019', campaign_id: 'pilot', status: 'successful', reward_eligible: 'yes' }),
      row(SUBMISSION_COLUMNS, { submission_id: 'b', user_id: '95375019', campaign_id: 'pilot', status: 'successful', reward_eligible: 'yes' }),
      row(SUBMISSION_COLUMNS, { submission_id: 'c', user_id: '139735565', campaign_id: 'pilot', status: 'rejected', reward_eligible: 'no' }),
      row(SUBMISSION_COLUMNS, { submission_id: 'd', user_id: 'other', campaign_id: 'another', status: 'successful', reward_eligible: 'yes' }),
    ],
  });
  assert.deepEqual(approvedUsersForCampaign(snapshot, 'pilot'), ['95375019']);
  assert.equal(approvedUsersCsv(['95375019']), 'USERID\r\n95375019\r\n');
});
