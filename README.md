# GP Dash

Production decision dashboard for AppFollow ratings, popup health, campaign progress, download-volume prioritization, and five-star rating targets and download-based email plans. The interface uses a light navy/blue decision-console theme and links back to the protected ORM home.

Production: `https://gp-dash.pages.dev/` (Cloudflare Access protected).

## Run and verify locally

```sh
npm test
npm run serve
```

Open `http://localhost:4173`. A plain static server cannot execute the Pages Function, so the browser visibly falls back to a small synthetic demo fixture. Every demo value is invented test data and is labeled as such; no workbook-derived fallback payload is committed.

The automated suite covers:

- rightmost AppFollow weekly values and cross-month history;
- period, country, threshold, volume, and ISO-normalization calculations;
- five-star target and email formulas, rounding, missing/zero downloads and already-met targets;
- 30-day download run-rate estimates, legacy forecast math and campaign pace projection;
- full popup adapters and source cross-checks;
- server-side feedback and campaign aggregation without personal fields;
- live API row-array contracts and freshness windows;
- CSV user-ID detection when the ID column is not first.

## Production source architecture

The browser calls the same-origin `GET /api/dashboard`. A Cloudflare Pages Function authenticates to Google with the encrypted `GOOGLE_SERVICE_ACCOUNT_JSON` secret, reads approved columns without fixed row cutoffs, sanitizes/aggregates the result, and caches the safe response for 15 minutes.

Live responses are restricted to the Access-protected production hostname. Immutable Pages preview hostnames return 404 for `/api/dashboard`. Spreadsheet IDs and the credential are encrypted Pages secrets; no Google credential, fixed workbook identifier, raw user ID, token hash, file ID, screenshot URL, review note, or private source URL is committed or present in browser configuration.

Required Google Cloud services are Google Sheets API and Google Drive API. The service account has read-only file sharing on the four source workbooks. Drive reads use Shared Drive support for the campaign tracker. The review queue validates each stored file before enabling approval and automatically rejects unsupported media so the participant can retry.

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

All monthly tabs matching `Month YYYY` are loaded. Initial load and Reset defaults select the latest available period rather than a fixed historical month. The current rating is the rightmost non-empty weekly value for each app/store/GEO row. The `Apps` tab is also read as the mapping contract.

The operational expectation is one update every Friday. Freshness is shown from the latest available AppFollow period/weekly column, not from Google Drive `modifiedTime`, because permission changes can advance the file timestamp without changing rating data.

### Popup workbook

Production reads the whole decision-relevant workbook surface:

- `raw data` for country/store/segment funnels and popup sentiment;
- `rate us stats` for the high-level pivot cross-check;
- `Rates by Country` for popup-related star distributions;
- every tab whose first five column headers match the daily redirect schema, regardless of its title, for the redirect trend;
- a safe `feedback tickets` range that excludes user ID and free text, then aggregates country/segment counts server-side.

The raw popup snapshot has no time column and is always labeled undated. The source is manually updated monthly. Daily redirect coverage is derived from all matching tabs. Workbook modification dates are shown separately from observation coverage: an October upload may contain September events. Mixed periods and undated raw snapshots are never presented as a same-period historical comparison.

“Accepted” means redirected to the store. It does not prove an external-store rating. Popup stars remain in-product sentiment.

### Download volume

The `ratings_cache` tab supplies country-level month-to-date Google Play new installs. The dashboard derives the explicitly labeled weekly run rate as:

```text
monthly_new_installs / elapsed_days_in_month × 7
```

Source coverage and staleness are derived from the actual `As Of Date` values. The minimum-weekly-download slider controls the attention queue and all overview KPIs; setting it to zero includes countries with missing volume.

Install/download volume remains a prioritization signal. By explicit user request, downloads × 3% also supplies an assumed country rating count in the target model; this is never labeled an observed count.

### Rating target & email plan

The selected country now has two independent calculations; the popup plan and mixed channel inputs have been removed from this UI.

- Additional five-star ratings: `ceil(X × (T − R) / (5 − T))`, or zero if the current rating already meets the target (default 4.2). X = D × 3% is the assumed country rating count because the source does not provide an actual count. This assumes a simple average and all additional ratings are five stars. A target of exactly 5 is unreachable from below with a finite number of ratings.
- Emails: `ceil((D × 0.03) / (0.01 × 0.8)) = ceil(D × 3.75)`, following the user's planning rule. This calculation is independent of current rating and target; it must not be represented as solving the rating gap.
- D defaults to a clearly labeled 30-day run-rate from MTD installs divided by the source day-of-month, multiplied by 30 and rounded. The user may enter an exact rolling 30-day total or restore the source estimate. Source dates remain visible. Missing downloads stay missing; zero downloads produce zero emails.
- Inputs are scoped to country/store/brand/reporting period in memory. Empty country selections clear the model rather than retaining another country's results.

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

The Access-protected **Screenshot review & reward eligibility** queue reads pending
submissions directly from the private tracker and streams each screenshot through
a same-origin Pages Function. Raw Drive file IDs and URLs are never sent to browser
JavaScript. An approval writes `successful` to both the submission and the current
participant, records `reward_eligible=yes`, the review timestamp, notes, and the
Cloudflare Access reviewer identity, and permanently excludes that participant
from later campaign preparation. A rejection writes `rejected` and
`reward_eligible=no` to both records, leaving the active link retryable until its
expiry. The submission row, participant row, and campaign counters are written
in one Sheets batch request. Review decisions save immediately without a browser
confirmation dialog. The latest decision can be undone from the queue, which
returns the submission and participant to pending and reverses the campaign
counters and reward eligibility in another atomic batch update.

Approved-user export is campaign scoped. The download remains unavailable while
that campaign has `pending_verification` submissions and contains only one
`USERID` column with approved IDs. Reward processing remains an internal operation;
the dashboard does not grant or send rewards.

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
cohort panel and exposes its pending screenshots only inside the Access-protected
review queue. TEST has no AppFollow rating row and is excluded from production
campaign totals and rating forecasts. Existing smoke-test campaign IDs remain
excluded. Preparing a pilot uses real account IDs and the uploader's global
participation checks, so accounts with pending or successful submissions may
be ineligible for later campaigns until the tracker is reviewed.

Campaign pace forecasting activates only when audience, valid dates, and observed submissions exist. It predicts screenshot-evidence completion at observed pace; it never infers external-store ratings.

## Planning limits

The target model uses the explicitly agreed proxy X = 30-day downloads × 3%, because actual country rating counts are absent from the connected data. Both the assumed count and the MTD-derived 30-day download estimate are labeled in the UI. This simple-average scenario is not a precise prediction of the store's displayed rating. Popup sentiment and accepted screenshots are not used in either calculation.

The email rule is deliberately independent of the rating gap. For example, 10,000 downloads gives X = 300 and 37,500 planned emails; moving from 4.0 to 4.2 requires 75 additional five-star ratings under the same proxy. A country already above target requires zero additional ratings, while the requested email planning rule still returns 37,500.

## Deployment and credential handling

Cloudflare Pages deploys the static assets and `functions/` bundle together. The production hostname is protected by Cloudflare Access. JavaScript and CSS use revalidation headers; the API response uses a 15-minute server cache.

The service-account JSON is stored only as the encrypted `GOOGLE_SERVICE_ACCOUNT_JSON` Pages secret. The four workbook identifiers are stored only as the encrypted `PRIVATE_SOURCE_IDS_JSON` Pages secret, using keys `appFollow`, `popup`, `volume`, and `campaign`. The service account needs Editor access to the campaign tracker so review decisions can be saved, plus Viewer access to the private Shared Drive screenshot folder so the review queue can stream uploaded images. Never put either secret, a service-account JSON, `.dev.vars`, `.env`, workbook export, or user export in this directory or a deployment bundle.

The campaign proxy also requires the encrypted `UPLOADER_ADMIN_API_KEY` Pages
secret. Its matching `ADMIN_API_KEY` is configured on Cloud Run. Neither value
is present in source or browser assets.
