const DAILY_HEADERS = ['event_date', 'brand_name', 'country_name', 'platform_type', 'users_redirected_to_store'];
const normalizeHeader = value => String(value ?? '').trim().toLowerCase();

export function isDailyRedirectHeader(header = []) {
  const columns = header.map(normalizeHeader);
  return columns.length === DAILY_HEADERS.length && DAILY_HEADERS.every(name => columns.includes(name));
}

export function combineDailyRedirects(tabs) {
  const rows = tabs.flatMap(tab => {
    if (!isDailyRedirectHeader(tab[0])) return [];
    const headers = tab[0].map(normalizeHeader);
    const indexes = DAILY_HEADERS.map(name => headers.indexOf(name));
    return tab.slice(1).filter(row => row.some(value => String(value ?? '').trim()))
      .map(row => indexes.map(index => row[index] ?? ''));
  });
  return rows.length ? [[...DAILY_HEADERS], ...rows] : [];
}
