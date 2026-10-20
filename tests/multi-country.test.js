import test from 'node:test';
import assert from 'node:assert/strict';
import { campaignCountries, campaignIncludesCountry, serializeCampaignCountries } from '../js/campaign-countries.js';
import { normalizeCampaignRecords, parseCampaigns, isTestCampaign, suggestCampaignId } from '../js/adapters/campaigns.js';
import { summarizeCountryPlans, ratingTargetPlan } from '../js/calculations.js';
import { validateCampaignRequest } from '../functions/lib/campaign-prepare.js';
import { onRequestPost } from '../functions/api/campaigns/prepare.js';
import { summarizeCampaignTracker } from '../functions/lib/server-data.js';

const details = { campaignId: 'latam_20261020', name: 'LATAM', brand: 'IQ Option', store: 'GooglePlay' };

test('country lists support legacy names (including embedded commas), aliases and canonical multi-country storage', () => {
  assert.deepEqual(campaignCountries('Venezuela, Bolivarian Republic of'), ['VE']);
  assert.deepEqual(campaignCountries('Brazil'), ['BR']);
  assert.deepEqual(campaignCountries('br, MX,BR,cl'), ['BR', 'CL', 'MX']);
  assert.equal(serializeCampaignCountries(['MX', 'BR', 'CL', 'BR']), 'BR,CL,MX');
  assert.deepEqual(campaignCountries('BR|CL;MX'), ['BR', 'CL', 'MX']);
});

test('empty, unknown and mixed test/production countries fail closed', () => {
  for (const value of ['', [], ['TEST', 'BR'], 'BR,Unknown', 'BR,', [null], 'Unknown']) {
    assert.deepEqual(campaignCountries(value), []);
    assert.throws(() => serializeCampaignCountries(value));
  }
  assert.equal(serializeCampaignCountries(['TEST']), 'TEST');
  assert.deepEqual(normalizeCampaignRecords([{ ...details, country: 'BR,Unknown' }]).unmapped, ['Unknown']);
});

test('26-country boundary fits the deployed 80-character service contract; 27 fails before upstream writes', () => {
  const codes = Array.from({ length: 26 }, (_, i) => `A${String.fromCharCode(65 + i % 26)}`).concat('BA').slice(0, 27);
  assert.equal(serializeCampaignCountries(codes.slice(0, 26)).length, 77);
  assert.throws(() => serializeCampaignCountries(codes), /at most 26/);
  assert.throws(() => validateCampaignRequest({ campaign: { ...details, countries: codes }, userIds: ['10001'] }), /at most 26/);
});

test('multi-country normalization produces one campaign and joins each selected country without duplicating totals', () => {
  const { records, unmapped } = normalizeCampaignRecords([{ ...details, campaign_id: details.campaignId, country: 'CL,BR', audience_size: 300, evidence_submissions: 12 }]);
  assert.equal(records.length, 1);
  assert.deepEqual(unmapped, []);
  assert.deepEqual(records[0].countryCodes, ['BR', 'CL']);
  assert.equal(records[0].countryCode, null);
  assert.equal(campaignIncludesCountry(records[0], 'BR'), true);
  assert.equal(campaignIncludesCountry(records[0], 'CL'), true);
  assert.equal(campaignIncludesCountry(records[0], 'MX'), false);
  assert.equal(records.reduce((n, c) => n + c.audience_size, 0), 300);
  assert.equal(isTestCampaign(records[0]), false);
  assert.equal(isTestCampaign({ countryCodes: ['TEST'] }), true);
  const csv = parseCampaigns('campaign_id,brand,store,country\nlatam,IQ Option,GooglePlay,"BR,CL"', ['country']);
  assert.equal(csv.records.length, 1);
  assert.deepEqual(csv.records[0].countryCodes, ['BR', 'CL']);
});

test('multi-country suggested ID is stable across country order and distinct for different groups', () => {
  const id = countries => suggestCampaignId('IQ Option', 'GooglePlay', countries, '20261020');
  assert.equal(id(['BR', 'CL']), id(['CL', 'BR', 'BR']));
  assert.notEqual(id(['BR', 'CL']), id(['BR', 'MX']));
  assert.match(id(['BR', 'CL']), /^iq_option_googleplay_multi_2_.*_20261020$/);
  assert.equal(id(['TEST']), 'pilot_20261020');
});

test('country planner sums independent rounded results and flags incomplete plans', () => {
  const plan = (r, d) => ratingTargetPlan({ currentRating: r, downloads30Days: d, target: 4.2 });
  const total = summarizeCountryPlans([plan(4, 101), plan(4.3, 101), plan(4, '')]);
  assert.deepEqual(total, { countries: 3, fiveStarRatings: 1, emails: 758, missingRatings: 1, missingEmails: 1 });
  assert.equal(summarizeCountryPlans([plan(4, 10000), plan(4.1, 10000)]).fiveStarRatings, 113);
  assert.equal(summarizeCountryPlans([plan(4, 10000), plan(4.1, 10000)]).emails, 75000);
  assert.equal(summarizeCountryPlans([plan(4, 0)]).missingRatings, 1);
  assert.equal(summarizeCountryPlans([plan(4, 0)]).emails, 0);
});

test('privacy-safe server aggregates preserve one multi-country registry record through browser normalization', () => {
  const result = summarizeCampaignTracker({
    registryRows: [['campaign_id', 'name', 'brand', 'store', 'country', 'status'], ['latam', 'LATAM', 'IQ Option', 'GooglePlay', 'BR,CL', 'active']],
    participantRanges: [[['user_id', 'status', 'current_campaign_id'], ['private-id', 'eligible', 'latam']]],
    submissionRanges: [[['campaign_id'], ['latam']], [['status'], ['pending_verification']], [['selected_language'], ['en']], [['submitted_at', 'reviewed_at'], ['2026-10-20', '']], [['retention_deleted_at'], ['']]],
  });
  assert.equal(result.campaigns.length, 1);
  assert.equal(result.campaigns[0].audience_size, 1);
  assert.equal(result.campaigns[0].evidence_submissions, 1);
  const normalized = normalizeCampaignRecords(result.campaigns);
  assert.deepEqual(normalized.records[0].countryCodes, ['BR', 'CL']);
  assert.equal(normalized.records[0].pending_review, 1);
  assert.equal(JSON.stringify(result).includes('private-id'), false);
});

test('proxy sends canonical country list using deployed uploader shape and rejects mixed TEST before fetch', async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/readiness')) return Response.json({countryTrackingVersion:1});
    calls++;
    const forwarded = JSON.parse(options.body);
    assert.equal(forwarded.campaign.country, 'BR,CL');
    assert.equal(Object.hasOwn(forwarded.campaign, 'countries'), false);
    return Response.json({ campaign: { campaign_id: 'latam', country: 'BR,CL' }, mailingRows: [] });
  };
  const request = countries => ({ request: new Request('https://gp-dash.pages.dev/api/campaigns/prepare', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ campaign: { ...details, countries }, userIds: ['10001'], audience:[{userId:'10001',country:'BR'}] }),
  }), env: { UPLOADER_ADMIN_API_KEY: 'private-value' } });
  try {
    const response = await onRequestPost(request(['CL', 'BR', 'BR']));
    assert.equal(response.status, 200);
    assert.equal((await onRequestPost(request(['BR', 'TEST']))).status, 400);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = previousFetch; }
});
