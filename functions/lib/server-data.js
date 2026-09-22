const numeric = value => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/[%,$\s]/g, '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

export function rowsToObjects(rows = []) {
  if (!rows.length) return [];
  const headers = rows[0].map(value => String(value ?? '').trim());
  return rows.slice(1).filter(row => row.some(value => String(value ?? '').trim() !== '')).map(row =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])),
  );
}

export function freshness(modifiedTime, warningAfterDays, now = new Date()) {
  const modified = new Date(modifiedTime);
  if (!modifiedTime || Number.isNaN(modified.getTime())) return { status: 'unknown', ageDays: null };
  const ageDays = Math.max(0, Math.floor((now.getTime() - modified.getTime()) / 86_400_000));
  return { status: ageDays > warningAfterDays ? 'stale' : 'current', ageDays };
}

export function summarizeFeedback(rows = []) {
  const groups = new Map();
  rowsToObjects(rows).forEach(row => {
    const brand = String(row.brand_name || '').trim();
    const country = String(row.country_name || '').trim();
    const segment = String(row.user_segment || 'unknown').trim() || 'unknown';
    if (!brand || !country) return;
    const key = `${brand}|${country}|${segment}`;
    const group = groups.get(key) || {
      brand, country, segment, ticketCount: 0, ratedCount: 0, lowScoreCount: 0,
      starTotal: 0, firstAt: '', lastAt: '', languages: new Map(),
    };
    group.ticketCount += 1;
    const score = numeric(row.star_rate);
    if (score !== null) {
      group.ratedCount += 1;
      group.starTotal += score;
      if (score <= 1) group.lowScoreCount += 1;
    }
    const createdAt = String(row.ticket_message_created_ts || '').trim();
    if (createdAt && (!group.firstAt || createdAt < group.firstAt)) group.firstAt = createdAt;
    if (createdAt && (!group.lastAt || createdAt > group.lastAt)) group.lastAt = createdAt;
    const language = String(row.ticket_message_language || row.ticket_message_locale || '').trim();
    if (language) group.languages.set(language, (group.languages.get(language) || 0) + 1);
    groups.set(key, group);
  });
  return [...groups.values()].map(group => ({
    brand: group.brand,
    country: group.country,
    segment: group.segment,
    ticketCount: group.ticketCount,
    ratedCount: group.ratedCount,
    lowScoreCount: group.lowScoreCount,
    averageStar: group.ratedCount ? group.starTotal / group.ratedCount : null,
    firstAt: group.firstAt,
    lastAt: group.lastAt,
    languages: [...group.languages].map(([language, count]) => ({ language, count })).sort((a, b) => b.count - a.count),
  }));
}

const testCampaign = value => /(^|[_-])(test|smoke)([_-]|$)/i.test(String(value || ''));

function mergeRanges(rangeGroups, headerGroups) {
  const rowCount = Math.max(0, ...rangeGroups.map(rows => rows?.length || 0));
  const headers = headerGroups.flat();
  const merged = [headers];
  for (let rowIndex = 1; rowIndex < rowCount; rowIndex += 1) {
    const row = [];
    rangeGroups.forEach((group, groupIndex) => {
      const width = headerGroups[groupIndex].length;
      const values = [...(group?.[rowIndex] || [])];
      while (values.length < width) values.push('');
      row.push(...values.slice(0, width));
    });
    merged.push(row);
  }
  return merged;
}

function count(value) {
  const parsed = numeric(value);
  return parsed === null || parsed < 0 ? 0 : parsed;
}

export function summarizeCampaignTracker({ participantRanges = [], submissionRanges = [], registryRows = [] } = {}) {
  const participants = rowsToObjects(mergeRanges(participantRanges, [['user_id', 'status', 'current_campaign_id'], ['brand']]));
  const latestParticipantsById = new Map();
  const participantsWithoutId = [];
  participants.forEach(row => {
    const id = String(row.user_id || '').trim();
    if (id) latestParticipantsById.set(id, row);
    else participantsWithoutId.push(row);
  });
  const currentParticipants = [...participantsWithoutId, ...latestParticipantsById.values()];
  const submissions = rowsToObjects(mergeRanges(submissionRanges, [['campaign_id'], ['status'], ['selected_language'], ['submitted_at', 'reviewed_at'], ['retention_deleted_at']]));
  const registry = rowsToObjects(registryRows);
  const registryById = new Map(registry.map(row => [String(row.campaign_id || '').trim(), row]));
  const campaigns = new Map();
  const metadata = {
    participantRows: participants.length,
    submissionRows: submissions.length,
    campaignRegistryRows: registry.length,
    productionCampaignRegistryRows: registry.filter(row => String(row.country || '').trim().toUpperCase() !== 'TEST' && !testCampaign(row.campaign_id)).length,
    testCampaignRegistryRows: registry.filter(row => String(row.country || '').trim().toUpperCase() === 'TEST' && !testCampaign(row.campaign_id)).length,
    excludedTestParticipants: 0,
    excludedTestSubmissions: 0,
    unassignedParticipants: 0,
    unassignedSubmissions: 0,
    latestActivityAt: null,
    containsPersonalData: false,
  };

  const getCampaign = campaignId => {
    if (!campaigns.has(campaignId)) {
      const source = registryById.get(campaignId) || {};
      campaigns.set(campaignId, {
        campaign_id: campaignId,
        name: String(source.name || campaignId).trim(),
        brand: String(source.brand || '').trim(),
        store: String(source.store || '').trim(),
        country: String(source.country || '').trim(),
        is_test: String(source.country || '').trim().toUpperCase() === 'TEST',
        status: String(source.status || 'active').trim(),
        start_date: String(source.start_date || '').trim(),
        end_date: String(source.end_date || '').trim(),
        audience_size: count(source.audience_size),
        emails_sent: numeric(source.emails_sent),
        delivered: numeric(source.delivered),
        evidence_submissions: count(source.evidence_submissions),
        pending_review: count(source.pending_review),
        approved: count(source.approved),
        rejected: count(source.rejected),
        rewards_granted: numeric(source.rewards_granted),
        verified_review_count: numeric(source.verified_review_count),
        source_updated_at: String(source.source_updated_at || '').trim(),
        assigned_participants: 0,
        observed_submissions: 0,
        observed_pending: 0,
        observed_approved: 0,
        observed_rejected: 0,
        uploading: 0,
        retention_deleted: 0,
        languages: {},
      });
    }
    return campaigns.get(campaignId);
  };

  registry.forEach(row => {
    const id = String(row.campaign_id || '').trim();
    if (id && !testCampaign(id)) getCampaign(id);
  });

  currentParticipants.forEach(row => {
    const campaignId = String(row.current_campaign_id || '').trim();
    if (!campaignId) { metadata.unassignedParticipants += 1; return; }
    if (testCampaign(campaignId)) { metadata.excludedTestParticipants += 1; return; }
    getCampaign(campaignId).assigned_participants += 1;
  });

  submissions.forEach(row => {
    const campaignId = String(row.campaign_id || '').trim();
    if (!campaignId) { metadata.unassignedSubmissions += 1; return; }
    if (testCampaign(campaignId)) { metadata.excludedTestSubmissions += 1; return; }
    const campaign = getCampaign(campaignId);
    if (String(row.submitted_at || '').trim()) campaign.observed_submissions += 1;
    const status = String(row.status || '').trim().toLowerCase();
    if (status === 'uploading') campaign.uploading += 1;
    if (status === 'pending_verification') campaign.observed_pending += 1;
    if (status === 'successful') campaign.observed_approved += 1;
    if (['blocked', 'rejected'].includes(status)) campaign.observed_rejected += 1;
    if (String(row.retention_deleted_at || '').trim()) campaign.retention_deleted += 1;
    [row.submitted_at, row.reviewed_at, row.retention_deleted_at].map(value => String(value || '').trim()).filter(Boolean).forEach(value => {
      if (!metadata.latestActivityAt || value > metadata.latestActivityAt) metadata.latestActivityAt = value;
    });
    const language = String(row.selected_language || '').trim();
    if (language) campaign.languages[language] = (campaign.languages[language] || 0) + 1;
  });

  return {
    campaigns: [...campaigns.values()].map(campaign => ({
      ...campaign,
      audience_size: Math.max(campaign.audience_size, campaign.assigned_participants),
      evidence_submissions: Math.max(campaign.evidence_submissions, campaign.observed_submissions),
      pending_review: Math.max(campaign.pending_review, campaign.observed_pending),
      approved: Math.max(campaign.approved, campaign.observed_approved),
      rejected: Math.max(campaign.rejected, campaign.observed_rejected),
    })),
    metadata,
  };
}

export function latestDate(rows = [], headerName) {
  const values = rowsToObjects(rows).map(row => String(row[headerName] || '').slice(0, 10)).filter(Boolean).sort();
  return values.at(-1) || null;
}
