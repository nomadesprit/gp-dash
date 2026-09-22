const encoder = new TextEncoder();
const REVIEW_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',
].join(' ');
export const GOOGLE_JWT_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:jwt-bearer';

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

export async function reviewAccessToken(secret) {
  const credentials = JSON.parse(String(secret || ''));
  if (!credentials.client_email || !credentials.private_key) throw new Error('Service account secret is incomplete');
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: REVIEW_SCOPES,
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
      grant_type: GOOGLE_JWT_GRANT_TYPE,
      assertion: `${signingInput}.${base64Url(signature)}`,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Google token exchange failed (${response.status})`);
  const payload = await response.json();
  if (!payload.access_token) throw new Error('Google token exchange returned no access token');
  return payload.access_token;
}

export async function googleJson(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    signal: options.signal || AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Google request failed (${response.status})`);
  return response.json();
}

export async function reviewSheetRows(spreadsheetId, token) {
  const ranges = ["'Participants'!A2:K", "'Submissions'!A2:Q", "'Campaigns'!A2:R"];
  const params = new URLSearchParams({ majorDimension: 'ROWS', valueRenderOption: 'UNFORMATTED_VALUE' });
  ranges.forEach(range => params.append('ranges', range));
  const payload = await googleJson(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${params}`,
    token,
  );
  return {
    participantRows: payload.valueRanges?.[0]?.values || [],
    submissionRows: payload.valueRanges?.[1]?.values || [],
    registryRows: payload.valueRanges?.[2]?.values || [],
  };
}

export async function writeReviewDecision(spreadsheetId, token, plan) {
  const data = [
    { range: plan.submissionRange, majorDimension: 'ROWS', values: [plan.submissionValues] },
    { range: plan.participantRange, majorDimension: 'ROWS', values: [plan.participantValues] },
    {
      range: "'Submissions'!P1:Q1",
      majorDimension: 'ROWS',
      values: [['reward_eligible', 'reviewer_email']],
    },
  ];
  if (plan.campaignRange) {
    data.push({ range: plan.campaignRange, majorDimension: 'ROWS', values: [plan.campaignValues] });
  }
  return googleJson(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, token, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data,
    }),
  });
}

export function jsonNoStore(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  });
}

export const ALLOWED_REVIEW_HOSTS = new Set(['gp-dash.pages.dev', 'localhost', '127.0.0.1']);

export function reviewHostAllowed(request) {
  return ALLOWED_REVIEW_HOSTS.has(new URL(request.url).hostname);
}

export function reviewAuthorized(request) {
  const hostname = new URL(request.url).hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
  return Boolean(String(request.headers.get('cf-access-authenticated-user-email') || '').trim());
}

export function sameOriginWrite(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}
