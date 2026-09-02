// Public server configuration contains only ranges and operating rules.
// Workbook identifiers are resolved at runtime from the encrypted
// PRIVATE_SOURCE_IDS_JSON Pages secret and are never committed or sent to the browser.
const SOURCE_RULES = {
  appFollow: {
    appsRange: "'Apps'!A1:D1000",
    monthPattern: /^[A-Z][a-z]+ \d{4}$/,
    cadence: 'Weekly · expected Friday',
    warningAfterDays: 10,
  },
  popup: {
    rawRange: "'raw data'!A1:T1000",
    ratesRange: "'Rates by Country'!A1:H1000",
    summaryRange: "'rate us stats'!A1:T1000",
    feedbackRange: "'feedback tickets'!B1:H1000",
    dailyPrefix: 'Daily count of users redirected to store',
    cadence: 'Monthly · manual update',
    warningAfterDays: 45,
  },
  volume: {
    cacheRange: "'ratings_cache'!A1:H1000",
    cadence: 'Weekly cache',
    warningAfterDays: 10,
  },
  campaign: {
    registryRange: "'Campaigns'!A1:R1000",
    participantRanges: ["'Participants'!B1:C10005", "'Participants'!L1:L10005"],
    submissionRanges: ["'Submissions'!C1:C1003", "'Submissions'!E1:E1003", "'Submissions'!G1:G1003", "'Submissions'!K1:L1003", "'Submissions'!O1:O1003"],
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
