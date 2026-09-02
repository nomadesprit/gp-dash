import {
  MAX_CAMPAIGN_BODY_BYTES,
  jsonNoStore,
  validateCampaignRequest,
} from '../../lib/campaign-prepare.js';

const ALLOWED_HOSTS = new Set(['gp-dash.pages.dev', 'localhost', '127.0.0.1']);
const DEFAULT_UPLOADER_URL = 'https://screenshot-uploader-411532504647.europe-west1.run.app';

export async function onRequestPost(context) {
  const hostname = new URL(context.request.url).hostname;
  if (!ALLOWED_HOSTS.has(hostname)) return jsonNoStore({ error: 'Not found.' }, 404);
  const contentLength = Number(context.request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_CAMPAIGN_BODY_BYTES) {
    return jsonNoStore({ error: 'Campaign file is too large.' }, 413);
  }
  if (!context.env.UPLOADER_ADMIN_API_KEY) {
    return jsonNoStore({ error: 'Campaign preparation is not configured.' }, 503);
  }

  let body;
  try {
    body = validateCampaignRequest(await context.request.json());
  } catch (error) {
    return jsonNoStore({ error: error instanceof Error ? error.message : 'Invalid campaign request.' }, 400);
  }

  try {
    const baseUrl = String(context.env.UPLOADER_API_URL || DEFAULT_UPLOADER_URL).replace(/\/$/, '');
    const upstream = await fetch(`${baseUrl}/api/admin/campaigns/prepare`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-admin-api-key': context.env.UPLOADER_ADMIN_API_KEY,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await upstream.json();
    return jsonNoStore(payload, upstream.status);
  } catch (error) {
    console.error(JSON.stringify({
      message: 'campaign_prepare_proxy_failed',
      error: error instanceof Error ? error.message : String(error),
    }));
    return jsonNoStore({ error: 'Campaign preparation is temporarily unavailable.' }, 502);
  }
}
