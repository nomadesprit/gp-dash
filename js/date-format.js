const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/;

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export function formatDashboardDate(value) {
  const source = String(value ?? '').trim();
  if (!source) return source;
  const parts = source.match(DATE_ONLY);
  if (parts) return `${parts[3]}/${parts[2]}/${parts[1]}`;
  const date = new Date(source);
  return Number.isNaN(date.getTime()) ? source : dateFormatter.format(date);
}

export function formatDashboardDateTime(value) {
  const source = String(value ?? '').trim();
  if (!source) return source;
  const date = new Date(source);
  return Number.isNaN(date.getTime()) ? source : dateTimeFormatter.format(date);
}
