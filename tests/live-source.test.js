import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDashboardData } from '../js/source-loader.js';

test('same-origin live API rows drive every dashboard adapter', async () => {
  const previousFetch = globalThis.fetch;
  const payload = {
    contractVersion: 1,
    ratingTabs: [{ period: 'August 2026', rows: [['App', 'Store', 'GEO', 'Start', 'Week 1'], ['IQ Option', 'GooglePlay', 'Viet Nam', '4.1', '4.15']] }],
    popupRawRows: [['brand_name', 'platform_type', 'country_name', 'user_segment', 'show_users', 'close_users', 'accept_users', 'decline_users', 'rated_users', 'stars_1', 'stars_2', 'stars_3', 'stars_4', 'stars_5', 'avg_stars'], ['IQ Option', 'android', 'Vietnam', 'core', '100', '20', '50', '30', '10', '1', '1', '1', '2', '5', '4']],
    popupCountryRateRows: [['brand_name', 'country_name', 'platform_type', '1 star', '2 stars', '3 stars', '4 stars', '5 stars'], ['IQ Option', 'Vietnam Total', '', '1', '1', '1', '2', '5']],
    popupSummaryRows: [['Brand', 'Platform type', 'User Segment', 'Country', 'Saw Popup ', 'Closed Popup', '% Closed', 'Enjoyed App', '% Enjoyed', "Didn't enjoy app", "% Didn't", "Rated among Didn't enjoy app", '% Rated', '1 star', '2 stars', '3 stars', '4 stars', '5 stars'], ['IQ Option', 'android Total', '', '', '100', '20', '', '50', '', '30', '', '10', '', '1', '1', '1', '2', '5']],
    popupDailyRows: [['event_date', 'brand_name', 'country_name', 'platform_type', 'users_redirected_to_store'], ['2026-07-31', 'IQ Option', 'Vietnam', 'android', '12']],
    ticketSummary: [{ brand: 'IQ Option', country: 'Vietnam', segment: 'core', ticketCount: 2, ratedCount: 2, lowScoreCount: 1, averageStar: 2.5, languages: [] }],
    volumeRows: [['Package', 'Country', 'Monthly New Installs', 'As Of Date'], ['com.iqoption', 'VN', '3100', '2026-07-31']],
    campaigns: [{ campaign_id: 'vn_aug', name: 'VN August', brand: 'IQ Option', store: 'GooglePlay', country: 'Vietnam', status: 'active', audience_size: 100 }],
    campaignTracker: { connected: true, registryConnected: true, containsPersonalData: false },
    snapshotMetadata: { rawRows: 1, dailyRedirectRows: 1, feedbackTicketRowsAggregated: 2, containsPersonalData: false },
    sourceMetadata: { popup: { dailyRedirectThrough: '2026-07-31', rawSnapshotDated: false } },
  };
  globalThis.fetch = async () => new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const data = await loadDashboardData();
    assert.equal(data.mode, 'live-private-sheet-api');
    assert.equal(data.ratingData.records[0].countryCode, 'VN');
    assert.equal(data.popupRecords[0].accepted, 50);
    assert.equal(data.dailyRedirectRows[0].redirects, 12);
    assert.equal(data.volumeRecords[0].weeklyDownloads, 700);
    assert.equal(data.campaigns[0].countryCode, 'VN');
    assert.equal(data.sourceMetadata.popup.dailyRedirectThrough, '2026-07-31');
  } finally {
    globalThis.fetch = previousFetch;
  }
});
