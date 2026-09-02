import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractUserIds, parseCsv } from '../js/adapters/csv.js';

test('CSV parser supports quoted commas', () => {
  const rows = parseCsv('country,rating\n"Venezuela, Bolivarian Republic of",4.7\n');
  assert.equal(rows[1][0], 'Venezuela, Bolivarian Republic of');
});

test('detects user IDs in a non-first column and deduplicates them', async () => {
  const csv = await readFile(new URL('./fixtures/user_ids_non_first.csv', import.meta.url), 'utf8');
  const result = extractUserIds(csv);
  assert.equal(result.column, 2);
  assert.equal(result.header, 'user_id');
  assert.deepEqual(result.ids, ['98124567', '98124568']);
  assert.deepEqual(result.inputIds, ['98124567', '98124568', '98124567']);
});

test('headerless user-ID files keep the first row', () => {
  const result = extractUserIds('10001\n10002\n');
  assert.equal(result.header, null);
  assert.deepEqual(result.ids, ['10001', '10002']);
  assert.deepEqual(result.inputIds, ['10001', '10002']);
});
