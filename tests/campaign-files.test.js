import test from 'node:test';
import assert from 'node:assert/strict';
import { toCsv } from '../js/campaign-files.js';

test('mailing CSV contains only USERID and the full personalized URL', () => {
  const csv = toCsv(['USERID', 'UPLOAD_URL'], [
    ['001234', 'https://uploader.example/u/opaque-token'],
  ]);
  assert.equal(csv, 'USERID,UPLOAD_URL\r\n001234,https://uploader.example/u/opaque-token\r\n');
  assert.equal(csv.includes('UPLOAD_TOKEN'), false);
});

test('exclusions CSV safely quotes fields', () => {
  assert.equal(
    toCsv(['USERID', 'REASON'], [['user-1', 'reason,with comma']]),
    'USERID,REASON\r\nuser-1,"reason,with comma"\r\n',
  );
});
