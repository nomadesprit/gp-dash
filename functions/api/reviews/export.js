import { resolvePrivateSources } from '../../lib/source-config.js';
import { approvedUsersCsv, approvedUsersForCampaign, buildReviewSnapshot } from '../../lib/reviews.js';
import {
  jsonNoStore, reviewAccessToken, reviewAuthorized, reviewHostAllowed, reviewSheetRows,
} from '../../lib/google-review.js';

function filename(campaignId) {
  const safe = String(campaignId || '').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 80) || 'campaign';
  return `approved-users-${safe}.csv`;
}

export async function onRequestGet(context) {
  if (!reviewHostAllowed(context.request)) return jsonNoStore({ error: 'Not found.' }, 404);
  if (!reviewAuthorized(context.request)) return jsonNoStore({ error: 'Authentication required.' }, 401);
  const campaignId = new URL(context.request.url).searchParams.get('campaign') || '';
  try {
    if (!context.env.GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error('Server source credential is not configured');
    const source = resolvePrivateSources(context.env.PRIVATE_SOURCE_IDS_JSON).campaign;
    const token = await reviewAccessToken(context.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const snapshot = buildReviewSnapshot(await reviewSheetRows(source.id, token));
    const userIds = approvedUsersForCampaign(snapshot, campaignId);
    return new Response(approvedUsersCsv(userIds), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename(campaignId)}"`,
        'cache-control': 'no-store, max-age=0',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Approved users could not be exported.';
    const expected = /choose a campaign|still need review/i.test(message);
    return jsonNoStore({ error: expected ? message : 'Approved users could not be exported.' }, expected ? 409 : 503);
  }
}
