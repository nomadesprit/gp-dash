const finite = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));

export function rightmostRating(row, headers) {
  const start = headers.findIndex(header => String(header).trim().toLowerCase() === 'start');
  const candidates = headers.slice(Math.max(0, start));
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const raw = row[candidates[index]];
    if (raw === null || raw === undefined || String(raw).trim() === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return { value, column: candidates[index] };
  }
  return { value: null, column: null };
}

export function reviewsNeeded({ currentRating, target, effectiveRatingCount, expectedScore }) {
  const R = Number(currentRating), T = Number(target), N = Number(effectiveRatingCount), S = Number(expectedScore);
  if (![R, T, N, S].every(Number.isFinite) || N <= 0 || S <= T || R >= T) return null;
  return Math.max(0, Math.ceil(((N * (T - R)) / (S - T)) - 1e-9));
}

export function mixedForecast(input) {
  const R = Number(input.currentRating), T = Number(input.target), N = Number(input.effectiveRatingCount);
  const popupExposure = Number(input.popupExposure || 0);
  const acceptanceRateInput = input.acceptanceRate;
  const acceptanceRate = Number(input.acceptanceRate || 0);
  const redirectToVerifiedRateInput = input.redirectToVerifiedRate;
  const redirectToVerifiedRate = Number(input.redirectToVerifiedRate);
  const popupScoreInput = input.popupExpectedScore;
  const popupScore = Number(input.popupExpectedScore);
  const campaignAudience = Number(input.campaignAudience || 0);
  const campaignVerificationRateInput = input.campaignVerificationRate;
  const campaignVerificationRate = Number(input.campaignVerificationRate);
  const campaignScoreInput = input.campaignExpectedScore;
  const campaignScore = Number(input.campaignExpectedScore);
  const remainingScore = Number(input.remainingExpectedScore);
  const missing = [];

  if (!finite(R) || !finite(T)) missing.push('current rating and target');
  if (!finite(N) || N <= 0) missing.push('effective rating count');
  if (popupExposure > 0 && (!finite(acceptanceRateInput) || acceptanceRate < 0 || acceptanceRate > 1 || !finite(redirectToVerifiedRateInput) || redirectToVerifiedRate < 0 || redirectToVerifiedRate > 1 || !finite(popupScoreInput) || popupScore < 1 || popupScore > 5)) {
    missing.push('valid popup acceptance rate, verified-review rate, and external-store score');
  }
  if (campaignAudience > 0 && (!finite(campaignVerificationRateInput) || campaignVerificationRate < 0 || campaignVerificationRate > 1 || !finite(campaignScoreInput) || campaignScore < 1 || campaignScore > 5)) {
    missing.push('valid campaign verified-rating rate and external-store score');
  }
  if (missing.length) return { state: 'unavailable', missing, popupVerified: null, campaignVerified: null };

  const popupVerified = popupExposure * acceptanceRate * redirectToVerifiedRate;
  const campaignVerified = campaignAudience * campaignVerificationRate;
  const projectedCount = N + popupVerified + campaignVerified;
  const projectedRating = (R * N + popupVerified * popupScore + campaignVerified * campaignScore) / projectedCount;
  let remainingReviews = 0;
  if (projectedRating < T) {
    if (!finite(remainingScore) || remainingScore <= T) {
      return {
        state: 'assumption-driven', popupVerified, campaignVerified, projectedRating,
        remainingReviews: null, missing: ['an expected score above target for remaining verified reviews'],
      };
    }
    const numeratorGap = T * projectedCount - (R * N + popupVerified * popupScore + campaignVerified * campaignScore);
    remainingReviews = Math.max(0, Math.ceil((numeratorGap / (remainingScore - T)) - 1e-9));
  }
  return {
    state: input.inputsVerified ? 'ready' : 'assumption-driven',
    popupVerified, campaignVerified, projectedRating, remainingReviews, missing: [],
  };
}

const DAY_MS = 86_400_000;

function utcDay(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Forecasts campaign participation at the observed submission pace.
 * “Approved” means accepted campaign evidence, never a verified store rating.
 */
export function campaignProgress(campaign, asOf = new Date()) {
  const audience = Number(campaign?.audience_size);
  const submitted = Math.max(0, Number(campaign?.evidence_submissions) || 0);
  const pending = Math.max(0, Number(campaign?.pending_review) || 0);
  const approved = Math.max(0, Number(campaign?.approved) || 0);
  const rejected = Math.max(0, Number(campaign?.rejected) || 0);
  const rewards = Math.max(0, Number(campaign?.rewards_granted) || 0);
  const start = utcDay(campaign?.start_date);
  const end = utcDay(campaign?.end_date);
  const today = utcDay(asOf instanceof Date ? asOf.toISOString() : asOf);
  const missing = [];

  if (!Number.isFinite(audience) || audience <= 0) missing.push('audience size');
  if (!start || !end || end < start) missing.push('valid start and end dates');

  const result = {
    state: 'unavailable', missing, audience: Number.isFinite(audience) ? audience : null,
    submitted, pending, approved, rejected, rewards,
    completionRate: Number.isFinite(audience) && audience > 0 ? submitted / audience : null,
    resolutionRate: submitted > 0 ? (approved + rejected) / submitted : null,
    evidenceAcceptanceRate: approved + rejected > 0 ? approved / (approved + rejected) : null,
    rewardCompletionRate: approved > 0 ? rewards / approved : null,
    scheduleProgress: null, elapsedDays: null, totalDays: null,
    projectedSubmissions: null, projectedAcceptedEvidence: null, confidence: 'unavailable',
  };
  if (missing.length) return result;

  const totalDays = Math.floor((end - start) / DAY_MS) + 1;
  const rawElapsed = Math.floor((today - start) / DAY_MS) + 1;
  const elapsedDays = Math.max(0, Math.min(totalDays, rawElapsed));
  result.totalDays = totalDays;
  result.elapsedDays = elapsedDays;
  result.scheduleProgress = elapsedDays / totalDays;

  if (today > end) {
    return {
      ...result, state: 'complete', projectedSubmissions: submitted,
      projectedAcceptedEvidence: approved, confidence: 'actual end-state',
    };
  }
  if (elapsedDays <= 0) {
    return { ...result, state: 'not-started', confidence: 'unavailable' };
  }
  if (submitted <= 0) {
    return { ...result, state: 'unavailable', missing: ['observed submissions'], confidence: 'unavailable' };
  }

  const projectedSubmissions = Math.min(audience, Math.max(submitted, Math.round((submitted / elapsedDays) * totalDays)));
  const resolved = approved + rejected;
  const projectedAcceptedEvidence = resolved > 0
    ? Math.round(projectedSubmissions * (approved / resolved))
    : null;
  const confidence = elapsedDays >= 14 && submitted >= 30 ? 'medium' : 'low';
  return {
    ...result, state: 'observed-pace', missing: [], projectedSubmissions,
    projectedAcceptedEvidence, confidence,
  };
}

export function percentage(numerator, denominator) {
  return Number(denominator) > 0 ? Number(numerator) / Number(denominator) : null;
}

export function sum(records, field) {
  return records.reduce((total, record) => total + (Number(record[field]) || 0), 0);
}
