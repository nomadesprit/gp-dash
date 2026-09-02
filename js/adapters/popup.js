import { parseCsv, rowsToObjects, numberValue } from './csv.js';
import { normalizeCountry, normalizeStore } from '../normalization.js';
import { percentage, sum } from '../calculations.js';

const field = (row, prefix) => {
  const key = Object.keys(row).find(name => name.trim().toLowerCase().startsWith(prefix));
  return key ? row[key] : null;
};

export function parsePopupSnapshot(source) {
  const rows = Array.isArray(source) ? source : parseCsv(source);
  const objects = rowsToObjects(rows);
  const unmapped = new Set();
  const records = [];
  objects.forEach(row => {
    if (!String(row.country_name || '').trim()) {
      unmapped.add('(blank country in popup raw data)');
      return;
    }
    const countryCode = normalizeCountry(row.country_name, unmapped);
    if (!countryCode) return;
    records.push({
      brand: String(row.brand_name || '').trim(),
      store: normalizeStore(row.platform_type),
      platform: String(row.platform_type || '').trim().toLowerCase(),
      countryCode,
      sourceName: row.country_name,
      segment: String(row.user_segment || 'unknown').trim(),
      show: numberValue(row.show_users) || 0,
      close: numberValue(row.close_users) || 0,
      accepted: numberValue(field(row, 'accept_users')) || 0,
      declined: numberValue(field(row, 'decline_users')) || 0,
      rated: numberValue(row.rated_users) || 0,
      stars: [1, 2, 3, 4, 5].map(star => numberValue(row[`stars_${star}`]) || 0),
      averageStars: numberValue(row.avg_stars),
    });
  });
  return { records, unmapped: [...unmapped].sort() };
}

export function parseDailyRedirects(source) {
  const rows = Array.isArray(source) ? source : parseCsv(source);
  const objects = rowsToObjects(rows);
  const unmapped = new Set();
  const records = [];
  objects.forEach(row => {
    if (!String(row.country_name || '').trim()) {
      unmapped.add('(blank country in daily redirects)');
      return;
    }
    const countryCode = normalizeCountry(row.country_name, unmapped);
    if (!countryCode) return;
    records.push({
      date: String(row.event_date || '').trim(),
      brand: String(row.brand_name || '').trim(),
      store: normalizeStore(row.platform_type),
      platform: String(row.platform_type || '').trim().toLowerCase(),
      countryCode,
      sourceName: row.country_name,
      redirects: numberValue(row.users_redirected_to_store) || 0,
    });
  });
  return { records, unmapped: [...unmapped].sort() };
}

export function parsePopupCountryRates(source) {
  const rows = Array.isArray(source) ? source : parseCsv(source);
  const objects = rowsToObjects(rows);
  const unmapped = new Set();
  const records = [];
  let currentBrand = '';
  objects.forEach(row => {
    const rawBrand = String(row.brand_name || '').trim();
    const rawCountry = String(row.country_name || '').trim();
    if (rawBrand) currentBrand = rawBrand.replace(/\s+Total$/i, '').trim();
    if (!rawCountry || /^Total$/i.test(rawCountry)) return;
    const sourceName = rawCountry.replace(/\s+Total$/i, '').trim();
    const countryCode = normalizeCountry(sourceName, unmapped);
    if (!countryCode) return;
    const normalizedKeys = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim().toLowerCase().replace(/\s+/g, ' '), value]));
    records.push({
      brand: currentBrand,
      countryCode,
      sourceName,
      stars: [1, 2, 3, 4, 5].map(star => numberValue(normalizedKeys[`${star} star${star === 1 ? '' : 's'}`]) || 0),
    });
  });
  return { records, unmapped: [...unmapped].sort() };
}

export function parsePopupHighLevelSummary(source) {
  const rows = Array.isArray(source) ? source : parseCsv(source);
  const headerIndex = rows.findIndex(row => String(row[0] || '').trim().toLowerCase() === 'brand');
  if (headerIndex < 0) return [];
  const objects = rowsToObjects(rows.slice(headerIndex));
  let currentBrand = '';
  return objects.flatMap(row => {
    const rawBrand = String(row.Brand || '').trim();
    const rawPlatform = String(row['Platform type'] || '').trim();
    if (rawBrand) currentBrand = rawBrand.replace(/\s+Total$/i, '').trim();
    const isBrandTotal = /Total$/i.test(rawBrand);
    const isPlatformTotal = /Total$/i.test(rawPlatform);
    if (!isBrandTotal && !isPlatformTotal) return [];
    const pick = prefix => {
      const key = Object.keys(row).find(name => name.trim().toLowerCase().startsWith(prefix));
      return key ? numberValue(row[key]) || 0 : 0;
    };
    return [{
      brand: rawBrand === 'Grand Total' ? 'Grand Total' : currentBrand,
      store: isPlatformTotal ? normalizeStore(rawPlatform.replace(/\s+Total$/i, '')) : null,
      show: pick('saw popup'),
      close: pick('closed popup'),
      accepted: pick('enjoyed app'),
      declined: pick("didn't enjoy app"),
      rated: pick("rated among didn't enjoy app"),
      stars: [1, 2, 3, 4, 5].map(star => pick(`${star} star`)),
    }];
  });
}

export function normalizeTicketSummary(rows) {
  const unmapped = new Set();
  const records = [];
  rows.forEach(row => {
    if (!String(row.country || '').trim()) {
      unmapped.add('(blank country in feedback tickets)');
      return;
    }
    const countryCode = normalizeCountry(row.country, unmapped);
    if (!countryCode) return;
    records.push({
      brand: String(row.brand || '').trim(),
      countryCode,
      sourceName: row.country,
      segment: String(row.segment || 'unknown').trim(),
      ticketCount: numberValue(row.ticketCount) || 0,
      ratedCount: numberValue(row.ratedCount) || 0,
      lowScoreCount: numberValue(row.lowScoreCount) || 0,
      averageStar: numberValue(row.averageStar),
      firstAt: String(row.firstAt || '').trim(),
      lastAt: String(row.lastAt || '').trim(),
      languages: Array.isArray(row.languages) ? row.languages.map(item => ({
        language: String(item.language || '').trim(),
        count: numberValue(item.count) || 0,
      })) : [],
    });
  });
  return { records, unmapped: [...unmapped].sort() };
}

export function aggregatePopup(records) {
  const grouped = new Map();
  records.forEach(record => {
    const key = `${record.brand}|${record.store}|${record.countryCode}`;
    const group = grouped.get(key) || {
      brand: record.brand, store: record.store, countryCode: record.countryCode,
      show: 0, close: 0, accepted: 0, declined: 0, rated: 0,
      stars: [0, 0, 0, 0, 0], segments: [],
    };
    ['show', 'close', 'accepted', 'declined', 'rated'].forEach(name => { group[name] += record[name]; });
    record.stars.forEach((value, index) => { group.stars[index] += value; });
    group.segments.push(record);
    grouped.set(key, group);
  });
  return [...grouped.values()].map(group => ({
    ...group,
    acceptanceRate: percentage(group.accepted, group.show),
    popupSentimentSample: group.stars.reduce((total, value) => total + value, 0),
  }));
}
