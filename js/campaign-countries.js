import { normalizeCountry } from './normalization.js';

// The existing uploader/registry contract allows 80 characters: 26 ISO codes + separators.
export const MAX_CAMPAIGN_COUNTRIES = 26;

export function campaignCountries(value, unmapped = null) {
  const raw = Array.isArray(value) ? value : String(value ?? '').trim();
  const single = Array.isArray(raw) ? null : normalizeCountry(raw);
  const parts = single ? [single] : Array.isArray(raw) ? raw : raw.split(/[,;|]/);
  const codes = parts.map(part => normalizeCountry(part, unmapped));
  if (!codes.length || codes.some(code => !code)) return [];
  const result = [...new Set(codes)].sort();
  if (result.includes('TEST') && result.length > 1) {
    unmapped?.add(String(value));
    return [];
  }
  return result;
}

export function serializeCampaignCountries(value) {
  const codes = campaignCountries(value);
  if (!codes.length) throw new Error('Select at least one country. Test cohort must be selected on its own.');
  if (codes.length > MAX_CAMPAIGN_COUNTRIES) throw new Error(`Select at most ${MAX_CAMPAIGN_COUNTRIES} countries per campaign.`);
  return codes.join(',');
}

export function campaignIncludesCountry(campaign, code) {
  return campaignCountries(campaign.countryCodes ?? campaign.country ?? campaign.countryCode).includes(code);
}

export function campaignCountryFields(value, unmapped = null) {
  const countryCodes = campaignCountries(value, unmapped);
  return { countryCodes, countryCode: countryCodes.length === 1 ? countryCodes[0] : null };
}
