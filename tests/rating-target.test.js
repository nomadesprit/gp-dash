import test from 'node:test';
import assert from 'node:assert/strict';
import { ratingTargetPlan } from '../js/calculations.js';
import { estimate30DayDownloads } from '../js/adapters/volume.js';

test('10,000 downloads at 4.0 uses 300 assumed ratings, needs 75 five-stars and 37,500 emails', () => {
  const result = ratingTargetPlan({ currentRating: 4, target: 4.2, downloads30Days: 10000 });
  assert.equal(result.ratingBase, 300);
  assert.equal(result.fiveStarRatings, 75);
  assert.equal(result.emails, 37500);
  assert.equal(result.ratingState, 'estimate');
});

test('email plan stays independent of the current rating and target', () => {
  for (const [currentRating, target, needed] of [[4, 4.2, 75], [4.1, 4.2, 38], [4.3, 4.2, 0], [4, 4.5, 300]]) {
    const result = ratingTargetPlan({ currentRating, target, downloads30Days: 10000 });
    assert.equal(result.fiveStarRatings, needed);
    assert.equal(result.emails, 37500);
  }
});

test('the rounded count reaches target and one fewer does not', () => {
  for (const downloads30Days of [1, 999, 10000, 234567]) {
    for (const currentRating of [1, 3.7, 4, 4.199, 4.7]) {
      const target = 4.8;
      const result = ratingTargetPlan({ currentRating, target, downloads30Days });
      const n = result.ratingBase, k = result.fiveStarRatings;
      assert.ok((n * currentRating + k * 5) / (n + k) >= target - 1e-12);
      assert.ok((n * currentRating + (k - 1) * 5) / (n + k - 1) < target);
    }
  }
});

test('fractional assumed counts are retained and email volume rounds up', () => {
  const result = ratingTargetPlan({ currentRating: 4, target: 4.2, downloads30Days: 101 });
  assert.equal(result.ratingBase, 3.03);
  assert.equal(result.fiveStarRatings, 1);
  assert.equal(result.emails, 379);
});

test('missing or invalid inputs never become a precise rating or email target', () => {
  for (const downloads30Days of ['', null, undefined, -1, 1.5, 'bad', Infinity]) {
    const result = ratingTargetPlan({ currentRating: 4, target: 4.2, downloads30Days });
    assert.equal(result.fiveStarRatings, null);
    assert.equal(result.emails, null);
  }
  for (const currentRating of ['', null, undefined, 0, 5.1, 'bad']) {
    assert.equal(ratingTargetPlan({ currentRating, target: 4.2, downloads30Days: 100 }).fiveStarRatings, null);
  }
  for (const target of ['', null, undefined, 0, 5.1, 'bad']) {
    assert.equal(ratingTargetPlan({ currentRating: 4, target, downloads30Days: 100 }).fiveStarRatings, null);
  }
});

test('zero downloads gives zero emails but cannot establish the existing rating base', () => {
  const result = ratingTargetPlan({ currentRating: 4, target: 4.2, downloads30Days: 0 });
  assert.equal(result.ratingBase, 0);
  assert.equal(result.emails, 0);
  assert.equal(result.fiveStarRatings, null);
});

test('already met target needs zero five-stars; exactly five from below is unreachable', () => {
  assert.equal(ratingTargetPlan({ currentRating: 4.2, target: 4.2 }).fiveStarRatings, 0);
  assert.equal(ratingTargetPlan({ currentRating: 5, target: 5 }).fiveStarRatings, 0);
  const result = ratingTargetPlan({ currentRating: 4.9, target: 5, downloads30Days: 100 });
  assert.equal(result.ratingState, 'unreachable');
  assert.equal(result.fiveStarRatings, null);
  assert.equal(result.emails, 375);
});

test('30-day estimate uses MTD installs and source date, not the rounded weekly estimate', () => {
  assert.equal(estimate30DayDownloads(2900, '2026-09-29'), 3000);
  assert.equal(estimate30DayDownloads(3100, '2026-08-31'), 3000);
  assert.equal(estimate30DayDownloads(100, '2026-10-02'), 1500);
  assert.equal(estimate30DayDownloads(0, '2026-09-30'), 0);
  assert.equal(estimate30DayDownloads('', '2026-09-30'), null);
  assert.equal(estimate30DayDownloads(100, null), null);
  assert.equal(estimate30DayDownloads(-1, '2026-09-30'), null);
});
