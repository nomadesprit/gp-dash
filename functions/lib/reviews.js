export const PARTICIPANT_COLUMNS = [
  'user_id', 'status', 'current_campaign_id', 'token_hash', 'token_expires_at',
  'latest_submission_id', 'latest_submitted_at', 'first_success_at', 'language',
  'updated_at', 'notes',
];

export const SUBMISSION_COLUMNS = [
  'submission_id', 'user_id', 'campaign_id', 'claim_id', 'status', 'token_hash',
  'selected_language', 'drive_file_id', 'screenshot_url', 'created_at', 'submitted_at',
  'reviewed_at', 'review_notes', 'error_code', 'retention_deleted_at',
  'reward_eligible', 'reviewer_email',
];

export const CAMPAIGN_COLUMNS = [
  'campaign_id', 'name', 'brand', 'store', 'country', 'status', 'start_date', 'end_date',
  'audience_size', 'emails_sent', 'delivered', 'evidence_submissions', 'pending_review',
  'approved', 'rejected', 'rewards_granted', 'verified_review_count', 'source_updated_at',
];

const DECISIONS = new Set(['approve', 'reject']);
const PENDING_STATUS = 'pending_verification';
const technicalCampaign = value => /(^|[_-])(test|smoke)([_-]|$)/i.test(String(value || ''));

function text(value) {
  return String(value ?? '').trim();
}

function rowToRecord(columns, row, rowNumber) {
  const record = { _rowNumber: rowNumber };
  columns.forEach((column, index) => { record[column] = text(row?.[index]); });
  return record;
}

function recordToRow(columns, record) {
  return columns.map(column => record[column] ?? '');
}

function records(columns, rows = [], startRow = 2) {
  return rows.map((row, index) => rowToRecord(columns, row, startRow + index));
}

function timeValue(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestRecord(rows) {
  return [...rows].sort((a, b) =>
    timeValue(b.updated_at) - timeValue(a.updated_at) || b._rowNumber - a._rowNumber)[0] || null;
}

function latestCampaign(rows) {
  return [...rows].sort((a, b) =>
    timeValue(b.source_updated_at) - timeValue(a.source_updated_at) || b._rowNumber - a._rowNumber)[0] || null;
}

function participantForSubmission(participants, submission) {
  const userRows = participants.filter(row => row.user_id === submission.user_id);
  if (!userRows.length) return null;
  const tokenRows = submission.token_hash
    ? userRows.filter(row => row.token_hash === submission.token_hash)
    : [];
  if (tokenRows.length) return latestRecord(tokenRows);
  const campaignRows = userRows.filter(row => row.current_campaign_id === submission.campaign_id);
  return latestRecord(campaignRows.length ? campaignRows : userRows);
}

function isRewardEligible(row) {
  return row.status === 'successful' && ['yes', 'true', '1'].includes(row.reward_eligible.toLowerCase());
}

export function buildReviewSnapshot({ participantRows = [], submissionRows = [], registryRows = [] } = {}) {
  const participants = records(PARTICIPANT_COLUMNS, participantRows);
  const submissions = records(SUBMISSION_COLUMNS, submissionRows)
    .filter(row => !technicalCampaign(row.campaign_id));
  const registry = records(CAMPAIGN_COLUMNS, registryRows);
  const campaignNames = new Map(registry.map(row => [row.campaign_id, row.name || row.campaign_id]));
  const summaries = new Map();

  const summaryFor = campaignId => {
    if (!summaries.has(campaignId)) {
      summaries.set(campaignId, {
        campaignId,
        campaignName: campaignNames.get(campaignId) || campaignId,
        pending: 0,
        approved: 0,
        rejected: 0,
      });
    }
    return summaries.get(campaignId);
  };

  const items = [];
  submissions.forEach(submission => {
    if (!submission.submission_id || !submission.user_id || !submission.campaign_id) return;
    const summary = summaryFor(submission.campaign_id);
    if (submission.status === PENDING_STATUS) {
      summary.pending += 1;
      items.push({
        reviewId: submission.submission_id,
        userId: submission.user_id,
        campaignId: submission.campaign_id,
        campaignName: summary.campaignName,
        selectedLanguage: submission.selected_language,
        submittedAt: submission.submitted_at || submission.created_at,
        imageAvailable: Boolean(submission.drive_file_id),
      });
    } else if (isRewardEligible(submission)) {
      summary.approved += 1;
    } else if (['rejected', 'blocked', 'duplicate_blocked'].includes(submission.status)) {
      summary.rejected += 1;
    }
  });

  items.sort((a, b) => text(a.submittedAt).localeCompare(text(b.submittedAt)) || a.userId.localeCompare(b.userId));
  const campaigns = [...summaries.values()].sort((a, b) =>
    b.pending - a.pending || a.campaignName.localeCompare(b.campaignName));
  return { participants, submissions, registry, campaigns, items };
}

function requiredDecision(value) {
  const action = text(value).toLowerCase();
  if (!DECISIONS.has(action)) throw new Error('Decision must be approve or reject.');
  return action;
}

function cleanNotes(value) {
  const notes = text(value);
  if (notes.length > 1000) throw new Error('Review notes must be 1000 characters or fewer.');
  return notes;
}

function cleanReviewer(value) {
  const reviewer = text(value).toLowerCase();
  return reviewer.slice(0, 254) || 'access-protected-operator';
}

export function planReviewDecision(snapshot, { reviewId, decision, notes, reviewerEmail, reviewedAt } = {}) {
  const submission = snapshot.submissions.find(row => row.submission_id === text(reviewId));
  if (!submission) throw new Error('Submission was not found.');
  if (submission.status !== PENDING_STATUS) throw new Error('Submission has already been reviewed.');
  const participant = participantForSubmission(snapshot.participants, submission);
  if (!participant) throw new Error('The participant record was not found.');

  const action = requiredDecision(decision);
  const now = text(reviewedAt) || new Date().toISOString();
  const reviewer = cleanReviewer(reviewerEmail);
  const reviewNotes = cleanNotes(notes);
  const status = action === 'approve' ? 'successful' : 'rejected';
  const rewardEligible = action === 'approve' ? 'yes' : 'no';
  const auditNote = `${action === 'approve' ? 'Approved' : 'Rejected'} by ${reviewer}`;

  const updatedSubmission = {
    ...submission,
    status,
    reviewed_at: now,
    review_notes: reviewNotes,
    reward_eligible: rewardEligible,
    reviewer_email: reviewer,
  };
  const updatedParticipant = {
    ...participant,
    status,
    latest_submission_id: submission.submission_id,
    latest_submitted_at: submission.submitted_at || participant.latest_submitted_at,
    first_success_at: action === 'approve' ? (participant.first_success_at || now) : participant.first_success_at,
    updated_at: now,
    notes: [participant.notes, auditNote].filter(Boolean).join(' | '),
  };
  const resultingSubmissions = snapshot.submissions.map(row =>
    row.submission_id === submission.submission_id ? updatedSubmission : row);
  const campaignSubmissions = resultingSubmissions.filter(row => row.campaign_id === submission.campaign_id);
  const campaign = latestCampaign(snapshot.registry.filter(row => row.campaign_id === submission.campaign_id));
  const updatedCampaign = campaign ? {
    ...campaign,
    evidence_submissions: campaignSubmissions.filter(row => row.submitted_at).length,
    pending_review: campaignSubmissions.filter(row => row.status === PENDING_STATUS).length,
    approved: campaignSubmissions.filter(row => row.status === 'successful').length,
    rejected: campaignSubmissions.filter(row => ['rejected', 'blocked'].includes(row.status)).length,
    source_updated_at: now,
  } : null;

  return {
    reviewId: submission.submission_id,
    decision: action,
    status,
    rewardEligible: action === 'approve',
    userId: submission.user_id,
    campaignId: submission.campaign_id,
    submissionRange: `'Submissions'!A${submission._rowNumber}:Q${submission._rowNumber}`,
    submissionValues: recordToRow(SUBMISSION_COLUMNS, updatedSubmission),
    participantRange: `'Participants'!A${participant._rowNumber}:K${participant._rowNumber}`,
    participantValues: recordToRow(PARTICIPANT_COLUMNS, updatedParticipant),
    campaignRange: updatedCampaign ? `'Campaigns'!A${campaign._rowNumber}:R${campaign._rowNumber}` : '',
    campaignValues: updatedCampaign ? recordToRow(CAMPAIGN_COLUMNS, updatedCampaign) : [],
  };
}

export function planReviewUndo(snapshot, { reviewId, reviewerEmail, reviewedAt } = {}) {
  const submission = snapshot.submissions.find(row => row.submission_id === text(reviewId));
  if (!submission) throw new Error('Submission was not found.');
  if (!['successful', 'rejected'].includes(submission.status)) {
    throw new Error(submission.status === PENDING_STATUS
      ? 'This review decision has already been undone.'
      : 'This review decision cannot be undone.');
  }
  const participant = participantForSubmission(snapshot.participants, submission);
  if (!participant) throw new Error('The participant record was not found.');

  const now = text(reviewedAt) || new Date().toISOString();
  const reviewer = cleanReviewer(reviewerEmail);
  const hasOtherSuccess = snapshot.submissions.some(row =>
    row.submission_id !== submission.submission_id
    && row.user_id === submission.user_id
    && row.status === 'successful');
  const updatedSubmission = {
    ...submission,
    status: PENDING_STATUS,
    reviewed_at: '',
    review_notes: '',
    reward_eligible: '',
    reviewer_email: '',
  };
  const updatedParticipant = {
    ...participant,
    status: hasOtherSuccess ? 'successful' : PENDING_STATUS,
    first_success_at: hasOtherSuccess ? participant.first_success_at : '',
    updated_at: now,
    notes: [participant.notes, `Review undone by ${reviewer}`].filter(Boolean).join(' | '),
  };
  const resultingSubmissions = snapshot.submissions.map(row =>
    row.submission_id === submission.submission_id ? updatedSubmission : row);
  const campaignSubmissions = resultingSubmissions.filter(row => row.campaign_id === submission.campaign_id);
  const campaign = latestCampaign(snapshot.registry.filter(row => row.campaign_id === submission.campaign_id));
  const updatedCampaign = campaign ? {
    ...campaign,
    evidence_submissions: campaignSubmissions.filter(row => row.submitted_at).length,
    pending_review: campaignSubmissions.filter(row => row.status === PENDING_STATUS).length,
    approved: campaignSubmissions.filter(row => row.status === 'successful').length,
    rejected: campaignSubmissions.filter(row => ['rejected', 'blocked'].includes(row.status)).length,
    source_updated_at: now,
  } : null;

  return {
    reviewId: submission.submission_id,
    decision: 'undo',
    status: PENDING_STATUS,
    rewardEligible: false,
    userId: submission.user_id,
    campaignId: submission.campaign_id,
    submissionRange: `'Submissions'!A${submission._rowNumber}:Q${submission._rowNumber}`,
    submissionValues: recordToRow(SUBMISSION_COLUMNS, updatedSubmission),
    participantRange: `'Participants'!A${participant._rowNumber}:K${participant._rowNumber}`,
    participantValues: recordToRow(PARTICIPANT_COLUMNS, updatedParticipant),
    campaignRange: updatedCampaign ? `'Campaigns'!A${campaign._rowNumber}:R${campaign._rowNumber}` : '',
    campaignValues: updatedCampaign ? recordToRow(CAMPAIGN_COLUMNS, updatedCampaign) : [],
  };
}

export function approvedUsersForCampaign(snapshot, campaignId) {
  const selected = text(campaignId);
  if (!selected) throw new Error('Choose a campaign before exporting rewards.');
  const campaignSubmissions = snapshot.submissions.filter(row => row.campaign_id === selected);
  const pendingCount = campaignSubmissions.filter(row => row.status === PENDING_STATUS).length;
  if (pendingCount) throw new Error(`${pendingCount} submission${pendingCount === 1 ? '' : 's'} still need review.`);
  return [...new Set(campaignSubmissions.filter(isRewardEligible).map(row => row.user_id).filter(Boolean))];
}

function csvCell(value) {
  const cell = text(value);
  return /[",\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
}

export function approvedUsersCsv(userIds) {
  return ['USERID', ...userIds.map(csvCell)].join('\r\n') + '\r\n';
}
