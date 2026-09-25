import { resolvePrivateSources } from '../../lib/source-config.js';
import { buildReviewSnapshot } from '../../lib/reviews.js';
import {
  jsonNoStore, reviewAccessToken, reviewAuthorized, reviewHostAllowed, reviewSheetRows,
} from '../../lib/google-review.js';

const DISPLAYABLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function onRequestGet(context) {
  if (!reviewHostAllowed(context.request)) return jsonNoStore({ error: 'Not found.' }, 404);
  if (!reviewAuthorized(context.request)) return jsonNoStore({ error: 'Authentication required.' }, 401);
  const reviewId = new URL(context.request.url).searchParams.get('submission') || '';
  if (!reviewId) return jsonNoStore({ error: 'Submission is required.' }, 400);
  try {
    if (!context.env.GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error('Server source credential is not configured');
    const source = resolvePrivateSources(context.env.PRIVATE_SOURCE_IDS_JSON).campaign;
    const token = await reviewAccessToken(context.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const snapshot = buildReviewSnapshot(await reviewSheetRows(source.id, token));
    const submission = snapshot.submissions.find(row =>
      row.submission_id === reviewId && row.status === 'pending_verification');
    if (!submission?.drive_file_id) return jsonNoStore({ error: 'Screenshot was not found.' }, 404);
    const media = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(submission.drive_file_id)}?alt=media&supportsAllDrives=true`,
      { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) },
    );
    const contentType = (media.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!media.ok) throw new Error(`Drive image request failed (${media.status})`);
    if (!DISPLAYABLE_IMAGE_TYPES.has(contentType)) {
      console.error('review_image_type_error', { contentType: contentType || 'missing' });
      return jsonNoStore({ error: 'The submitted file is not a supported image.' }, 415);
    }
    return new Response(media.body, {
      headers: {
        'content-type': contentType,
        'cache-control': 'private, no-store, max-age=0',
        'content-security-policy': "default-src 'none'",
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      },
    });
  } catch (error) {
    console.error('review_image_error', { name: error?.name, message: error?.message });
    return jsonNoStore({ error: 'Screenshot is temporarily unavailable.' }, 503);
  }
}
