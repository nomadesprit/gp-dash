import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCampaignRequest } from '../functions/lib/campaign-prepare.js';
import { onRequestPost } from '../functions/api/campaigns/prepare.js';

const body = {
  campaign: {
    campaignId: 'iq_br_2026_08', name: 'Brazil August', brand: 'IQ Option',
    store: 'GooglePlay', country: 'BR', startDate: '2026-08-12', endDate: '2026-08-31',
  },
  userIds: ['10001', '10002'],
};

test('campaign proxy validation accepts only bounded campaign payloads', () => {
  assert.deepEqual(validateCampaignRequest(body).userIds, ['10001', '10002']);
  assert.throws(() => validateCampaignRequest({ campaign: body.campaign, userIds: [] }));
  assert.throws(() => validateCampaignRequest({ campaign: body.campaign, userIds: Array(5001).fill('1') }));
});

test('campaign proxy keeps the uploader secret server-side', async () => {
  const previousFetch = globalThis.fetch;
  let upstreamHeaders;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://uploader.example/api/admin/campaigns/prepare');
    upstreamHeaders = options.headers;
    return Response.json({ ok: true, eligibleCount: 2, mailingRows: [] }, { status: 201 });
  };
  try {
    const response = await onRequestPost({
      request: new Request('https://gp-dash.pages.dev/api/campaigns/prepare', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      }),
      env: { UPLOADER_ADMIN_API_KEY: 'server-secret', UPLOADER_API_URL: 'https://uploader.example' },
    });
    assert.equal(response.status, 201);
    assert.equal(upstreamHeaders['x-admin-api-key'], 'server-secret');
    assert.equal(JSON.stringify(await response.json()).includes('server-secret'), false);
    assert.match(response.headers.get('cache-control'), /no-store/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
