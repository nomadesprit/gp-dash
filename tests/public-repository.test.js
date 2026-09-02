import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolvePrivateSources } from '../functions/lib/source-config.js';

test('private source identifiers resolve only from the runtime secret', () => {
  const ids = {
    appFollow: 'demo_appfollow_identifier', popup: 'demo_popup_identifier',
    volume: 'demo_volume_identifier', campaign: 'demo_campaign_identifier',
  };
  const sources = resolvePrivateSources(JSON.stringify(ids));
  assert.equal(sources.appFollow.id, ids.appFollow);
  assert.throws(() => resolvePrivateSources(''), /invalid/);
  assert.throws(() => resolvePrivateSources('{}'), /incomplete/);
});

test('public repository carries only the synthetic browser fixture', async () => {
  const dataFiles = await readdir(new URL('../js/data/', import.meta.url));
  assert.deepEqual(dataFiles.sort(), ['fixture.js']);
  const fixture = await readFile(new URL('../js/data/fixture.js', import.meta.url), 'utf8');
  assert.match(fixture, /entirely synthetic/i);
  assert.doesNotMatch(fixture, /sanitized workbook/i);
});

test('server source configuration contains no fixed workbook identifier', async () => {
  const source = await readFile(new URL('../functions/lib/source-config.js', import.meta.url), 'utf8');
  assert.match(source, /PRIVATE_SOURCE_IDS_JSON/);
  assert.doesNotMatch(source, /\bid\s*:\s*['"][A-Za-z0-9_-]{20,}['"]/);
});
