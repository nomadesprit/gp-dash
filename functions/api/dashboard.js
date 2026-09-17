import { resolvePrivateSources, SOURCE_CACHE_SECONDS } from '../lib/source-config.js';
import { freshness, latestDate, summarizeCampaignTracker, summarizeFeedback } from '../lib/server-data.js';

const encoder = new TextEncoder();
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
].join(' ');
const CACHE_VERSION = 'test-cohort-v1';
const ALLOWED_HOSTS = new Set(['gp-dash.pages.dev', 'localhost', '127.0.0.1']);

function base64Url(value) {
  const bytes = typeof value === 'string' ? encoder.encode(value) : new Uint8Array(value);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function privateKeyBytes(pem) {
  const base64 = String(pem || '').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const binary = atob(base64);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function googleAccessToken(secret) {
  const credentials = JSON.parse(secret);
  if (!credentials.client_email || !credentials.private_key) throw new Error('Service account secret is incomplete');
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: GOOGLE_SCOPES,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBytes(credentials.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(signingInput));
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${signingInput}.${base64Url(signature)}`,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Google token exchange failed (${response.status})`);
  const payload = await response.json();
  if (!payload.access_token) throw new Error('Google token exchange returned no access token');
  return payload.access_token;
}

async function googleJson(url, token) {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Google source request failed (${response.status})`);
  return response.json();
}

async function sheetTitles(id, token) {
  const payload = await googleJson(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties.title`, token);
  return (payload.sheets || []).map(sheet => sheet.properties?.title).filter(Boolean);
}

async function batchValues(id, ranges, token) {
  const params = new URLSearchParams({ majorDimension: 'ROWS', valueRenderOption: 'FORMATTED_VALUE' });
  ranges.forEach(range => params.append('ranges', range));
  const payload = await googleJson(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?${params}`, token);
  return ranges.map((range, index) => ({ range, rows: payload.valueRanges?.[index]?.values || [] }));
}

async function driveMetadata(id, token) {
  return googleJson(`https://www.googleapis.com/drive/v3/files/${id}?fields=name,modifiedTime&supportsAllDrives=true`, token);
}

const quoteTitle = title => `'${String(title).replace(/'/g, "''")}'`;

async function buildDashboardPayload(secret, sourceIdSecret) {
  const privateSources = resolvePrivateSources(sourceIdSecret);
  const token = await googleAccessToken(secret);
  const [appTitles, popupTitles] = await Promise.all([
    sheetTitles(privateSources.appFollow.id, token),
    sheetTitles(privateSources.popup.id, token),
  ]);
  const monthTitles = appTitles.filter(title => privateSources.appFollow.monthPattern.test(title));
  const dailyTitles = popupTitles.filter(title => title.toLowerCase().startsWith(privateSources.popup.dailyPrefix.toLowerCase()));
  const appRanges = [privateSources.appFollow.appsRange, ...monthTitles.map(title => `${quoteTitle(title)}!A1:Z1000`)];
  const popupRanges = [
    privateSources.popup.rawRange,
    privateSources.popup.ratesRange,
    privateSources.popup.summaryRange,
    privateSources.popup.feedbackRange,
    ...dailyTitles.map(title => `${quoteTitle(title)}!A1:E1000`),
  ];

  const [appValues, popupValues, volumeValues, campaignValues, appMeta, popupMeta, volumeMeta, campaignMeta] = await Promise.all([
    batchValues(privateSources.appFollow.id, appRanges, token),
    batchValues(privateSources.popup.id, popupRanges, token),
    batchValues(privateSources.volume.id, [privateSources.volume.cacheRange], token),
    batchValues(privateSources.campaign.id, [
      privateSources.campaign.registryRange,
      ...privateSources.campaign.participantRanges,
      ...privateSources.campaign.submissionRanges,
    ], token),
    driveMetadata(privateSources.appFollow.id, token),
    driveMetadata(privateSources.popup.id, token),
    driveMetadata(privateSources.volume.id, token),
    driveMetadata(privateSources.campaign.id, token),
  ]);

  const ratingTabs = monthTitles.map((period, index) => ({ period, rows: appValues[index + 1].rows }));
  const dailyRows = popupValues.slice(4).flatMap(valueRange => valueRange.rows.slice(1));
  const dailyHeader = popupValues[4]?.rows?.[0] || ['event_date', 'brand_name', 'country_name', 'platform_type', 'users_redirected_to_store'];
  const allDailyRows = dailyRows.length ? [dailyHeader, ...dailyRows] : [];
  const feedbackSummary = summarizeFeedback(popupValues[3].rows);
  const campaignStart = 1;
  const participantRanges = campaignValues.slice(campaignStart, campaignStart + privateSources.campaign.participantRanges.length).map(item => item.rows);
  const submissionRanges = campaignValues.slice(campaignStart + privateSources.campaign.participantRanges.length).map(item => item.rows);
  const campaignSummary = summarizeCampaignTracker({
    registryRows: campaignValues[0].rows,
    participantRanges,
    submissionRanges,
  });
  const now = new Date();
  const latestAppFollowPeriod = [...monthTitles].sort((a, b) => Date.parse(`1 ${a}`) - Date.parse(`1 ${b}`)).at(-1) || null;
  const volumeDataThrough = latestDate(volumeValues[0].rows, 'As Of Date');
  const sourceMetadata = {
    generatedAt: now.toISOString(),
    appFollow: {
      fileModifiedTime: appMeta.modifiedTime,
      cadence: privateSources.appFollow.cadence,
      status: 'period-based',
      ageDays: null,
      latestPeriod: latestAppFollowPeriod,
      periodCount: ratingTabs.length,
    },
    popup: {
      fileModifiedTime: popupMeta.modifiedTime,
      cadence: privateSources.popup.cadence,
      status: 'undated',
      ageDays: null,
      rawSnapshotDated: false,
      dailyRedirectThrough: latestDate(allDailyRows, 'event_date'),
    },
    volume: {
      fileModifiedTime: volumeMeta.modifiedTime,
      cadence: privateSources.volume.cadence,
      ...freshness(volumeDataThrough, privateSources.volume.warningAfterDays, now),
      dataThrough: volumeDataThrough,
    },
    campaign: {
      fileModifiedTime: campaignMeta.modifiedTime,
      cadence: privateSources.campaign.cadence,
      ...freshness(campaignSummary.metadata.latestActivityAt, privateSources.campaign.warningAfterDays, now),
      latestActivityAt: campaignSummary.metadata.latestActivityAt,
      registryConnected: true,
    },
  };

  return {
    contractVersion: 1,
    ratingTabs,
    appMappings: appValues[0].rows,
    popupRawRows: popupValues[0].rows,
    popupCountryRateRows: popupValues[1].rows,
    popupSummaryRows: popupValues[2].rows,
    popupDailyRows: allDailyRows,
    ticketSummary: feedbackSummary,
    volumeRows: volumeValues[0].rows,
    campaigns: campaignSummary.campaigns,
    campaignTracker: {
      ...campaignSummary.metadata,
      generatedAt: sourceMetadata.generatedAt,
      connected: true,
      registryConnected: true,
      retentionDays: privateSources.campaign.retentionDays,
    },
    snapshotMetadata: {
      generatedAt: sourceMetadata.generatedAt,
      rawRows: Math.max(0, popupValues[0].rows.length - 1),
      countryRateRows: Math.max(0, popupValues[1].rows.length - 1),
      dailyRedirectRows: Math.max(0, allDailyRows.length - 1),
      feedbackTicketRowsAggregated: feedbackSummary.reduce((total, row) => total + row.ticketCount, 0),
      containsPersonalData: false,
    },
    sourceMetadata,
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=300, s-maxage=${SOURCE_CACHE_SECONDS}`,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  });
}

export async function onRequestGet(context) {
  const hostname = new URL(context.request.url).hostname;
  if (!ALLOWED_HOSTS.has(hostname)) return jsonResponse({ error: 'Not found.' }, 404);
  const cache = caches.default;
  const cacheUrl = new URL('/api/dashboard', context.request.url);
  cacheUrl.searchParams.set('cache', CACHE_VERSION);
  const cacheKey = new Request(cacheUrl, { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  try {
    if (!context.env.GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error('Server source credential is not configured');
    const response = jsonResponse(await buildDashboardPayload(
      context.env.GOOGLE_SERVICE_ACCOUNT_JSON,
      context.env.PRIVATE_SOURCE_IDS_JSON,
    ));
    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    console.error('dashboard_source_error', { name: error?.name, message: error?.message });
    return jsonResponse({ error: 'Live private Sheets are temporarily unavailable.' }, 503);
  }
}
