# GP Dash

Production decision dashboard for AppFollow ratings, popup health, campaign progress, download-volume prioritization, and rating-neutral forecast scenarios. The interface uses a light navy/blue decision-console theme and links back to the protected ORM home.

Production: `https://gp-dash.pages.dev/` (Cloudflare Access protected).

## Run and verify locally

```sh
npm test
npm run serve
```

Open `http://localhost:4173`. A plain static server cannot execute the Pages Function, so the browser visibly falls back to a small synthetic demo fixture. Every demo value is invented test data and is labeled as such; no workbook-derived fallback payload is committed.

The automated suite currently has 37 tests covering:

- rightmost AppFollow weekly values and cross-month history;
- period, country, threshold, volume, and ISO-normalization calculations;
- the forecast-unavailable guard when effective rating count `N` is absent;
- mixed-channel forecast math and campaign pace projection;
- full popup adapters and source cross-checks;
- server-side feedback and campaign aggregation without personal fields;
- live API row-array contracts and freshness windows;
- CSV user-ID detection when the ID column is not first.

## Production source architecture

The browser calls the same-origin `GET /api/dashboard`. A Cloudflare Pages Function authenticates to Google with the encrypted `GOOGLE_SERVICE_ACCOUNT_JSON` secret, reads fixed bounded ranges, sanitizes/aggregates the result, and caches the safe response for 15 minutes.

Live responses are restricted to the Access-protected production hostname. Immutable Pages preview hostnames return 404 for `/api/dashboard`. Spreadsheet IDs and the credential are encrypted Pages secrets; no Google credential, fixed workbook identifier, raw user ID, token hash, file ID, screenshot URL, review note, or private source URL is committed or present in browser configuration.

Required Google Cloud services are Google Sheets API and Google Drive API. The service account has read-only file sharing on the four source workbooks. Drive reads use Shared Drive support for the campaign tracker.

Key files:

- `functions/lib/source-config.js` — public range/cadence rules plus runtime resolution of encrypted source identifiers.
- `functions/api/dashboard.js` — service-account JWT exchange, Google API reads, caching, hostname restriction, and safe API contract.
- `functions/lib/server-data.js` — feedback aggregation, campaign/tracker joins, test-row exclusion, and intrinsic freshness calculations.
- `js/config.js` — public UI defaults and intentionally blank forecast assumptions; no private Sheet IDs.
- `js/source-loader.js` — same-origin live API adapter plus visibly labeled synthetic demo fallback.
- `js/adapters/` — source-specific parsing and normalization boundaries.
- `js/calculations.js` — pure rating forecast and campaign pace functions.
- `js/app.js` — state, filtering, and rendering.

## Source semantics and cadence

### AppFollow

All monthly tabs matching `Month YYYY` are loaded, currently January 2025 through August 2026. The current rating is the rightmost non-empty weekly value for each app/store/GEO row. The `Apps` tab is also read as the mapping contract.

The operational expectation is one update every Friday. Freshness is shown from the latest available AppFollow period/weekly column, not from Google Drive `modifiedTime`, because permission changes can advance the file timestamp without changing rating data.

### Popup workbook

Production reads the whole decision-relevant workbook surface:

- `raw data` for country/store/segment funnels and popup sentiment;
- `rate us stats` for the high-level pivot cross-check;
- `Rates by Country` for popup-related star distributions;
- every `Daily count of users redirected to store ...` tab for the redirect trend;
- a safe `feedback tickets` range that excludes user ID and free text, then aggregates country/segment counts server-side.

The raw popup snapshot has no time column and is always labeled undated. The source is manually updated monthly. Daily redirects currently end on 2026-07-31, so they are visibly lagged against August AppFollow data and are never presented as a same-period historical comparison.

“Accepted” means redirected to the store. It does not prove an external-store rating. Popup stars remain in-product sentiment.

### Download volume

The `ratings_cache` tab supplies country-level month-to-date Google Play new installs. The dashboard derives the explicitly labeled weekly run rate as:

```text
monthly_new_installs / elapsed_days_in_month × 7
```

The current source is dated through 2026-07-29 and is therefore visibly stale relative to August AppFollow. The minimum-weekly-download slider controls the attention queue and all overview KPIs; setting it to zero includes countries with missing volume.

Install/download volume is a prioritization signal, never a rating weight or substitute for effective rating count `N`.

## Campaign workflow

The Screenshot Upload Participation Tracker now contains a validated `Campaigns` registry with this schema:

```text
campaign_id, name, brand, store, country, status, start_date, end_date,
audience_size, emails_sent, delivered, evidence_submissions, pending_review,
approved, rejected, rewards_granted, verified_review_count, source_updated_at
```

The registry is connected but currently empty. Production campaign progress begins when one row is added with the exact uploader `campaign_id`, brand, store, country, status, dates, and operational counts. Tracker participants/submissions are then joined server-side. IDs containing `test` or `smoke` and unassigned rows are excluded.

Tracker mappings are conservative:

- `pending_verification` → pending evidence check;
- `successful` → accepted campaign evidence, not a proven external-store rating;
- `blocked`/`rejected` → blocked or rejected evidence;
- `retention_deleted_at` → retention deletion recorded.

The Access-protected **Launch Campaign** dialog accepts a Metabase USERID CSV,
detects the ID column, and sends the rows to a same-origin Pages Function only
after the operator confirms preparation. The Function calls the uploader's
authenticated admin endpoint with a server-only secret. The uploader performs
the authoritative global duplicate check, stores token hashes and the campaign
registry row, and returns a mailing-ready `USERID,UPLOAD_URL` CSV plus an
exclusions CSV. Raw IDs and personalized links remain in the browser only long
enough to download the files and are never included in the dashboard API.
Eligibility and rewards remain independent of whether a rating is left and of
its value.

For an internal upload-flow pilot, choose **Test cohort (TEST)** as the campaign
country and use a normal campaign ID without the reserved `test` or `smoke`
segments (for example, `pilot_20260917`). The uploader still issues the same
personal secure links and writes to the private tracker. The dashboard shows
aggregate link, submission, pending, and accepted counts in a separate Test
cohort panel. TEST has no AppFollow rating row and is excluded from production
campaign totals and rating forecasts. Existing smoke-test campaign IDs remain
excluded. Preparing a pilot uses real account IDs and the uploader's global
participation checks, so accounts with pending or successful submissions may
be ineligible for later campaigns until the tracker is reviewed.

Campaign pace forecasting activates only when audience, valid dates, and observed submissions exist. It predicts screenshot-evidence completion at observed pace; it never infers external-store ratings.

## Forecast contract and remaining production gap

The dashboard deliberately refuses to fabricate a precise rating target. A precise production forecast requires a per-country/store effective rating count aligned with the displayed AppFollow rating. The existing Google Play install/cache workbook does not provide that count.

For one channel where expected external score `S > T`, the calculation is:

```text
ceil(N × (T − R) / (S − T))
```

Mixed popup and campaign plans estimate expected verified ratings separately, then solve only the remaining gap. Redirect-to-verified-review rates, campaign verification rates, and external-store scores must be independently defensible. Popup sentiment and accepted screenshots are never substituted for those measures.

Exact next inputs:

1. A per-country/store effective rating-count source aligned with AppFollow's displayed rating definition. If Google Play Console does not automate it, use a reviewed country-level Ratings export or another auditable backend source.
2. A prepared production campaign from the Launch Campaign workflow (this now
   creates the connected `Campaigns` row automatically).

Without item 1, the forecast remains unavailable or explicitly assumption-driven. Without a launched campaign, campaign progress correctly stays empty.

## Deployment and credential handling

Cloudflare Pages deploys the static assets and `functions/` bundle together. The production hostname is protected by Cloudflare Access. JavaScript and CSS use revalidation headers; the API response uses a 15-minute server cache.

The service-account JSON is stored only as the encrypted `GOOGLE_SERVICE_ACCOUNT_JSON` Pages secret. The four workbook identifiers are stored only as the encrypted `PRIVATE_SOURCE_IDS_JSON` Pages secret, using keys `appFollow`, `popup`, `volume`, and `campaign`. Never put either secret, a service-account JSON, `.dev.vars`, `.env`, workbook export, or user export in this directory or a deployment bundle.

The campaign proxy also requires the encrypted `UPLOADER_ADMIN_API_KEY` Pages
secret. Its matching `ADMIN_API_KEY` is configured on Cloud Run. Neither value
is present in source or browser assets.
