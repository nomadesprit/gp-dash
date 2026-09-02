function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(headers, rows) {
  return [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
