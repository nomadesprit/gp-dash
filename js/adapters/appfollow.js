import { parseCsv, rowsToObjects } from './csv.js';
import { normalizeCountry, normalizeStore } from '../normalization.js';
import { rightmostRating } from '../calculations.js';

const monthValue = period => {
  const parsed = Date.parse(`1 ${period}`);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function parseAppFollowTabs(tabs) {
  const unmapped = new Set();
  const pointsByKey = new Map();
  const periods = [];

  [...tabs].sort((a, b) => monthValue(a.period) - monthValue(b.period)).forEach(tab => {
    periods.push(tab.period);
    const rows = Array.isArray(tab.rows) ? tab.rows : parseCsv(tab.csv);
    if (!rows.length) return;
    const headers = rows[0].map(value => String(value).trim());
    const objects = rowsToObjects(rows);
    objects.forEach(row => {
      const countryCode = normalizeCountry(row.GEO, unmapped);
      if (!countryCode) return;
      const sourceApp = String(row.App || '').trim();
      const brand = sourceApp.startsWith('IQ Option') ? 'IQ Option' : sourceApp;
      const store = normalizeStore(row.Store);
      const key = `${brand}|${store}|${countryCode}`;
      const record = pointsByKey.get(key) || { brand, sourceApp, store, countryCode, sourceName: row.GEO, points: [] };
      const startAt = Math.max(0, headers.findIndex(header => header.toLowerCase() === 'start'));
      headers.slice(startAt).forEach((column, order) => {
        const value = Number(row[column]);
        if (Number.isFinite(value) && value > 0) {
          record.points.push({ period: tab.period, column, label: `${tab.period} · ${column}`, value, order });
        }
      });
      const current = rightmostRating(row, headers);
      record.periodValues ||= {};
      record.periodValues[tab.period] = current.value;
      pointsByKey.set(key, record);
    });
  });

  const records = [...pointsByKey.values()].map(record => {
    record.points.sort((a, b) => monthValue(a.period) - monthValue(b.period) || a.order - b.order);
    const current = record.points.at(-1)?.value ?? null;
    const previous = record.points.at(-2)?.value ?? null;
    return { ...record, current, delta: current !== null && previous !== null ? current - previous : null };
  });
  return { records, periods: [...new Set(periods)], unmapped: [...unmapped].sort() };
}

export function recordAtPeriod(record, period) {
  const points = record.points.filter(point => monthValue(point.period) <= monthValue(period));
  const current = points.at(-1)?.value ?? null;
  const previous = points.at(-2)?.value ?? null;
  return { ...record, points, current, delta: current !== null && previous !== null ? current - previous : null, sourcePeriod: points.at(-1)?.label || period };
}
