export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const source = String(text ?? '').replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows.filter(cells => cells.some(cell => String(cell).trim() !== ''));
}

export function rowsToObjects(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map(header => String(header).trim());
  return rows.slice(1).map(values => Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ''])));
}

export function numberValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/[%,$\s]/g, '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export function extractUserIds(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { ids: [], inputIds: [], column: null, header: null };
  const width = Math.max(...rows.map(row => row.length));
  const canonical = /^(user[_ -]?id|client[_ -]?id|customer[_ -]?id|account[_ -]?id|id)$/i;
  const headerIndex = rows[0].findIndex(value => canonical.test(String(value).trim()));
  let best = { index: headerIndex, score: headerIndex >= 0 ? 1000 : -1 };
  const firstDataRow = headerIndex >= 0 ? 1 : 0;

  for (let column = 0; column < width; column += 1) {
    let score = canonical.test(String(rows[0][column] ?? '').trim()) ? 1000 : 0;
    for (let row = firstDataRow; row < Math.min(rows.length, 60); row += 1) {
      const value = String(rows[row][column] ?? '').trim();
      if (/^[A-Za-z0-9_-]{1,64}$/.test(value) && !value.includes('@')) score += 1;
    }
    if (score > best.score) best = { index: column, score };
  }

  if (best.index < 0 || best.score <= 0) return { ids: [], inputIds: [], column: null, header: null };
  const inputIds = rows.slice(firstDataRow)
    .map(row => String(row[best.index] ?? '').trim())
    .filter(Boolean);
  const ids = inputIds.filter(value => /^[A-Za-z0-9_-]{1,64}$/.test(value) && !value.includes('@'));
  return {
    ids: [...new Set(ids)],
    inputIds,
    column: best.index,
    header: headerIndex >= 0 ? rows[0][best.index] || null : null,
  };
}
