import { resolvePrivateSources } from '../../lib/source-config.js';
import { buildReviewSnapshot } from '../../lib/reviews.js';
import {
  jsonNoStore, reviewAccessToken, reviewAuthorized, reviewHostAllowed, reviewSheetRows,
} from '../../lib/google-review.js';

export async function onRequestGet(context) {
  if (!reviewHostAllowed(context.request)) return jsonNoStore({ error: 'Not found.' }, 404);
  if (!reviewAuthorized(context.request)) return jsonNoStore({ error: 'Authentication required.' }, 401);
  try {
    if (!context.env.GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error('Server source credential is not configured');
    const source = resolvePrivateSources(context.env.PRIVATE_SOURCE_IDS_JSON).campaign;
    const token = await reviewAccessToken(context.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const snapshot = buildReviewSnapshot(await reviewSheetRows(source.id, token));
    return jsonNoStore({
      generatedAt: new Date().toISOString(),
      campaigns: snapshot.campaigns,
      items: snapshot.items.map(item => ({
        ...item,
        imageUrl: item.imageAvailable
          ? `/api/reviews/image?submission=${encodeURIComponent(item.reviewId)}`
          : '',
      })),
    });
  } catch (error) {
    console.error('review_queue_error', { name: error?.name, message: error?.message });
    return jsonNoStore({ error: 'The review queue is temporarily unavailable.' }, 503);
  }
}
