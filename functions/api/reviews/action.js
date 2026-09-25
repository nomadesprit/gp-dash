import { DASHBOARD_CACHE_VERSION, resolvePrivateSources } from '../../lib/source-config.js';
import { buildReviewSnapshot, planReviewDecision, planReviewUndo } from '../../lib/reviews.js';
import {
  jsonNoStore, reviewAccessToken, reviewAuthorized, reviewHostAllowed, reviewSheetRows,
  sameOriginWrite, writeReviewDecision,
} from '../../lib/google-review.js';

export async function onRequestPost(context) {
  if (!reviewHostAllowed(context.request)) return jsonNoStore({ error: 'Not found.' }, 404);
  if (!reviewAuthorized(context.request)) return jsonNoStore({ error: 'Authentication required.' }, 401);
  if (!sameOriginWrite(context.request)) return jsonNoStore({ error: 'Cross-origin writes are not allowed.' }, 403);
  const contentLength = Number(context.request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > 16_384) {
    return jsonNoStore({ error: 'Review request is too large.' }, 413);
  }
  let input;
  try {
    const body = await context.request.text();
    if (new TextEncoder().encode(body).byteLength > 16_384) {
      return jsonNoStore({ error: 'Review request is too large.' }, 413);
    }
    input = JSON.parse(body);
  }
  catch { return jsonNoStore({ error: 'Invalid review request.' }, 400); }

  try {
    if (!context.env.GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error('Server source credential is not configured');
    const source = resolvePrivateSources(context.env.PRIVATE_SOURCE_IDS_JSON).campaign;
    const token = await reviewAccessToken(context.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const snapshot = buildReviewSnapshot(await reviewSheetRows(source.id, token));
    const planInput = {
      ...input,
      reviewerEmail: context.request.headers.get('cf-access-authenticated-user-email'),
      reviewedAt: new Date().toISOString(),
    };
    const plan = input?.decision === 'undo'
      ? planReviewUndo(snapshot, planInput)
      : planReviewDecision(snapshot, planInput);
    await writeReviewDecision(source.id, token, plan);
    const cacheUrl = new URL('/api/dashboard', context.request.url);
    cacheUrl.searchParams.set('cache', DASHBOARD_CACHE_VERSION);
    await caches.default.delete(new Request(cacheUrl, { method: 'GET' })).catch(error => {
      console.error('review_cache_clear_error', { name: error?.name, message: error?.message });
    });
    return jsonNoStore({
      ok: true,
      reviewId: plan.reviewId,
      decision: plan.decision,
      status: plan.status,
      rewardEligible: plan.rewardEligible,
      userId: plan.userId,
      campaignId: plan.campaignId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Review could not be saved.';
    const expected = /not found|already been reviewed|already been undone|cannot be undone|must be|characters or fewer/i.test(message);
    console.error('review_action_error', { name: error?.name, message });
    return jsonNoStore({ error: expected ? message : 'Review could not be saved.' }, expected ? 409 : 503);
  }
}
