// Public server configuration contains only ranges and operating rules.
// Workbook identifiers are resolved at runtime from the encrypted
// PRIVATE_SOURCE_IDS_JSON Pages secret and are never committed or sent to the browser.
const SOURCE_RULES = {
  appFollow: {
    appsRange: "'Apps'!A:D",
    monthPattern: /^[A-Z][a-z]+ \d{4}$/,
    cadence: 'Weekly · expected Friday',
    warningAfterDays: 10,
  },
  popup: {
    rawRange: "'raw data'!A:T",
    ratesRange: "'Rates by Country'!A:H",
    summaryRange: "'rate us stats'!A:T",
    feedbackRange: "'feedback tickets'!B:H",
    cadence: 'Monthly · manual update',
    warningAfterDays: 45,
  },
  volume: {
    cacheRange: "'ratings_cache'!A:H",
    cadence: 'Weekly cache',
    warningAfterDays: 10,
  },
  campaign: {
    registryRange: "'Campaigns'!A1:R",
    participantRanges: ["'Participants'!A1:C", "'Participants'!L1:L"],
    submissionRanges: ["'Submissions'!C1:C", "'Submissions'!E1:E", "'Submissions'!G1:G", "'Submissions'!K1:L", "'Submissions'!O1:O"],
    cadence: 'Operational tracker',
    warningAfterDays: 2,
    retentionDays: 90,
  },
};

export function resolvePrivateSources(secretValue) {
  let identifiers;
  try { identifiers = JSON.parse(String(secretValue || '')); }
  catch { throw new Error('Private source identifier secret is invalid'); }
  const required = ['appFollow', 'popup', 'volume', 'campaign'];
  if (required.some(name => !/^[A-Za-z0-9_-]{20,}$/.test(String(identifiers?.[name] || '')))) {
    throw new Error('Private source identifier secret is incomplete');
  }
  return Object.fromEntries(required.map(name => [name, { ...SOURCE_RULES[name], id: identifiers[name] }]));
}

export const SOURCE_CACHE_SECONDS = 900;
export const DASHBOARD_CACHE_VERSION = 'source-coverage-v2';
