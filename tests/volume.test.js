import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMinimumWeeklyDownloads, estimateWeeklyDownloads, parseVolumeSnapshot } from '../js/adapters/volume.js';

test('derives a labeled weekly run rate from month-to-date installs', () => {
  assert.equal(estimateWeeklyDownloads(2900, '2026-07-29'), 700);
  assert.equal(estimateWeeklyDownloads('', '2026-07-29'), null);
  assert.equal(estimateWeeklyDownloads(2900, ''), null);
});

test('prefers an exact weekly value when the adapter receives one', () => {
  const csv = `Package,Country,Monthly New Installs,Weekly Downloads,As Of Date,Fetched At
com.iqoption,Viet Nam,4350,1234,2026-07-29,2026-08-11`;
  const parsed = parseVolumeSnapshot(csv, { packageBrandMap: { 'com.iqoption': 'IQ Option' }, defaultStore: 'GooglePlay' });
  assert.equal(parsed.records[0].countryCode, 'VN');
  assert.equal(parsed.records[0].weeklyDownloads, 1234);
  assert.equal(parsed.records[0].weeklyDownloadsExact, true);
});

test('accepts live Sheets API row arrays without a CSV round trip', () => {
  const rows = [
    ['Package', 'Country', 'Monthly New Installs', 'As Of Date', 'Fetched At'],
    ['com.iqoption', 'Venezuela, Bolivarian Republic of', '3100', '2026-07-31', '2026-08-07'],
  ];
  const parsed = parseVolumeSnapshot(rows, { packageBrandMap: { 'com.iqoption': 'IQ Option' }, defaultStore: 'GooglePlay' });
  assert.equal(parsed.records[0].countryCode, 'VE');
  assert.equal(parsed.records[0].weeklyDownloads, 700);
  assert.equal(parsed.records[0].weeklyDownloadsExact, false);
});

test('minimum download filter excludes low and unknown volume above zero', () => {
  const records = [{ countryCode: 'AR' }, { countryCode: 'BR' }, { countryCode: 'ID' }];
  const volumes = new Map([['AR', { weeklyDownloads: 1500 }], ['BR', { weeklyDownloads: 400 }]]);
  const lookup = record => volumes.get(record.countryCode);
  assert.deepEqual(applyMinimumWeeklyDownloads(records, 500, lookup).map(row => row.countryCode), ['AR']);
  assert.deepEqual(applyMinimumWeeklyDownloads(records, 0, lookup).map(row => row.countryCode), ['AR', 'BR', 'ID']);
});
