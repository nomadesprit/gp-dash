import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { buildDashboardPayload } from '../functions/api/dashboard.js';
import { combineDailyRedirects, isDailyRedirectHeader } from '../functions/lib/source-coverage.js';
import { parseDailyRedirects } from '../js/adapters/popup.js';

const header = ['event_date', 'brand_name', 'country_name', 'platform_type', 'users_redirected_to_store'];
test('daily schema discovery handles reordered headers and rejects unrelated sheets', () => {
  assert.equal(isDailyRedirectHeader(['User ID', ...header.slice(1)]), false);
  assert.equal(isDailyRedirectHeader(), false);
  const reordered = ['country_name', 'event_date', 'users_redirected_to_store', 'platform_type', 'brand_name'];
  assert.deepEqual(combineDailyRedirects([[reordered, ['Greece', '2026-09-30', '7', 'android', 'IQ Option']]]),
    [header, ['2026-09-30', 'IQ Option', 'Greece', 'android', '7']]);
});

test('renamed monthly exports, future tabs and rows beyond 1000 reach the API with no private columns', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: {type: 'pkcs8', format: 'pem'}, publicKeyEncoding: {type: 'spki', format: 'pem'} });
  const ids = {appFollow: 'demo_appfollow_identifier', popup: 'demo_popup_identifier', volume: 'demo_volume_identifier', campaign: 'demo_campaign_identifier'};
  const titles = ['raw data', 'Rates by Country', 'rate us stats', 'feedback tickets', 'Daily count of users redirected to store july 2026', ' august 2026', 'september 2026', 'next export'];
  const daily = titles.slice(4);
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(input); let body;
    if(url.hostname === 'oauth2.googleapis.com') body = {access_token: 'synthetic-test-token'};
    else if(url.hostname === 'www.googleapis.com') body = {modifiedTime: '2026-10-04T09:00:00Z'};
    else if(!url.pathname.endsWith('values:batchGet')) body = {sheets: (url.pathname.includes(ids.popup) ? titles : ['Apps','August 2026','October 2026']).map(title=>({properties:{title}}))};
    else {
      const ranges = url.searchParams.getAll('ranges'); requests.push(...ranges);
      body = {valueRanges: ranges.map(range=>{
        const title = range.match(/^'(.+)'!/)[1]; let values = [];
        if(daily.includes(title)) values = range.endsWith('A1:E1') ? [header] : [header, ...Array.from({length:1001},()=>['2026-09-30','IQ Option','Greece','android','1'])];
        else if(range === "'feedback tickets'!B:H") values = [['brand_name','country_name','user_segment','ticket_message_created_ts','ticket_message_locale','ticket_message_language','star_rate'],['IQ Option','Greece','core','2026-09-30','','en','3']];
        else if(title.endsWith('2026')) values = [['App','Store','GEO','Start'],['IQ Option','GooglePlay','Greece','4.3']];
        return {values};
      })};
    }
    return Response.json(body);
  };
  try {
    const payload = await buildDashboardPayload(JSON.stringify({client_email:'test@example.invalid',private_key:privateKey}),JSON.stringify(ids));
    assert.equal(payload.sourceMetadata.appFollow.latestPeriod, 'October 2026');
    assert.equal(payload.sourceMetadata.popup.dailyRedirectTabCount, 4);
    assert.equal(payload.sourceMetadata.popup.dailyRedirectThrough, '2026-09-30');
    assert.equal(payload.snapshotMetadata.dailyRedirectRows, 4004);
    assert.equal(payload.ticketSummary[0].ticketCount, 1);
    assert.equal(parseDailyRedirects(payload.popupDailyRows).records.length, 4004);
    assert.ok(requests.includes("' august 2026'!A:E"));
    assert.ok(requests.includes("'next export'!A:E"));
    assert.ok(requests.includes("'October 2026'!A:Z"));
    assert.ok(requests.includes("'feedback tickets'!B:H"));
    assert.equal(requests.some(range=>range.endsWith('1000')), false);
    assert.equal(JSON.stringify(payload).includes('synthetic-test-token'), false);
    assert.equal(JSON.stringify(payload).includes('demo_popup_identifier'), false);
  } finally {globalThis.fetch = originalFetch;}
});

test('new monthly popup countries survive normalization', () => {
  const countries = ['Antarctica','Finland','Greece','Grenada','Aruba','Gabon','Gambia','Hungary'];
  const result = parseDailyRedirects([header,...countries.map(country=>['2026-09-30','IQ Option',country,'android','1'])]);
  assert.equal(result.records.length, 8);
  assert.deepEqual(result.unmapped, []);
  assert.deepEqual(result.records.map(row=>row.countryCode), ['AQ','FI','GR','GD','AW','GA','GM','HU']);
});
