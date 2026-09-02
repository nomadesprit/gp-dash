import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAppFollowTabs } from '../js/adapters/appfollow.js';
import { parsePopupSnapshot, aggregatePopup, parseDailyRedirects, parsePopupCountryRates, parsePopupHighLevelSummary, normalizeTicketSummary } from '../js/adapters/popup.js';
import { normalizeCountry } from '../js/normalization.js';
import {
  DEMO_POPUP_DAILY_CSV, DEMO_POPUP_RATES_CSV, DEMO_POPUP_RAW_CSV,
  DEMO_POPUP_SUMMARY_ROWS, DEMO_SNAPSHOT_METADATA, DEMO_TICKET_SUMMARY,
} from '../js/data/fixture.js';

test('country aliases normalize to the same ISO code', () => {
  assert.equal(normalizeCountry('Viet Nam'), 'VN');
  assert.equal(normalizeCountry('Vietnam'), 'VN');
  assert.equal(normalizeCountry('Venezuela, Bolivarian Republic of'), 'VE');
  assert.equal(normalizeCountry('Venezuela'), 'VE');
  assert.equal(normalizeCountry('Australia'), 'AU');
  assert.equal(normalizeCountry('Mauritania'), 'MR');
});

test('unmapped country names are exposed instead of silently discarded', () => {
  const unmapped = new Set();
  assert.equal(normalizeCountry('Atlantis', unmapped), null);
  assert.deepEqual([...unmapped], ['Atlantis']);
});

test('AppFollow and popup rows join through normalized ISO codes', () => {
  const ratings = parseAppFollowTabs([{ period: 'August 2026', csv: 'App,Store,GEO,Start,Week 1\nIQ Option,GooglePlay,Viet Nam,4.1,4.2\n' }]);
  const popup = parsePopupSnapshot('brand_name,platform_type,country_name,user_segment,show_users,close_users,accept_users,decline_users,rated_users,stars_1,stars_2,stars_3,stars_4,stars_5,avg_stars\nIQ Option,android,Vietnam,core,10,2,5,3,1,0,0,0,1,0,4\n');
  assert.equal(ratings.records[0].countryCode, 'VN');
  assert.equal(aggregatePopup(popup.records)[0].countryCode, 'VN');
});

test('synthetic popup fixture is parsed and its unmapped country is exposed', () => {
  const popup = parsePopupSnapshot(DEMO_POPUP_RAW_CSV);
  assert.equal(DEMO_SNAPSHOT_METADATA.rawRows, 5);
  assert.equal(popup.records.length, 4);
  assert.deepEqual(popup.unmapped, ['Exampleland']);
  const iqAndroid = popup.records.filter(row => row.brand === 'IQ Option' && row.store === 'GooglePlay');
  const countries = aggregatePopup(iqAndroid);
  assert.equal(iqAndroid.length, 4);
  assert.equal(countries.length, 3);
  assert.equal(countries.reduce((total, row) => total + row.show, 0), 450);
  assert.equal(countries.reduce((total, row) => total + row.accepted, 0), 246);
});

test('synthetic daily redirects are joined through the documented cutoff', () => {
  const daily = parseDailyRedirects(DEMO_POPUP_DAILY_CSV);
  assert.equal(DEMO_SNAPSHOT_METADATA.dailyRedirectRows, 9);
  assert.equal(daily.records.length, 9);
  assert.equal(daily.records.at(-1).date, '2026-07-31');
  assert.deepEqual(daily.unmapped, []);
});

test('synthetic country rates and privacy-safe feedback aggregates are available', () => {
  const rates = parsePopupCountryRates(DEMO_POPUP_RATES_CSV);
  const tickets = normalizeTicketSummary(DEMO_TICKET_SUMMARY);
  assert.equal(rates.records.length, 3);
  assert.equal(rates.unmapped.length, 0);
  assert.equal(tickets.records.length, 2);
  assert.equal(tickets.unmapped.length, 0);
  assert.equal(DEMO_SNAPSHOT_METADATA.containsPersonalData, false);
  for (const row of DEMO_TICKET_SUMMARY) {
    assert.equal('user_id' in row, false);
    assert.equal('comment' in row, false);
    assert.equal('escalation_text' in row, false);
  }
});

test('high-level popup pivot remains a visible cross-check, not a hidden override', () => {
  const iqAndroid = parsePopupHighLevelSummary(DEMO_POPUP_SUMMARY_ROWS).find(row => row.brand === 'IQ Option' && row.store === 'GooglePlay');
  assert.equal(iqAndroid.show, 450);
  assert.equal(iqAndroid.accepted, 246);
});

test('live rate-us pivot totals are normalized from the full Sheet range', () => {
  const rows = [
    [],
    ['Brand', 'Platform type', 'User Segment', 'Country', 'Saw Popup ', 'Closed Popup (at any stage, without leaving rating)', '% Closed', 'Enjoyed App (feedback sent to store)', '% Enjoyed', "Didn't enjoy app", "% Didn't", "Rated among Didn't enjoy app ", '% Rated', '1 star', '2 stars', '3 stars', '4 stars', '5 stars'],
    ['IQ Option', 'android', 'core Total', '', '100', '40', '', '50', '', '20', '', '5', '', '1', '1', '1', '1', '1'],
    ['', 'android Total', '', '', '500', '200', '', '250', '', '150', '', '20', '', '3', '2', '1', '4', '10'],
    ['IQ Option Total', '', '', '', '700', '300', '', '350', '', '200', '', '30', '', '5', '4', '3', '6', '12'],
  ];
  const parsed = parsePopupHighLevelSummary(rows);
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed[0], { brand: 'IQ Option', store: 'GooglePlay', show: 500, close: 200, accepted: 250, declined: 150, rated: 20, stars: [3, 2, 1, 4, 10] });
  assert.equal(parsed[1].store, null);
  assert.equal(parsed[1].show, 700);
});
