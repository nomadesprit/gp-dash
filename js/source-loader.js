import { CONFIG } from './config.js';
import {
  DEMO_APPFOLLOW_TABS, DEMO_CAMPAIGN_TRACKER, DEMO_POPUP_DAILY_CSV,
  DEMO_POPUP_RATES_CSV, DEMO_POPUP_RAW_CSV, DEMO_POPUP_SUMMARY_ROWS,
  DEMO_SNAPSHOT_METADATA, DEMO_TICKET_SUMMARY, DEMO_VOLUME_CSV,
} from './data/fixture.js';
import { parseAppFollowTabs } from './adapters/appfollow.js';
import { parsePopupSnapshot, aggregatePopup, parseDailyRedirects, parsePopupCountryRates, parsePopupHighLevelSummary, normalizeTicketSummary } from './adapters/popup.js';
import { parseVolumeSnapshot } from './adapters/volume.js';
import { normalizeCampaignRecords } from './adapters/campaigns.js';

async function loadServerApi() {
  const response = await fetch(CONFIG.runtime.serverApiUrl, { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Private source API returned ${response.status}`);
  const payload = await response.json();
  if (payload.contractVersion !== 1 || !Array.isArray(payload.ratingTabs)) throw new Error('Private source API contract is invalid');
  const ratingData = parseAppFollowTabs(payload.ratingTabs);
  const popupData = parsePopupSnapshot(payload.popupRawRows || []);
  const dailyData = parseDailyRedirects(payload.popupDailyRows || []);
  const countryRates = parsePopupCountryRates(payload.popupCountryRateRows || []);
  const ticketData = normalizeTicketSummary(payload.ticketSummary || []);
  const volumeData = parseVolumeSnapshot(payload.volumeRows || [], CONFIG.sources.volume);
  const campaignData = normalizeCampaignRecords(payload.campaigns || []);
  return {
    mode: 'live-private-sheet-api', ratingData, popupRecords: aggregatePopup(popupData.records),
    popupRows: popupData.records, popupSummary: null, volumeRecords: volumeData.records,
    dailyRedirectRows: dailyData.records, popupCountryRates: countryRates.records,
    popupHighLevelSummary: parsePopupHighLevelSummary(payload.popupSummaryRows || []),
    ticketSummary: ticketData.records, snapshotMetadata: payload.snapshotMetadata || null,
    campaigns: campaignData.records, campaignTracker: payload.campaignTracker || null,
    sourceMetadata: payload.sourceMetadata || null,
    unmapped: [...new Set([
      ...ratingData.unmapped, ...popupData.unmapped, ...dailyData.unmapped,
      ...countryRates.unmapped, ...ticketData.unmapped, ...volumeData.unmapped,
      ...campaignData.unmapped,
    ])],
  };
}

function loadFixture(reason = null) {
  const ratingData = parseAppFollowTabs(DEMO_APPFOLLOW_TABS);
  const popupData = parsePopupSnapshot(DEMO_POPUP_RAW_CSV);
  const dailyData = parseDailyRedirects(DEMO_POPUP_DAILY_CSV);
  const countryRates = parsePopupCountryRates(DEMO_POPUP_RATES_CSV);
  const ticketData = normalizeTicketSummary(DEMO_TICKET_SUMMARY);
  const volumeData = parseVolumeSnapshot(DEMO_VOLUME_CSV, CONFIG.sources.volume);
  return {
    mode: 'synthetic-demo-fixture', reason, ratingData,
    popupRecords: aggregatePopup(popupData.records), popupRows: popupData.records,
    volumeRecords: volumeData.records,
    dailyRedirectRows: dailyData.records, popupCountryRates: countryRates.records,
    popupHighLevelSummary: parsePopupHighLevelSummary(DEMO_POPUP_SUMMARY_ROWS),
    ticketSummary: ticketData.records, snapshotMetadata: DEMO_SNAPSHOT_METADATA,
    campaigns: [],
    campaignTracker: DEMO_CAMPAIGN_TRACKER,
    sourceMetadata: {
      generatedAt: DEMO_SNAPSHOT_METADATA.generatedAt,
      appFollow: { cadence: CONFIG.sources.appFollow.cadence, status: 'demo', modifiedTime: null, ageDays: null },
      popup: { cadence: CONFIG.sources.popup.cadence, status: 'demo', modifiedTime: null, ageDays: null, rawSnapshotDated: false, dailyRedirectThrough: '2026-07-31' },
      volume: { cadence: 'Weekly cache', status: 'demo', modifiedTime: null, ageDays: null, dataThrough: '2026-07-31' },
      campaign: { cadence: 'Operational tracker', status: 'demo', modifiedTime: null, ageDays: null, registryConnected: false },
    },
    unmapped: [...new Set([
      ...ratingData.unmapped, ...popupData.unmapped, ...dailyData.unmapped,
      ...countryRates.unmapped, ...ticketData.unmapped, ...volumeData.unmapped,
    ])],
  };
}

export async function loadDashboardData() {
  try { return await loadServerApi(); }
  catch (error) {
    if (!CONFIG.runtime.fixtureFallback) throw error;
    return loadFixture(error.message);
  }
}
