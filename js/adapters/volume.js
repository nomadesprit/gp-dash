import { numberValue, parseCsv, rowsToObjects } from './csv.js';
import { normalizeCountry, normalizeStore } from '../normalization.js';

function elapsedDaysInMonth(value) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const day = Number(match[3]);
  return day >= 1 && day <= 31 ? day : null;
}

export function estimateWeeklyDownloads(monthlyNewInstalls, asOfDate) {
  const installs = numberValue(monthlyNewInstalls);
  const elapsedDays = elapsedDaysInMonth(asOfDate);
  if (installs === null || installs < 0 || !elapsedDays) return null;
  return Math.round((installs / elapsedDays) * 7);
}

export function parseVolumeSnapshot(source, options = {}) {
  const unmapped = new Set();
  const rows = Array.isArray(source) ? source : parseCsv(source);
  const records = rowsToObjects(rows).flatMap(row => {
    const countryCode = normalizeCountry(row.Country ?? row.country, unmapped);
    if (!countryCode) return [];

    const packageName = String(row.Package ?? row.package ?? '').trim();
    const brand = String(row.Brand ?? row.brand ?? options.packageBrandMap?.[packageName] ?? '').trim();
    const store = normalizeStore(row.Store ?? row.store ?? options.defaultStore);
    const exactWeekly = numberValue(row['Weekly Downloads'] ?? row.weekly_downloads);
    const monthlyNewInstalls = numberValue(row['Monthly New Installs'] ?? row.monthly_new_installs);
    const asOfDate = String(row['As Of Date'] ?? row.as_of_date ?? '').trim() || null;
    const weeklyDownloads = exactWeekly ?? estimateWeeklyDownloads(monthlyNewInstalls, asOfDate);

    if (!brand || !store) return [];
    return [{
      brand,
      store,
      countryCode,
      packageName: packageName || null,
      weeklyDownloads,
      weeklyDownloadsExact: exactWeekly !== null,
      monthlyNewInstalls,
      asOfDate,
      fetchedAt: String(row['Fetched At'] ?? row.fetched_at ?? '').trim() || null,
    }];
  });

  return { records, unmapped: [...unmapped] };
}

export function applyMinimumWeeklyDownloads(records, minimum, lookup) {
  const threshold = Math.max(0, Number(minimum) || 0);
  if (threshold === 0) return [...records];
  return records.filter(record => {
    const volume = lookup(record);
    return Number.isFinite(volume?.weeklyDownloads) && volume.weeklyDownloads >= threshold;
  });
}
