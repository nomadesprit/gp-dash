export const CONFIG = {
  defaults: {
    brand: 'IQ Option',
    store: 'GooglePlay',
    country: 'all',
    period: 'August 2026',
    target: 4.2,
    minWeeklyDownloads: 500,
  },
  sources: {
    appFollow: {
      label: 'IQ Option | AppFollow ratings report',
      cadence: 'Weekly · expected Friday',
      reviewCountAvailable: false,
    },
    popup: {
      label: 'Rate us stats',
      cadence: 'Monthly · manual update',
      rawSnapshotDate: null,
    },
    volume: {
      label: 'Google Play ratings/install cache',
      // The private workbook and its service-account access stay server-side.
      // A future proxy may supply the adapter contract without changing the UI.
      clientUrl: null,
      packageBrandMap: { 'com.iqoption': 'IQ Option' },
      defaultStore: 'GooglePlay',
      sourceMetric: 'Monthly New Installs',
      displayedMetric: 'Estimated weekly downloads',
      derivation: 'month-to-date new installs / elapsed days × 7',
      exactWeeklyAvailable: false,
      slider: { min: 0, max: 25000, step: 250 },
    },
    campaign: {
      connected: true,
      sourceType: 'google-drive-participation-tracker',
      // The tracker Sheet and screenshot folder remain private and server-side.
      // Only this public uploader origin and sanitized aggregates reach clients.
      publicUploaderUrl: 'https://screenshot-uploader-411532504647.europe-west1.run.app',
      clientUrl: null,
      retentionDays: 90,
      schema: [
        'campaign_id', 'name', 'brand', 'store', 'country', 'status',
        'start_date', 'end_date', 'audience_size', 'emails_sent', 'delivered',
        'evidence_submissions', 'pending_review', 'approved', 'rejected',
        'rewards_granted', 'verified_review_count', 'source_updated_at',
      ],
      aggregateSchema: ['campaign_id', 'status counts', 'language counts', 'created/submitted/reviewed date bounds', 'retention deletion counts'],
    },
  },
  runtime: {
    // Same-origin Pages Function. Private spreadsheet IDs and credentials live
    // only in server-side function configuration and encrypted secrets.
    serverApiUrl: '/api/dashboard',
    fixtureFallback: true,
  },
  forecast: {
    // Intentionally blank: the supplied sources do not contain defensible values.
    effectiveRatingCount: null,
    popupRedirectToVerifiedRate: null,
    popupExpectedExternalScore: null,
    campaignVerificationRate: null,
    campaignExpectedExternalScore: null,
    confidence: 'unavailable',
  },
};
