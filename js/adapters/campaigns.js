import { parseCsv, rowsToObjects, numberValue } from './csv.js';
import { normalizeCountry, normalizeStore } from '../normalization.js';

const COUNT_FIELDS = [
  'audience_size', 'emails_sent', 'delivered', 'evidence_submissions',
  'pending_review', 'approved', 'rejected', 'rewards_granted', 'verified_review_count',
];

export const isTestCampaign = campaign => campaign.countryCode === 'TEST' || campaign.is_test === true;

export function parseCampaigns(csv, requiredSchema) {
  const rows = parseCsv(csv);
  if (!rows.length) return { records: [], errors: [], unmapped: [] };
  const headers = rows[0].map(value => String(value).trim());
  const missing = requiredSchema.filter(name => !headers.includes(name) && !(name === 'evidence_submissions' && headers.includes('typeform_submissions')));
  if (missing.length) return { records: [], errors: [`Missing columns: ${missing.join(', ')}`], unmapped: [] };
  const unmapped = new Set();
  const records = rowsToObjects(rows).map(row => ({
    ...row,
    evidence_submissions: row.evidence_submissions ?? row.typeform_submissions,
    countryCode: normalizeCountry(row.country, unmapped),
    store: normalizeStore(row.store),
    ...Object.fromEntries(COUNT_FIELDS.map(name => [name, numberValue(name === 'evidence_submissions' ? (row.evidence_submissions ?? row.typeform_submissions) : row[name])])),
  })).filter(record => record.countryCode);
  return { records, errors: [], unmapped: [...unmapped].sort() };
}

export function normalizeCampaignRecords(rows = []) {
  const unmapped = new Set();
  const records = rows.map(row => ({
    ...row,
    countryCode: normalizeCountry(row.country, unmapped),
    store: normalizeStore(row.store),
    ...Object.fromEntries(COUNT_FIELDS.map(name => [name, numberValue(row[name])])),
  })).filter(record => record.countryCode && record.brand && record.store);
  return { records, unmapped: [...unmapped].sort() };
}

export const isReservedCampaignId = value => /(^|[_-])(test|smoke)([_-]|$)/i.test(String(value || ''));

export function suggestCampaignId(brand, store, country, date) {
  if (country === 'TEST') return `pilot_${date}`;
  return [brand, store, country, date]
    .map(value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''))
    .filter(Boolean).join('_').slice(0, 64);
}

export function summarizeScreenshotTracker(participants = [], submissions = [], registry = []) {
  const campaigns = new Map();
  const registryById = new Map(registry.map(row => [String(row.campaign_id || '').trim(), row]));
  let excludedTestParticipants = 0;
  let excludedTestSubmissions = 0;
  let unassignedParticipants = 0;
  let unassignedSubmissions = 0;

  const getCampaign = campaignId => {
    if (!campaigns.has(campaignId)) {
      const source = registryById.get(campaignId) || {};
      campaigns.set(campaignId, {
        campaign_id: campaignId,
        name: String(source.name || campaignId).trim(),
        brand: String(source.brand || '').trim(),
        store: normalizeStore(source.store),
        countryCode: normalizeCountry(source.country),
        country: String(source.country || '').trim(),
        status: String(source.status || 'active').trim(),
        start_date: String(source.start_date || '').trim(),
        end_date: String(source.end_date || '').trim(),
        audience_size: 0, evidence_submissions: 0, uploading: 0,
        pending_review: 0, approved: 0, rejected: 0,
        rewards_granted: numberValue(source.rewards_granted),
        retention_deleted: 0, languages: {},
      });
    }
    return campaigns.get(campaignId);
  };

  participants.forEach(row => {
    const campaignId = String(row.current_campaign_id || '').trim();
    if (!campaignId) { unassignedParticipants += 1; return; }
    if (isReservedCampaignId(campaignId)) { excludedTestParticipants += 1; return; }
    const campaign = getCampaign(campaignId);
    campaign.audience_size += 1;
  });

  submissions.forEach(row => {
    const campaignId = String(row.campaign_id || '').trim();
    if (!campaignId) { unassignedSubmissions += 1; return; }
    if (isReservedCampaignId(campaignId)) { excludedTestSubmissions += 1; return; }
    const campaign = getCampaign(campaignId);
    const status = String(row.status || '').trim().toLowerCase();
    if (row.submitted_at) campaign.evidence_submissions += 1;
    if (status === 'uploading') campaign.uploading += 1;
    if (status === 'pending_verification') campaign.pending_review += 1;
    if (status === 'successful') campaign.approved += 1;
    if (['blocked', 'rejected'].includes(status)) campaign.rejected += 1;
    if (row.retention_deleted_at) campaign.retention_deleted += 1;
    const language = String(row.selected_language || '').trim();
    if (language) campaign.languages[language] = (campaign.languages[language] || 0) + 1;
  });

  return {
    campaigns: [...campaigns.values()],
    metadata: {
      participantRows: participants.length,
      submissionRows: submissions.length,
      excludedTestParticipants,
      excludedTestSubmissions,
      unassignedParticipants,
      unassignedSubmissions,
      campaignRegistryRows: registry.length,
      containsPersonalData: false,
    },
  };
}
