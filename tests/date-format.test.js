import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDashboardDate, formatDashboardDateTime } from '../js/date-format.js';

test('dashboard dates use day/month/year without changing source values', () => {
  assert.equal(formatDashboardDate('2026-09-22'), '22/09/2026');
  assert.equal(formatDashboardDate('2026-09-22T10:00:00Z'), '22/09/2026');
  assert.equal(formatDashboardDate('unknown'), 'unknown');
});

test('dashboard timestamps start with day/month/year and retain the time', () => {
  assert.match(formatDashboardDateTime('2026-09-22T10:00:00Z'), /^22\/09\/2026, \d{2}:\d{2}:\d{2}$/);
  assert.equal(formatDashboardDateTime('at an unknown time'), 'at an unknown time');
});
