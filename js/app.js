import { CONFIG } from './config.js';
import { loadDashboardData } from './source-loader.js';
import { recordAtPeriod } from './adapters/appfollow.js';
import { extractUserIds } from './adapters/csv.js';
import { applyMinimumWeeklyDownloads } from './adapters/volume.js';
import { toCsv } from './campaign-files.js';
import { countryName } from './normalization.js';
import { campaignProgress, mixedForecast, percentage, sum } from './calculations.js?v=20260812-forecast-3';

const $ = selector => document.querySelector(selector);
const presentNumber = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const formatInt = value => presentNumber(value) ? Math.round(Number(value)).toLocaleString() : '—';
const formatRate = value => presentNumber(value) ? `${(Number(value) * 100).toFixed(1)}%` : '—';
const formatRating = value => presentNumber(value) ? Number(value).toFixed(2) : '—';
const formatSourceRating = value => presentNumber(value) ? Number(value).toFixed(3) : '—';
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const latestString = values => values.filter(Boolean).sort().at(-1) || null;

const state = {
  data: null,
  filters: { ...CONFIG.defaults, search: '' },
  selectedKey: null,
  drafts: [],
  forecastInputs: new Map(),
  currentIds: [],
  currentUniqueIdCount: 0,
  preparedCampaign: null,
};

const recordKey = record => `${record.brand}|${record.store}|${record.countryCode}`;
const lookupPopup = record => state.data.popupRecords.find(item => recordKey(item) === recordKey(record));
const lookupVolume = record => state.data.volumeRecords.find(item => recordKey(item) === recordKey(record));
const campaignFor = record => [...(state.data?.campaigns || []), ...state.drafts].filter(item => recordKey(item) === recordKey(record));

function fillSelect(element, values, selected, labeler = value => value) {
  element.innerHTML = '';
  values.forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = labeler(value);
    option.selected = value === selected;
    element.append(option);
  });
}

function initializeFilters() {
  const records = state.data.ratingData.records;
  const brands = [...new Set(records.map(record => record.brand))].sort();
  if (!brands.includes(state.filters.brand)) state.filters.brand = brands[0] || '';
  const stores = [...new Set(records.filter(record => record.brand === state.filters.brand).map(record => record.store))].sort();
  if (!stores.includes(state.filters.store)) state.filters.store = stores[0] || 'GooglePlay';
  const countryCodes = [...new Set(records
    .filter(record => record.brand === state.filters.brand && record.store === state.filters.store)
    .map(record => record.countryCode))].sort((a, b) => countryName(a).localeCompare(countryName(b)));

  const periods = state.data.ratingData.periods;
  if (!periods.includes(state.filters.period)) state.filters.period = periods.at(-1) || '';
  if (state.filters.country !== 'all' && !countryCodes.includes(state.filters.country)) state.filters.country = 'all';
  fillSelect($('#brand-filter'), brands, state.filters.brand);
  fillSelect($('#store-filter'), stores, state.filters.store, value => value === 'GooglePlay' ? 'Google Play / Android' : 'App Store / iOS');
  fillSelect($('#country-filter'), ['all', ...countryCodes], state.filters.country, value => value === 'all' ? 'All countries' : `${countryName(value)} (${value})`);
  fillSelect($('#period-filter'), [...periods].reverse(), state.filters.period);
  $('#target-filter').value = Number(state.filters.target).toFixed(2);
  $('#search-filter').value = state.filters.search;
  const slider = CONFIG.sources.volume.slider;
  $('#volume-filter').min = slider.min;
  $('#volume-filter').max = slider.max;
  $('#volume-filter').step = slider.step;
  $('#volume-filter').value = state.filters.minWeeklyDownloads;
  fillSelect($('#draft-country'), countryCodes, state.selectedKey?.split('|').at(-1) || countryCodes[0], value => `${countryName(value)} (${value})`);
}

function baseScopedRecords() {
  const query = state.filters.search.trim().toLowerCase();
  return state.data.ratingData.records
    .filter(record => record.brand === state.filters.brand && record.store === state.filters.store)
    .map(record => recordAtPeriod(record, state.filters.period))
    .filter(record => record.current !== null)
    .filter(record => state.filters.country === 'all' || record.countryCode === state.filters.country)
    .filter(record => !query || record.countryCode.toLowerCase().includes(query) || countryName(record.countryCode).toLowerCase().includes(query))
    .sort((a, b) => a.current - b.current || countryName(a.countryCode).localeCompare(countryName(b.countryCode)));
}

function scopedRecords() {
  return applyMinimumWeeklyDownloads(baseScopedRecords(), state.filters.minWeeklyDownloads, lookupVolume);
}

function volumeScope() {
  const base = baseScopedRecords();
  const included = applyMinimumWeeklyDownloads(base, state.filters.minWeeklyDownloads, lookupVolume);
  const unknown = base.filter(record => !Number.isFinite(lookupVolume(record)?.weeklyDownloads)).length;
  const excludedUnknown = Number(state.filters.minWeeklyDownloads) > 0 ? unknown : 0;
  return { base, included, unknown, below: Math.max(0, base.length - included.length - excludedUnknown) };
}

function popupSummary(records) {
  const relevant = records.map(lookupPopup).filter(Boolean);
  const show = sum(relevant, 'show');
  return { show, accepted: sum(relevant, 'accepted'), close: sum(relevant, 'close'), declined: sum(relevant, 'declined'), rated: sum(relevant, 'rated') };
}

function dailyRedirectSeries(records) {
  const includedCountries = new Set(records.map(record => record.countryCode));
  const dates = new Map();
  state.data.dailyRedirectRows
    .filter(row => row.brand === state.filters.brand && row.store === state.filters.store)
    .filter(row => includedCountries.has(row.countryCode))
    .forEach(row => dates.set(row.date, (dates.get(row.date) || 0) + row.redirects));
  return [...dates].sort(([a], [b]) => a.localeCompare(b)).map(([date, redirects]) => ({ date, redirects }));
}

function feedbackFor(record) {
  const rows = state.data.ticketSummary.filter(item => item.brand === record.brand && item.countryCode === record.countryCode);
  if (!rows.length) return null;
  const ticketCount = sum(rows, 'ticketCount');
  const ratedCount = sum(rows, 'ratedCount');
  const weightedStars = rows.reduce((total, row) => total + (Number(row.averageStar) || 0) * row.ratedCount, 0);
  const languages = new Map();
  rows.flatMap(row => row.languages).forEach(item => languages.set(item.language, (languages.get(item.language) || 0) + item.count));
  return {
    ticketCount, ratedCount, lowScoreCount: sum(rows, 'lowScoreCount'),
    averageStar: ratedCount ? weightedStars / ratedCount : null,
    firstAt: rows.map(row => row.firstAt).filter(Boolean).sort().at(0),
    lastAt: rows.map(row => row.lastAt).filter(Boolean).sort().at(-1),
    languages: [...languages].sort((a, b) => b[1] - a[1]),
  };
}

function renderOverview(records, scope) {
  const threshold = Number(state.filters.target);
  const below = records.filter(record => record.current < threshold);
  const mean = records.length ? records.reduce((total, record) => total + record.current, 0) / records.length : null;
  const popup = popupSummary(records);
  const acceptedRate = percentage(popup.accepted, popup.show);
  const sourcePeriod = records[0]?.points.at(-1)?.label || state.filters.period;
  const dailyThrough = state.data.sourceMetadata?.popup?.dailyRedirectThrough || 'unknown';
  const popupStatus = state.data.sourceMetadata?.popup?.status || 'unknown';
  const campaignConnected = state.data.mode === 'live-private-sheet-api' && Boolean(state.data.campaignTracker?.connected);
  const volumeLabel = Number(state.filters.minWeeklyDownloads) === 0 ? 'All volume levels' : `${formatInt(state.filters.minWeeklyDownloads)}+ / week`;
  const cards = [
    { value: below.length, label: 'Countries below target', meta: `${records.length} volume-qualified rows`, attention: below.length > 0 },
    { value: formatRating(mean), label: 'Unweighted mean rating', meta: 'Review counts unavailable; not weighted' },
    { value: esc(sourcePeriod || '—'), label: 'Latest AppFollow period', meta: 'Rightmost non-empty weekly value' },
    { value: formatInt(popup.accepted), label: 'Popup store redirects', meta: Number(state.filters.minWeeklyDownloads) > 0 ? 'Volume-filtered joined samples' : 'Accepted ≠ verified store rating' },
    { value: formatRate(acceptedRate), label: 'Popup acceptance rate', meta: `${formatInt(popup.show)} users shown` },
    { value: campaignConnected ? state.data.campaigns.filter(campaign => campaign.status === 'active').length : '—', label: 'Active campaigns', meta: campaignConnected ? 'Screenshot tracker connected' : 'Source unavailable in demo mode' },
    { value: popupStatus === 'stale' ? 'Popup stale' : 'Mismatch', label: 'Data freshness', meta: `Popup redirects through ${dailyThrough}`, attention: true },
  ];
  $('#kpi-grid').innerHTML = cards.map(card => `<article class="kpi ${card.attention ? 'attention' : ''}"><span class="label">${card.label}</span><span class="value">${card.value}</span><span class="meta">${card.meta}</span></article>`).join('');
  $('#scope-note').textContent = `${state.filters.brand} · ${state.filters.store === 'GooglePlay' ? 'Google Play' : 'App Store'} · target ${threshold.toFixed(2)} · ${volumeLabel}`;
  $('#volume-filter-value').textContent = Number(state.filters.minWeeklyDownloads) === 0 ? 'All' : `${formatInt(state.filters.minWeeklyDownloads)}+`;
  $('#volume-filter-summary').textContent = `${records.length} of ${scope.base.length} countries included · ${scope.below} below volume · ${scope.unknown} volume unknown`;
}

function forecastStateFor(record) {
  const saved = state.forecastInputs.get(recordKey(record));
  if (!saved) return 'unavailable';
  return mixedForecast({ currentRating: record.current, target: state.filters.target, inputsVerified: false, ...saved }).state;
}

function tableRow(record) {
  const popup = lookupPopup(record);
  const volume = lookupVolume(record);
  const campaigns = campaignFor(record);
  const forecastState = forecastStateFor(record);
  const below = record.current < state.filters.target;
  const deltaClass = record.delta > .0005 ? 'up' : record.delta < -.0005 ? 'down' : 'flat';
  const delta = Number.isFinite(record.delta) ? `${record.delta > 0 ? '+' : ''}${record.delta.toFixed(3)}` : '—';
  const gap = Math.max(0, state.filters.target - record.current);
  const quality = popup ? `Popup undated · redirects to ${state.data.sourceMetadata?.popup?.dailyRedirectThrough || 'unknown'}` : 'Popup country sample absent';
  const campaignEmpty = state.data.mode === 'live-private-sheet-api'
    ? '<span class="metric-main">No live campaign</span><span class="submetric">Tracker connected · no production rows</span>'
    : '<span class="metric-main">Campaign source unavailable</span><span class="submetric">Synthetic demo mode</span>';
  return `<tr tabindex="0" data-key="${esc(recordKey(record))}" class="${below ? 'below' : ''} ${state.selectedKey === recordKey(record) ? 'selected' : ''}" aria-label="Open details for ${esc(countryName(record.countryCode))}">
    <td class="country-cell"><strong>${esc(countryName(record.countryCode))} <span class="submetric">${record.countryCode}</span></strong><small>${record.store === 'GooglePlay' ? 'Google Play' : 'App Store'}</small></td>
    <td><span class="rating-value ${below ? 'below' : ''}">${formatSourceRating(record.current)}</span><span class="delta ${deltaClass}">${delta}</span><span class="submetric">${esc(record.sourcePeriod)}</span></td>
    <td><span class="metric-main">${gap ? `−${gap.toFixed(3)}` : 'On / above'}</span><span class="submetric">to ${Number(state.filters.target).toFixed(2)}</span></td>
    <td>${Number.isFinite(volume?.weeklyDownloads) ? `<span class="metric-main">${volume.weeklyDownloadsExact ? '' : '≈ '}${formatInt(volume.weeklyDownloads)}</span><span class="submetric">${volume.weeklyDownloadsExact ? '7-day total' : 'MTD run-rate'} · through ${esc(volume.asOfDate || 'unknown')}</span>` : '<span class="metric-main">—</span><span class="submetric">Volume unavailable</span>'}</td>
    <td>${popup ? `<span class="metric-main">${formatInt(popup.accepted)} redirects</span><span class="submetric">${formatRate(popup.acceptanceRate)} of ${formatInt(popup.show)} shown · n=${formatInt(popup.popupSentimentSample)} rated</span>` : '<span class="metric-main">—</span><span class="submetric">No country sample</span>'}</td>
    <td>${campaigns.length ? `<span class="badge neutral">${esc(campaigns.at(-1).localOnly ? 'Local draft' : campaigns.at(-1).status || 'Tracked')}</span><span class="submetric">Audience ${formatInt(sum(campaigns, 'audience_size'))} · evidence ${formatInt(sum(campaigns, 'evidence_submissions'))}</span>` : campaignEmpty}</td>
    <td><span class="badge ${forecastState === 'assumption-driven' ? 'assumption' : forecastState === 'ready' ? 'ready' : 'neutral'}">${esc(forecastState)}</span><span class="submetric">${forecastState === 'unavailable' ? 'Effective count missing' : 'Editable assumptions'}</span></td>
    <td><span class="quality-flag">Freshness gap</span><span class="submetric">${quality}</span></td>
  </tr>`;
}

function renderTable(records) {
  $('#country-rows').innerHTML = records.map(tableRow).join('');
  $('#country-empty').hidden = records.length > 0;
  if (!records.length) state.selectedKey = null;
  else if (!records.some(record => recordKey(record) === state.selectedKey)) state.selectedKey = recordKey(records[0]);
}

function selectedRecord(records) {
  return records.find(record => recordKey(record) === state.selectedKey) || null;
}

function lineChart(points, target) {
  if (points.length < 2) return '<div class="chart-empty">Not enough weekly history for a trend.</div>';
  const width = 440, height = 128, pad = 12;
  const values = [...points.map(point => point.value), target];
  const min = Math.min(...values) - .03, max = Math.max(...values) + .03;
  const x = index => pad + (index / (points.length - 1)) * (width - pad * 2);
  const y = value => height - pad - ((value - min) / (max - min || 1)) * (height - pad * 2);
  const polyline = points.map((point, index) => `${x(index)},${y(point.value)}`).join(' ');
  const circles = points.map((point, index) => `<circle cx="${x(index)}" cy="${y(point.value)}" r="3"><title>${esc(point.label)}: ${formatSourceRating(point.value)}</title></circle>`).join('');
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="Rating trend from ${formatSourceRating(points[0].value)} to ${formatSourceRating(points.at(-1).value)}">
    <line class="grid" x1="${pad}" y1="${height / 2}" x2="${width - pad}" y2="${height / 2}"></line>
    <line class="target" x1="${pad}" y1="${y(target)}" x2="${width - pad}" y2="${y(target)}"><title>Target ${formatRating(target)}</title></line>
    <polyline class="line" points="${polyline}"></polyline>${circles}</svg>
    <div class="chart-labels"><span>${esc(points[0].label)}</span><span>Target ${formatRating(target)}</span><span>${esc(points.at(-1).label)}</span></div>`;
}

function funnelRow(label, value, base, className = '') {
  const width = base > 0 && Number.isFinite(Number(value)) ? Math.max(1, Math.min(100, (Number(value) / base) * 100)) : 0;
  return `<div class="funnel-row ${className}"><span>${esc(label)}</span><div class="funnel-bar"><i style="width:${width}%"></i></div><strong>${formatInt(value)}</strong></div>`;
}

function renderPopupDetail(popup) {
  if (!popup) {
    $('#popup-funnel').innerHTML = '<div class="chart-empty">No popup country sample is available for this selection.</div>';
    $('#segment-breakdown').innerHTML = '';
    $('#popup-stars').innerHTML = '<div class="chart-empty">No popup sentiment sample is available.</div>';
    return;
  }
  $('#popup-funnel').innerHTML = [
    funnelRow('Saw popup', popup.show, popup.show),
    funnelRow('Closed', popup.close, popup.show),
    funnelRow('Store redirect', popup.accepted, popup.show, 'redirect'),
    funnelRow('Declined', popup.declined, popup.show),
    funnelRow('Rated in popup', popup.rated, popup.show),
  ].join('');
  $('#segment-breakdown').innerHTML = `<table class="segment-table"><thead><tr><th>Segment</th><th>Shown</th><th>Redirected</th><th>Rated</th></tr></thead><tbody>${popup.segments.map(segment => `<tr><td>${esc(segment.segment)}</td><td>${formatInt(segment.show)}</td><td>${formatInt(segment.accepted)}</td><td>${formatInt(segment.rated)}</td></tr>`).join('')}</tbody></table>`;
  const maxStar = Math.max(...popup.stars, 1);
  $('#popup-stars').innerHTML = `<div class="star-distribution" role="img" aria-label="In-product popup sentiment distribution from one to five stars">${popup.stars.map((value, index) => `<div class="star-row"><span>${index + 1}★</span><div><i style="width:${(value / maxStar) * 100}%"></i></div><strong>${formatInt(value)}</strong></div>`).join('')}</div><p class="explain">n=${formatInt(popup.popupSentimentSample)} in-popup ratings. This is sentiment, not an external-store rating.</p>`;
}

function renderFeedback(record) {
  const feedback = feedbackFor(record);
  if (!feedback) {
    $('#feedback-signal').innerHTML = '<div class="chart-empty">No aggregated feedback tickets are available for this country.</div>';
    return;
  }
  const lowShare = percentage(feedback.lowScoreCount, feedback.ratedCount);
  const languages = feedback.languages.slice(0, 3).map(([language, count]) => `${language} ${formatInt(count)}`).join(' · ');
  $('#feedback-signal').innerHTML = `<div class="feedback-grid">
    <div><strong>${formatInt(feedback.ticketCount)}</strong><span>tickets</span></div>
    <div><strong>${formatRating(feedback.averageStar)}</strong><span>average in-ticket star</span></div>
    <div><strong>${formatRate(lowShare)}</strong><span>0–1 star share</span></div>
  </div><p class="explain">All platforms · ${esc(feedback.firstAt?.slice(0, 10) || '—')} to ${esc(feedback.lastAt?.slice(0, 10) || '—')}${languages ? ` · ${esc(languages)}` : ''}. Aggregated operational signal only; raw IDs and text are excluded.</p>`;
}

function renderCampaignFunnel(record) {
  const campaigns = campaignFor(record);
  $('#campaign-source-label').textContent = state.data.campaignTracker?.registryConnected ? 'Campaigns registry + tracker' : state.data.mode === 'live-private-sheet-api' ? 'screenshot tracker connected' : 'source unavailable in demo mode';
  if (!campaigns.length) {
    $('#campaign-funnel').innerHTML = '<div class="chart-empty">No production campaign rows exist for this country. Smoke-test and unassigned tracker rows are excluded.</div>';
    return;
  }
  const campaign = campaigns.at(-1);
  const base = campaign.audience_size || 1;
  $('#campaign-funnel').innerHTML = [
    funnelRow('Audience', campaign.audience_size, base), funnelRow('Sent', campaign.emails_sent, base),
    funnelRow('Delivered', campaign.delivered, base), funnelRow('Screenshot sent', campaign.evidence_submissions, base),
    funnelRow('Pending check', campaign.pending_review, base), funnelRow('Evidence accepted', campaign.approved, base),
    funnelRow('Blocked / rejected', campaign.rejected, base), funnelRow('Reward recorded', campaign.rewards_granted, base),
  ].join('');
}

function forecastDefaults(record, popup) {
  return state.forecastInputs.get(recordKey(record)) || {
    effectiveRatingCount: '', popupExposure: 0, acceptanceRate: popup?.acceptanceRate ?? '',
    redirectToVerifiedRate: '', popupExpectedScore: '', campaignAudience: campaignFor(record).at(-1)?.audience_size || 0,
    campaignVerificationRate: '', campaignExpectedScore: '', remainingExpectedScore: '',
  };
}

function setInput(id, value) { $(id).value = value ?? ''; }

function renderForecast(record, popup) {
  const inputs = forecastDefaults(record, popup);
  $('#forecast-country-label').textContent = `${countryName(record.countryCode)} · ${record.store === 'GooglePlay' ? 'Google Play' : 'App Store'}`;
  setInput('#forecast-current', record.current);
  setInput('#forecast-target', state.filters.target);
  setInput('#forecast-count', inputs.effectiveRatingCount);
  setInput('#forecast-popup-exposure', inputs.popupExposure);
  setInput('#forecast-acceptance', inputs.acceptanceRate);
  setInput('#forecast-popup-verified', inputs.redirectToVerifiedRate);
  setInput('#forecast-popup-score', inputs.popupExpectedScore);
  setInput('#forecast-campaign-audience', inputs.campaignAudience);
  setInput('#forecast-campaign-rate', inputs.campaignVerificationRate);
  setInput('#forecast-campaign-score', inputs.campaignExpectedScore);
  setInput('#forecast-remaining-score', inputs.remainingExpectedScore);
  updateForecast(record);
}

function readForecastInputs() {
  const read = id => $(id).value === '' ? '' : Number($(id).value);
  return {
    effectiveRatingCount: read('#forecast-count'), popupExposure: read('#forecast-popup-exposure'),
    acceptanceRate: read('#forecast-acceptance'), redirectToVerifiedRate: read('#forecast-popup-verified'),
    popupExpectedScore: read('#forecast-popup-score'), campaignAudience: read('#forecast-campaign-audience'),
    campaignVerificationRate: read('#forecast-campaign-rate'), campaignExpectedScore: read('#forecast-campaign-score'),
    remainingExpectedScore: read('#forecast-remaining-score'),
  };
}

function updateForecast(record) {
  const inputs = readForecastInputs();
  state.forecastInputs.set(recordKey(record), inputs);
  const result = mixedForecast({ currentRating: record.current, target: Number($('#forecast-target').value), inputsVerified: false, ...inputs });
  const badge = $('#forecast-state');
  badge.textContent = result.state;
  badge.className = `badge ${result.state === 'assumption-driven' ? 'assumption' : result.state === 'ready' ? 'ready' : 'neutral'}`;
  const popup = lookupPopup(record);
  const sample = popup ? `${formatInt(popup.show)} popup exposures / ${formatInt(popup.rated)} in-popup ratings` : 'No popup country sample';
  const hasN = Number.isFinite(Number(inputs.effectiveRatingCount)) && Number(inputs.effectiveRatingCount) > 0;
  const popupPlanned = Number(inputs.popupExposure) > 0;
  const popupReady = !popupPlanned || ([inputs.acceptanceRate, inputs.redirectToVerifiedRate, inputs.popupExpectedScore].every(presentNumber));
  const campaignPlanned = Number(inputs.campaignAudience) > 0;
  const campaignReady = !campaignPlanned || ([inputs.campaignVerificationRate, inputs.campaignExpectedScore].every(presentNumber));
  $('#forecast-readiness').innerHTML = `<strong>Prediction readiness</strong><div class="readiness-list">
    <div class="readiness-item ${hasN ? 'complete' : ''}"><span>Rating inertia (N)</span><span>${hasN ? `${formatInt(inputs.effectiveRatingCount)} · entered assumption` : 'missing · exact rating path blocked'}</span></div>
    <div class="readiness-item ${popupReady ? 'complete' : ''}"><span>Popup channel</span><span>${popupPlanned ? (popupReady ? 'assumptions complete' : 'conversion/score missing') : 'not included'}</span></div>
    <div class="readiness-item ${campaignReady ? 'complete' : ''}"><span>Campaign channel</span><span>${campaignPlanned ? (campaignReady ? 'assumptions complete' : 'verification/score missing') : 'not included'}</span></div>
    <div class="readiness-item"><span>Evidence confidence</span><span>${hasN ? 'low · manual inputs' : 'unavailable'}</span></div>
  </div>`;
  const plannedRedirects = popupPlanned && presentNumber(inputs.acceptanceRate) ? Number(inputs.popupExposure) * Number(inputs.acceptanceRate) : null;
  const popupVerified = popupReady && popupPlanned ? plannedRedirects * Number(inputs.redirectToVerifiedRate) : null;
  const campaignVerified = campaignReady && campaignPlanned ? Number(inputs.campaignAudience) * Number(inputs.campaignVerificationRate) : null;
  $('#forecast-channel-path').innerHTML = `<strong>Channel prediction path</strong><div class="path-grid">
    <div class="path-step"><span>Popup exposures</span><strong>${formatInt(inputs.popupExposure)}</strong></div>
    <div class="path-step"><span>Expected redirects</span><strong>${formatInt(plannedRedirects)}</strong></div>
    <div class="path-step"><span>Expected verified popup ratings</span><strong>${formatInt(popupVerified)}</strong></div>
    <div class="path-step"><span>Expected verified campaign ratings</span><strong>${formatInt(campaignVerified)}</strong></div>
  </div><p class="explain">Redirect and screenshot tracker states are operational signals. Only the separately entered verified-rating conversion assumptions feed the rating prediction.</p>`;
  if (result.state === 'unavailable') {
    $('#forecast-result').innerHTML = `<strong>Forecast unavailable</strong><p class="muted">No precise target is produced. Missing: ${esc(result.missing.join('; '))}.</p><ul><li>Confidence: unavailable</li><li>Sample: ${esc(sample)}</li><li>AppFollow review weight N is not supplied.</li></ul>`;
  } else {
    const remaining = result.remainingReviews === null ? 'Not solvable with current score assumption' : formatInt(result.remainingReviews);
    $('#forecast-result').innerHTML = `<strong>Assumption-driven scenario</strong><div class="result-number">${formatRating(result.projectedRating)} projected</div><ul><li>Expected verified popup ratings: ${formatInt(result.popupVerified)}</li><li>Expected verified campaign ratings: ${formatInt(result.campaignVerified)}</li><li>Additional verified ratings to close remaining gap: ${remaining}</li><li>Confidence: low · all entered conversions/scores are editable assumptions</li><li>Sample: ${esc(sample)}</li></ul>`;
  }
}

function renderDetail(record) {
  if (!record) {
    $('#detail-heading').textContent = 'Select a country';
    $('#detail-rating').textContent = '—';
    return;
  }
  const popup = lookupPopup(record);
  const volume = lookupVolume(record);
  $('#detail-heading').textContent = `${countryName(record.countryCode)} (${record.countryCode})`;
  $('#detail-rating').textContent = formatSourceRating(record.current);
  const volumeText = Number.isFinite(volume?.weeklyDownloads) ? `${volume.weeklyDownloadsExact ? '' : '≈ '}${formatInt(volume.weeklyDownloads)} weekly downloads${volume.weeklyDownloadsExact ? '' : ' run-rate'}` : 'weekly downloads unavailable';
  $('#detail-subtitle').textContent = `${record.brand} · ${record.store === 'GooglePlay' ? 'Google Play / Android' : 'App Store / iOS'} · ${record.sourcePeriod} · ${volumeText}`;
  $('#trend-period').textContent = `${record.points.length} observations`;
  $('#rating-trend').innerHTML = lineChart(record.points, Number(state.filters.target));
  renderPopupDetail(popup);
  renderFeedback(record);
  renderCampaignFunnel(record);
  renderForecast(record, popup);
}

function renderCampaigns() {
  const records = [...state.data.campaigns, ...state.drafts];
  const progress = records.map(campaign => ({ campaign, forecast: campaignProgress(campaign) }));
  const active = records.filter(campaign => campaign.status === 'active').length;
  const audience = sum(records, 'audience_size');
  const submitted = sum(records, 'evidence_submissions');
  const pending = sum(records, 'pending_review');
  const projected = progress.reduce((total, item) => total + (Number(item.forecast.projectedSubmissions) || 0), 0);
  const predictedCampaigns = progress.filter(item => item.forecast.projectedSubmissions !== null).length;
  $('#campaign-notice').innerHTML = state.data.mode === 'live-private-sheet-api'
    ? '<strong>Campaign registry connected.</strong> No production outcomes are invented. Uploaded IDs remain client-side until an operator explicitly prepares the campaign.'
    : '<strong>Synthetic demo mode.</strong> Campaign progress is unavailable because this host cannot access the private source. Uploaded IDs remain client-side until preparation.';
  $('#campaign-progress-summary').innerHTML = [
    { label: 'Active campaigns', value: active, note: records.length ? `${records.length} total records` : 'No production campaign yet' },
    { label: 'Audience', value: formatInt(audience), note: 'Assigned tracker participants' },
    { label: 'Evidence submitted', value: formatInt(submitted), note: audience ? `${formatRate(percentage(submitted, audience))} participation` : 'Awaiting audience mapping' },
    { label: 'Pending checks', value: formatInt(pending), note: 'Current review workload' },
    { label: 'Pace prediction', value: predictedCampaigns ? formatInt(projected) : '—', note: predictedCampaigns ? `${predictedCampaigns} campaign forecast${predictedCampaigns === 1 ? '' : 's'}` : 'Needs audience, dates, and observed submissions' },
  ].map(item => `<div class="progress-kpi"><span>${esc(item.label)}</span><strong>${esc(item.value)}</strong><small>${esc(item.note)}</small></div>`).join('');
  if (!records.length) {
    $('#campaign-list').className = 'empty';
    $('#campaign-list').textContent = state.data.mode === 'live-private-sheet-api'
      ? `Screenshot tracker connected. No production campaign rows are available yet. ${formatInt(state.data.campaignTracker?.excludedTestSubmissions || 0)} smoke-test submissions and ${formatInt(state.data.campaignTracker?.unassignedSubmissions || 0)} unassigned row are excluded from campaign metrics.`
      : 'Campaign source unavailable in synthetic demo mode. Connect through the protected production hostname to view campaign progress.';
  } else {
    $('#campaign-list').className = '';
    $('#campaign-list').innerHTML = progress.map(({ campaign, forecast }) => {
      const pace = forecast.projectedSubmissions === null
        ? `Pace forecast unavailable: ${forecast.missing.join(', ') || 'campaign has not started'}.`
        : `${forecast.state === 'complete' ? 'Final' : 'Projected final'} evidence submissions: ${formatInt(forecast.projectedSubmissions)} · confidence ${forecast.confidence}.`;
      const progressWidth = Number.isFinite(forecast.completionRate) ? Math.max(0, Math.min(100, forecast.completionRate * 100)) : 0;
      return `<article class="campaign-record">
        <div class="panel-heading"><h3>${esc(campaign.name || campaign.campaign_id)}</h3><span class="badge ${forecast.state === 'observed-pace' ? 'assumption' : 'neutral'}">${campaign.localOnly ? 'Local draft' : esc(campaign.status || 'Tracked')}</span></div>
        <p>${campaign.countryCode ? `${esc(countryName(campaign.countryCode))} · ` : ''}${esc(campaign.start_date || 'No start')} → ${esc(campaign.end_date || 'No end')} · ${pace}</p>
        <div class="campaign-metrics">
          <div><strong>${formatInt(campaign.audience_size)}</strong><span>audience</span></div>
          <div><strong>${formatInt(campaign.evidence_submissions)}</strong><span>submitted evidence</span></div>
          <div><strong>${formatInt(campaign.pending_review)}</strong><span>pending checks</span></div>
          <div><strong>${formatInt(campaign.rewards_granted)}</strong><span>rewards recorded</span></div>
        </div>
        <div class="campaign-progress-bar" role="img" aria-label="${formatRate(forecast.completionRate)} of audience has submitted evidence"><i style="width:${progressWidth}%"></i></div>
        <p class="explain">Evidence accepted: ${formatInt(campaign.approved)} · blocked/rejected: ${formatInt(campaign.rejected)} · verified external ratings: not inferred.</p>
      </article>`;
    }).join('');
  }
  const series = dailyRedirectSeries(scopedRecords());
  $('#redirect-source-period').textContent = `Through ${state.data.sourceMetadata?.popup?.dailyRedirectThrough || 'unknown'} · current filter scope`;
  if (!series.length) {
    $('#redirect-trend').innerHTML = '<div class="empty">No daily redirects match the current brand, store, country, and volume scope.</div>';
    return;
  }
  const width = 620, height = 150, pad = 14;
  const max = Math.max(...series.map(item => item.redirects), 1);
  const x = index => pad + (index / Math.max(1, series.length - 1)) * (width - pad * 2);
  const y = value => height - pad - (value / max) * (height - pad * 2);
  const points = series.map((item, index) => `${x(index)},${y(item.redirects)}`).join(' ');
  const dots = series.map((item, index) => `<circle cx="${x(index)}" cy="${y(item.redirects)}" r="2"><title>${item.date}: ${formatInt(item.redirects)} redirects</title></circle>`).join('');
  const total = series.reduce((sumValue, item) => sumValue + item.redirects, 0);
  $('#redirect-trend').innerHTML = `<svg class="redirect-line" viewBox="0 0 ${width} ${height}" role="img" aria-label="${formatInt(total)} daily store redirects from ${series[0].date} through ${series.at(-1).date} in the current filtered scope"><line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}"></line><polyline points="${points}"></polyline>${dots}</svg><div class="chart-labels"><span>${series[0].date}</span><span>${formatInt(total)} total redirects</span><span>${series.at(-1).date}</span></div>`;
}

function renderQuality() {
  const unmapped = state.data.unmapped;
  const meta = state.data.snapshotMetadata;
  const sources = state.data.sourceMetadata || {};
  const dailyThrough = sources.popup?.dailyRedirectThrough || 'unknown';
  const downloadThrough = latestString(state.data.volumeRecords.map(row => row.asOfDate)) || 'unknown';
  const registryRows = state.data.campaignTracker?.campaignRegistryRows || 0;
  const registryConnected = Boolean(state.data.campaignTracker?.registryConnected || sources.campaign?.registryConnected);
  const rawIqAndroid = state.data.popupRows.filter(row => row.brand === 'IQ Option' && row.store === 'GooglePlay').reduce((total, row) => total + row.show, 0);
  const pivotIqAndroid = state.data.popupHighLevelSummary.find(row => row.brand === 'IQ Option' && row.store === 'GooglePlay')?.show;
  const popupCrossCheck = presentNumber(pivotIqAndroid) && Number(pivotIqAndroid) === rawIqAndroid
    ? `The high-level pivot and joinable raw rows both report ${formatInt(rawIqAndroid)} IQ Option Android users shown.`
    : `The high-level pivot reports ${formatInt(pivotIqAndroid)} IQ Option Android users shown versus ${formatInt(rawIqAndroid)} in joinable raw rows. The discrepancy remains visible.`;
  $('#quality-list').innerHTML = `<div class="quality-list">
    <div class="quality-item"><strong>Country normalization</strong>${unmapped.length ? `${unmapped.length} unmapped source values: ${esc(unmapped.join(', '))}. Their aggregates are excluded from country joins but remain visible here.` : 'No source countries are unmapped. Known aliases include Viet Nam/Vietnam and Venezuela variants.'}</div>
    <div class="quality-item"><strong>Rating weight</strong>Per-country/store effective rating counts are absent. Overall rating is explicitly unweighted and forecasts begin unavailable.</div>
    <div class="quality-item"><strong>Download volume</strong>Weekly values are run-rate estimates from month-to-date Google Play new installs through ${esc(downloadThrough)}. Missing volume is excluded only when the minimum is above zero.</div>
    <div class="quality-item"><strong>Freshness</strong>AppFollow is expected every Friday and its latest available source period is ${esc(sources.appFollow?.latestPeriod || state.data.ratingData.periods.at(-1) || 'unknown')}. Popup is manually updated monthly, but raw popup rows remain an undated snapshot and daily redirects end ${esc(dailyThrough)}. Download volume is dated through ${esc(sources.volume?.dataThrough || downloadThrough)}. Permission-change timestamps are not treated as evidence refresh dates, and mismatched periods are never presented as historical comparisons.</div>
    <div class="quality-item"><strong>Popup semantics</strong>Accepted means store redirect. Popup star distributions are sentiment signals, not external-store reviews.</div>
    <div class="quality-item"><strong>Popup summary cross-check</strong>${popupCrossCheck} Scoped KPIs use raw rows for consistent country and volume filtering.</div>
    <div class="quality-item"><strong>Campaign source</strong>${state.data.mode === 'live-private-sheet-api' ? 'Live private tracker aggregates were refreshed' : 'Synthetic demo data is active'} ${esc(state.data.campaignTracker?.generatedAt || 'at an unknown time')}. Current smoke-test and unassigned rows are excluded; no production outcomes are invented.</div>
    <div class="quality-item"><strong>Campaign privacy</strong>No user IDs, token hashes, submission or claim IDs, Drive file IDs, screenshot URLs, images, or review notes are deployed. Screenshots remain in the private evidence store and are configured for ${formatInt(state.data.campaignTracker?.retentionDays || 90)}-day retention.</div>
    <div class="quality-item"><strong>Campaign country join</strong>${registryConnected ? `The privacy-safe Campaigns registry is connected with ${formatInt(registryRows)} production row${registryRows === 1 ? '' : 's'}. Add one row keyed by the uploader campaign ID to activate country joins and pace forecasting.` : 'The fallback snapshot predates the Campaigns registry; live mode is required for current campaign joins.'}</div>
    <div class="quality-item"><strong>Participation evidence</strong>An accepted screenshot proves only that the campaign verification step was accepted. It is not automatically a verified external-store rating and must not determine reward eligibility or rating value.</div>
    <div class="quality-item"><strong>Popup workbook coverage</strong>${meta ? `${formatInt(meta.rawRows)} raw snapshot rows, ${formatInt(meta.countryRateRows)} Rates-by-Country rows, ${formatInt(meta.dailyRedirectRows)} daily rows, and ${formatInt(meta.feedbackTicketRowsAggregated)} feedback tickets are represented.` : 'Popup snapshot metadata unavailable.'} Personal IDs and free-text feedback are not included.</div>
  </div>`;
}

function renderFreshnessNotice() {
  const sources = state.data.sourceMetadata || {};
  const appLatestPeriod = state.data.ratingData.periods.at(-1) || 'unknown';
  const appPoint = latestString(state.data.ratingData.records
    .flatMap(record => record.points)
    .filter(point => point.period === appLatestPeriod)
    .map(point => `${String(point.order).padStart(3, '0')}|${point.label}`))?.split('|').slice(1).join('|') || appLatestPeriod;
  const dailyThrough = sources.popup?.dailyRedirectThrough || 'unknown';
  const modeLead = state.data.mode === 'live-private-sheet-api'
    ? '<strong>Live source cadence and freshness:</strong>'
    : `<strong>Synthetic demo mode:</strong> The live private source API was unavailable (${esc(state.data.reason || 'unknown reason')}). Demo values are invented and are not source evidence.`;
  const popupState = sources.popup?.status === 'stale' ? ' <strong>The popup workbook is beyond its 45-day monthly-update window.</strong>' : '';
  $('#freshness-notice').innerHTML = `${modeLead} AppFollow is expected weekly on Friday and is available through ${esc(appPoint)}; the popup workbook is manually updated monthly, its raw snapshot has no event date, and daily redirects end ${esc(dailyThrough)}.${popupState} These sources are not presented as same-period historical evidence when their dates differ.`;
}

function render() {
  const scope = volumeScope();
  const records = scopedRecords();
  renderFreshnessNotice();
  renderOverview(records, scope);
  renderTable(records);
  renderDetail(selectedRecord(records));
  renderCampaigns();
  renderQuality();
}

function resetFilters() {
  state.filters = { ...CONFIG.defaults, search: '' };
  state.selectedKey = null;
  initializeFilters();
  render();
}

function bindEvents() {
  $('#brand-filter').addEventListener('change', event => { state.filters.brand = event.target.value; state.filters.country = 'all'; initializeFilters(); render(); });
  $('#store-filter').addEventListener('change', event => { state.filters.store = event.target.value; state.filters.country = 'all'; initializeFilters(); render(); });
  $('#country-filter').addEventListener('change', event => { state.filters.country = event.target.value; state.selectedKey = null; render(); });
  $('#period-filter').addEventListener('change', event => { state.filters.period = event.target.value; state.selectedKey = null; render(); });
  $('#target-filter').addEventListener('input', event => { state.filters.target = Number(event.target.value) || CONFIG.defaults.target; render(); });
  $('#volume-filter').addEventListener('input', event => { state.filters.minWeeklyDownloads = Number(event.target.value) || 0; state.selectedKey = null; render(); });
  $('#search-filter').addEventListener('input', event => { state.filters.search = event.target.value; state.selectedKey = null; render(); });
  $('#reset-filters').addEventListener('click', resetFilters);
  $('#country-rows').addEventListener('click', event => selectRow(event.target.closest('tr')));
  $('#country-rows').addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); selectRow(event.target.closest('tr')); } });
  $('#forecast-form').addEventListener('input', () => {
    const record = selectedRecord(scopedRecords());
    if (!record) return;
    if (document.activeElement === $('#forecast-target')) {
      state.filters.target = Number($('#forecast-target').value) || CONFIG.defaults.target;
      $('#target-filter').value = state.filters.target.toFixed(2);
    }
    updateForecast(record);
    $('#country-rows').innerHTML = scopedRecords().map(tableRow).join('');
  });
  $('#new-campaign').addEventListener('click', openCampaignDialog);
  $('#close-campaign').addEventListener('click', () => $('#campaign-dialog').close());
  $('#user-id-file').addEventListener('change', handleUserIdFile);
  $('#draft-id').addEventListener('input', clearCampaignResult);
  $('#draft-name').addEventListener('input', buildCampaignMessage);
  $('#draft-country').addEventListener('change', buildCampaignMessage);
  $('#draft-start').addEventListener('input', buildCampaignMessage);
  $('#draft-end').addEventListener('input', buildCampaignMessage);
  $('#rotate-links').addEventListener('change', clearCampaignResult);
  $('#copy-message').addEventListener('click', copyCampaignMessage);
  $('#download-mailing').addEventListener('click', downloadMailingCsv);
  $('#download-exclusions').addEventListener('click', downloadExclusionsCsv);
  $('#campaign-form').addEventListener('submit', prepareCampaign);
}

function selectRow(row) {
  if (!row) return;
  state.selectedKey = row.dataset.key;
  render();
  if (matchMedia('(max-width: 1180px)').matches) $('#country-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openCampaignDialog() {
  const record = selectedRecord(scopedRecords());
  if (record) $('#draft-country').value = record.countryCode;
  $('#draft-brand').value = state.filters.brand;
  $('#draft-store').value = state.filters.store;
  if (!$('#draft-start').value) $('#draft-start').value = new Date().toISOString().slice(0, 10);
  const campaignDate = ($('#draft-start').value || new Date().toISOString().slice(0, 10)).replaceAll('-', '');
  const suggestedId = [state.filters.brand, state.filters.store, $('#draft-country').value, campaignDate]
    .map(value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''))
    .filter(Boolean).join('_').slice(0, 64);
  $('#draft-id').value = suggestedId;
  state.currentIds = [];
  state.currentUniqueIdCount = 0;
  state.preparedCampaign = null;
  $('#user-id-file').value = '';
  $('#file-status').textContent = 'Choose a CSV. The USERID column may appear anywhere.';
  $('#prepare-campaign').disabled = true;
  $('#rotate-links').checked = false;
  clearCampaignResult('Upload the Metabase CSV to begin.');
  buildCampaignMessage();
  $('#campaign-dialog').showModal();
}

function buildCampaignMessage() {
  const code = $('#draft-country').value;
  const dates = [$('#draft-start').value || '[start date]', $('#draft-end').value || '[end date]'];
  $('#campaign-message').value = `Campaign: ${$('#draft-name').value.trim() || 'Rating-neutral feedback campaign'}\nCountry: ${countryName(code)} (${code})\nPeriod: ${dates[0]} to ${dates[1]}\n\nInvite eligible users to share honest product feedback. If they independently choose to leave a store rating or review, participation, support, and any reward eligibility must not depend on doing so, on its star value, or on whether it is positive or negative.\n\nProvide each participant only their unique secure screenshot-upload link issued by the campaign service. Do not share the base uploader URL as a substitute for a secure link.\n\nAudience file: ${state.currentUniqueIdCount ? `${state.currentUniqueIdCount.toLocaleString()} unique IDs ready for eligibility checking` : '[upload Metabase USERID CSV]'}. IDs are sent only when an operator prepares the campaign and are not stored in the dashboard.`;
}

function handleUserIdFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const detected = extractUserIds(reader.result);
    state.currentIds = detected.inputIds;
    state.currentUniqueIdCount = detected.ids.length;
    const column = detected.header ? `“${detected.header}”` : detected.column !== null ? `column ${detected.column + 1}` : 'no column';
    const duplicateCount = Math.max(0, detected.inputIds.length - detected.ids.length);
    $('#file-status').textContent = `${formatInt(detected.ids.length)} unique IDs detected in ${column}${duplicateCount ? ` · ${formatInt(duplicateCount)} duplicate row${duplicateCount === 1 ? '' : 's'} will be reported` : ''}. Nothing has been uploaded yet.`;
    $('#prepare-campaign').disabled = !detected.inputIds.length;
    clearCampaignResult(detected.inputIds.length ? 'Ready to check eligibility and create secure links.' : 'No USERIDs were detected. Check the CSV column.');
    buildCampaignMessage();
  };
  reader.readAsText(file);
}

async function copyCampaignMessage() {
  try { await navigator.clipboard.writeText($('#campaign-message').value); $('#copy-message').textContent = 'Copied'; }
  catch { $('#campaign-message').select(); document.execCommand('copy'); }
  setTimeout(() => { $('#copy-message').textContent = 'Copy message'; }, 1200);
}

function downloadCsv(filename, headers, rows) {
  const contents = toCsv(headers, rows);
  const blob = new Blob([contents], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadMailingCsv() {
  const result = state.preparedCampaign;
  if (!result) return;
  downloadCsv(`mailing-ready-${result.campaign.campaign_id}.csv`, ['USERID', 'UPLOAD_URL'], result.mailingRows.map(row => [row.userId, row.uploadUrl]));
}

function downloadExclusionsCsv() {
  const result = state.preparedCampaign;
  if (!result) return;
  downloadCsv(`excluded-users-${result.campaign.campaign_id}.csv`, ['USERID', 'REASON'], result.excludedRows.map(row => [row.userId, row.reason]));
}

function clearCampaignResult(message = 'Campaign details changed. Prepare again when ready.') {
  state.preparedCampaign = null;
  $('#campaign-result').hidden = true;
  const status = $('#campaign-prepare-status');
  status.className = 'campaign-prepare-status';
  status.textContent = message;
}

function showPreparedCampaign(result) {
  state.preparedCampaign = result;
  $('#campaign-result').hidden = false;
  $('#campaign-result-summary').innerHTML = `<div class="campaign-result-grid">
    <div><strong>${formatInt(result.inputCount)}</strong><span>input rows</span></div>
    <div><strong>${formatInt(result.eligibleCount)}</strong><span>mailing links created</span></div>
    <div><strong>${formatInt(result.excludedCount)}</strong><span>excluded rows</span></div>
  </div>`;
  $('#download-mailing').disabled = !result.mailingRows.length;
  $('#download-exclusions').disabled = !result.excludedRows.length;
  const status = $('#campaign-prepare-status');
  status.className = 'campaign-prepare-status success';
  status.textContent = result.mailingRows.length
    ? 'Campaign prepared. The mailing CSV download has started; keep it private and verify it before sending.'
    : 'Eligibility check completed, but no new mailing links were created. Review the exclusions file.';
}

function updateCampaignInView(campaign) {
  const normalized = { ...campaign, countryCode: $('#draft-country').value, store: state.filters.store };
  const index = state.data.campaigns.findIndex(row => row.campaign_id === campaign.campaign_id);
  if (index >= 0) state.data.campaigns[index] = { ...state.data.campaigns[index], ...normalized };
  else state.data.campaigns.push(normalized);
}

async function prepareCampaign(event) {
  event.preventDefault();
  if (!state.currentIds.length || !event.currentTarget.reportValidity()) return;
  const button = $('#prepare-campaign');
  button.disabled = true;
  button.textContent = 'Preparing…';
  clearCampaignResult('Checking global participation and generating secure links…');
  try {
    const response = await fetch('/api/campaigns/prepare', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        campaign: {
          campaignId: $('#draft-id').value.trim(), name: $('#draft-name').value.trim(),
          brand: state.filters.brand, store: state.filters.store, country: $('#draft-country').value,
          startDate: $('#draft-start').value, endDate: $('#draft-end').value,
        },
        userIds: state.currentIds,
        rotateExisting: $('#rotate-links').checked,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || result.error || `Campaign service returned ${response.status}`);
    showPreparedCampaign(result);
    updateCampaignInView(result.campaign);
    renderCampaigns();
    if (result.mailingRows.length) downloadMailingCsv();
  } catch (error) {
    const status = $('#campaign-prepare-status');
    status.className = 'campaign-prepare-status error';
    status.textContent = `Campaign was not prepared: ${error.message}`;
  } finally {
    button.disabled = !state.currentIds.length;
    button.textContent = 'Check eligibility & prepare';
  }
}

async function start() {
  try {
    state.data = await loadDashboardData();
    $('#source-mode').textContent = state.data.mode === 'live-private-sheet-api' ? 'Live private Sheets · server refreshed' : 'Synthetic demo · live source unavailable';
    initializeFilters();
    bindEvents();
    render();
  } catch (error) {
    $('#source-mode').textContent = 'Source load failed';
    $('#freshness-notice').textContent = error.message;
  }
}

start();
