import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('dashboard shell retains every renderer target', async () => {
  const [html, app] = await Promise.all([
    readFile(new URL('index.html', root), 'utf8'),
    readFile(new URL('js/app.js', root), 'utf8'),
  ]);
  const targets = [...app.matchAll(/\$\('#([a-z0-9-]+)'\)/g)].map(match => match[1]);
  for (const id of new Set(targets)) assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
});

test('light theme implements the supplied typography and semantic tokens', async () => {
  const [html, css] = await Promise.all([
    readFile(new URL('index.html', root), 'utf8'),
    readFile(new URL('css/styles.css', root), 'utf8'),
  ]);
  assert.match(html, /Plus\+Jakarta\+Sans/);
  assert.match(html, /IBM\+Plex\+Mono/);
  for (const token of ['#F0F4FA', '#FFFFFF', '#0A1F44', '#2563EB', '#059669', '#DC2626', '#D97706', '#7C3AED']) {
    assert.ok(css.includes(token), `missing theme token ${token}`);
  }
  assert.match(css, /grid-template-columns:repeat\(7,/);
  assert.match(css, /border-left:3px solid var\(--warning\)/);
  assert.match(css, /position:sticky/);
});
