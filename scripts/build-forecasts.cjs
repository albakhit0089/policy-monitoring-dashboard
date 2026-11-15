#!/usr/bin/env node
'use strict';

// Builds data/forecasts/food-cpi.json: 12-month food CPI forecasts for the GCC countries.
//
// Input (kept in the repository for reproducibility and provenance):
//   data/sources/faostat-cp-region.csv - FAOSTAT Consumer Price Indices (domain CP), monthly, filtered
//   to Bahrain, Kuwait, Oman, Qatar, Saudi Arabia, the United Arab Emirates and Yemen, from the official
//   bulk download https://bulks-faostat.fao.org/production/ConsumerPriceIndices_E_All_Data_(Normalized).zip
//   (refresh it with scripts/fetch-faostat-cp.cjs).
//
// Method (documented in data/forecasts/README.md):
//   Target series: food CPI index (2015 = 100), monthly. Candidate models: Holt-Winters additive with
//   damped trend and monthly seasonality (parameters chosen by one-step in-sample SSE over a grid), and
//   seasonal naive with drift. Benchmark: plain seasonal naive. The published model per country is the
//   candidate with the lower pooled RMSE in a rolling-origin backtest (36 origins, horizons 1-12).
//   Prediction intervals are empirical quantiles of the backtest errors per horizon (50% and 80%).
//   Food inflation forecasts are derived from the index forecast against the observed index a year
//   earlier, so the two series can never disagree.
//   A country with under MIN_OBS monthly observations, or whose series does not reach the common latest
//   month, is published as status "insufficient_data" with no forecast (this covers Yemen, whose FAOSTAT
//   series ends in 2017).
//
// Usage: node scripts/build-forecasts.cjs

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'data/sources/faostat-cp-region.csv');
const OUT = path.join(ROOT, 'data/forecasts/food-cpi.json');
const COUNTRIES = ['Bahrain', 'Kuwait', 'Oman', 'Qatar', 'Saudi Arabia', 'United Arab Emirates', 'Yemen'];
const ISO3 = { Bahrain: 'BHR', Kuwait: 'KWT', Oman: 'OMN', Qatar: 'QAT', 'Saudi Arabia': 'SAU', 'United Arab Emirates': 'ARE', Yemen: 'YEM' };
const ITEMS = { 23013: 'food', 23012: 'general', 23014: 'inflation' };
const HORIZON = 12;
const MIN_OBS = 120;       // ten years of monthly data before a model is attempted
const BACKTEST_ORIGINS = 36;
const round = (value, places = 2) => Math.round(value * 10 ** places) / 10 ** places;

// ---------- parse ----------
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((line) => line.some(Boolean));
}

function readSeries() {
  const [header, ...lines] = parseCsv(fs.readFileSync(SOURCE, 'utf8').replace(/^﻿/, ''));
  const col = Object.fromEntries(header.map((name, i) => [name, i]));
  for (const name of ['Area', 'Item Code', 'Months Code', 'Year', 'Value', 'Flag']) {
    if (!(name in col)) throw new Error(`Missing column in ${SOURCE}: ${name}`);
  }
  const series = {}; // country -> { food: {ym: value}, general: {...}, inflation: {...}, flags: {ym: flag} }
  for (const f of lines) {
    const country = f[col.Area];
    if (!COUNTRIES.includes(country)) continue;
    const item = ITEMS[f[col['Item Code']]];
    if (!item) continue;
    const monthCode = Number(f[col['Months Code']]);
    if (monthCode < 7001 || monthCode > 7012) continue; // monthly rows only
    const value = f[col.Value];
    if (value === '') continue;
    const ym = `${f[col.Year]}-${String(monthCode - 7000).padStart(2, '0')}`;
    series[country] ??= { food: {}, general: {}, inflation: {}, flags: {} };
    series[country][item][ym] = Number(value);
    if (item === 'food') series[country].flags[ym] = f[col.Flag];
  }
  return series;
}

// ---------- models ----------
// Holt-Winters additive, damped trend, season length 12. Returns forecast function and 1-step residuals.
function holtWinters(y, { alpha, beta, gamma, phi }) {
  const m = 12;
  if (y.length < 2 * m + 1) return null;
  // Initial state from the first two years.
  const year1 = y.slice(0, m), year2 = y.slice(m, 2 * m);
  const mean1 = year1.reduce((a, b) => a + b) / m, mean2 = year2.reduce((a, b) => a + b) / m;
  let level = mean1, trend = (mean2 - mean1) / m;
  const season = Array.from({ length: m }, (_, i) => ((year1[i] - mean1) + (year2[i] - mean2)) / 2);
  const residuals = [];
  for (let t = 0; t < y.length; t += 1) {
    const s = season[t % m];
    const fit = level + phi * trend + s;
    if (t >= 2 * m) residuals.push(y[t] - fit);
    const lastLevel = level;
    level = alpha * (y[t] - s) + (1 - alpha) * (level + phi * trend);
    trend = beta * (level - lastLevel) + (1 - beta) * phi * trend;
    season[t % m] = gamma * (y[t] - level) + (1 - gamma) * s;
  }
  const forecast = (h) => {
    let dampSum = 0, damp = 1;
    for (let i = 1; i <= h; i += 1) { damp *= phi; dampSum += damp; }
    return level + dampSum * trend + season[(y.length + h - 1) % m];
  };
  const sse = residuals.reduce((a, e) => a + e * e, 0);
  return { forecast, sse };
}

const HW_GRID = [];
for (const alpha of [.1, .2, .3, .4, .5, .6, .7, .8]) for (const beta of [.02, .05, .1, .2]) for (const gamma of [.05, .1, .2, .3]) for (const phi of [.85, .9, .95, .98]) HW_GRID.push({ alpha, beta, gamma, phi });

function fitHW(y) {
  let best = null;
  for (const params of HW_GRID) {
    const fit = holtWinters(y, params);
    if (fit && (!best || fit.sse < best.sse)) best = { ...fit, params };
  }
  return best;
}
// Seasonal naive with drift: value a year earlier plus the average monthly change of the last 36 months.
function seasonalNaiveDrift(y) {
  const span = Math.min(36, y.length - 1);
  const drift = (y[y.length - 1] - y[y.length - 1 - span]) / span;
  return { forecast: (h) => y[y.length - 12 + ((h - 1) % 12)] + drift * h, params: { driftPerMonth: round(drift, 4) } };
}
const seasonalNaive = (y) => ({ forecast: (h) => y[y.length - 12 + ((h - 1) % 12)] });

// Rolling-origin backtest: errors per horizon for a model factory over the final BACKTEST_ORIGINS origins.
function backtest(y, factory) {
  const errors = Array.from({ length: HORIZON + 1 }, () => []);
  const lastOrigin = y.length - 1 - 1; // forecasts must verify against observed values
  const firstOrigin = y.length - BACKTEST_ORIGINS - HORIZON;
  for (let o = firstOrigin; o <= y.length - 1 - HORIZON; o += 1) {
    const model = factory(y.slice(0, o + 1));
    if (!model) continue;
    for (let h = 1; h <= HORIZON; h += 1) {
      const idx = o + h;
      if (idx > lastOrigin + 1) break;
      errors[h].push(y[idx] - model.forecast(h));
    }
  }
  return errors;
}
const pooled = (errors) => errors.flat();
const mae = (e) => e.length ? e.reduce((a, v) => a + Math.abs(v), 0) / e.length : null;
const rmse = (e) => e.length ? Math.sqrt(e.reduce((a, v) => a + v * v, 0) / e.length) : null;
const quantile = (values, q) => {
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q, lo = Math.floor(pos);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo);
};

// ---------- build ----------
function monthsOf(map) { return Object.keys(map).sort(); }
function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const series = readSeries();
const latestByCountry = Object.fromEntries(Object.entries(series).map(([c, s]) => [c, monthsOf(s.food).at(-1)]));
const commonLatest = Object.values(latestByCountry).sort().at(-1);

// Adverse scenario size, derived from the data: for each forecastable country, the rise of food inflation
// from its 2019-2020 median to its 2021-2022 peak (the global food price surge); the shock is the median.
const surges = {};
for (const country of COUNTRIES) {
  const infl = series[country]?.inflation || {};
  const base = Object.entries(infl).filter(([ym]) => ym >= '2019-01' && ym <= '2020-12').map(([, v]) => v);
  const surge = Object.entries(infl).filter(([ym]) => ym >= '2021-01' && ym <= '2022-12').map(([, v]) => v);
  if (base.length >= 12 && surge.length >= 12) surges[country] = round(Math.max(...surge) - quantile(base, .5), 1);
}
const adverseShockPp = round(quantile(Object.values(surges), .5), 1);

const countriesOut = {};
for (const country of COUNTRIES) {
  const s = series[country];
  const months = monthsOf(s.food);
  const latest = months.at(-1);
  const flagCounts = {};
  for (const ym of months) flagCounts[s.flags[ym]] = (flagCounts[s.flags[ym]] || 0) + 1;
  const base = {
    iso3: ISO3[country],
    history: {
      food: Object.fromEntries(months.map((ym) => [ym, s.food[ym]])),
      inflation: s.inflation,
    },
    latestObservation: latest,
    observations: months.length,
    flagCounts,
  };
  // Continuity and sufficiency gate.
  const contiguous = months.every((ym, i) => i === 0 || ym === addMonths(months[i - 1], 1));
  if (months.length < MIN_OBS || latest !== commonLatest || !contiguous) {
    countriesOut[country] = {
      ...base,
      status: 'insufficient_data',
      statusReason: latest !== commonLatest
        ? `The FAOSTAT monthly series for ${country} ends in ${latest}, while the regional series runs to ${commonLatest}; no validated forecast can be produced from it.`
        : `Only ${months.length} contiguous monthly observations are available; at least ${MIN_OBS} are required.`,
      alternatives: country === 'Yemen' ? [
        { name: 'FEWS NET Yemen food security outlook', url: 'https://fews.net/middle-east-and-asia/yemen' },
        { name: 'FAO GIEWS FPMA Yemen price monitoring', url: 'https://fpma.fao.org/giews/v4/yem/media/frontend/Yem-Front.html' },
      ] : [],
    };
    continue;
  }
  const y = months.map((ym) => s.food[ym]);
  // Backtests: candidates and benchmark.
  const btHW = backtest(y, fitHW);
  const btSND = backtest(y, (yy) => seasonalNaiveDrift(yy));
  const btSN = backtest(y, (yy) => seasonalNaive(yy));
  const rmseHW = rmse(pooled(btHW)), rmseSND = rmse(pooled(btSND)), rmseSN = rmse(pooled(btSN));
  const useHW = rmseHW <= rmseSND;
  const chosenBt = useHW ? btHW : btSND;
  const chosenRmse = useHW ? rmseHW : rmseSND;
  const final = useHW ? fitHW(y) : seasonalNaiveDrift(y);
  const metricsAt = (bt, h) => ({ mae: round(mae(bt[h]), 2), rmse: round(rmse(bt[h]), 2) });
  // Forecast with empirical intervals per horizon.
  // The point forecast is bias-corrected by the median backtest error per horizon, and the bands are the
  // empirical error quantiles, so mid always sits inside its own bands.
  const forecastMonths = Array.from({ length: HORIZON }, (_, i) => addMonths(latest, i + 1));
  const index = { mid: [], lo80: [], lo50: [], hi50: [], hi80: [] };
  for (let h = 1; h <= HORIZON; h += 1) {
    const point = final.forecast(h);
    const e = chosenBt[h];
    index.mid.push(round(point + quantile(e, .50), 1));
    index.lo80.push(round(point + quantile(e, .10), 1));
    index.lo50.push(round(point + quantile(e, .25), 1));
    index.hi50.push(round(point + quantile(e, .75), 1));
    index.hi80.push(round(point + quantile(e, .90), 1));
  }
  // Derived year-on-year inflation: forecast index against the observed index 12 months earlier.
  const inflation = Object.fromEntries(Object.entries(index).map(([band, values]) => [band, values.map((v, i) => {
    const prior = s.food[addMonths(forecastMonths[i], -12)];
    return prior ? round((v / prior - 1) * 100, 1) : null;
  })]));
  countriesOut[country] = {
    ...base,
    status: 'forecast',
    model: {
      name: useHW ? 'Holt-Winters additive, damped trend, monthly seasonality' : 'Seasonal naive with drift',
      parameters: final.params,
      backtest: {
        design: `rolling origin, ${BACKTEST_ORIGINS} origins, horizons 1-${HORIZON}, refit at every origin`,
        pooled: { mae: round(mae(pooled(chosenBt)), 2), rmse: round(chosenRmse, 2) },
        h1: metricsAt(chosenBt, 1), h6: metricsAt(chosenBt, 6), h12: metricsAt(chosenBt, 12),
        benchmarkSeasonalNaive: { rmse: round(rmseSN, 2) },
        skillVsSeasonalNaive: round(1 - chosenRmse / rmseSN, 2),
        unit: 'index points (2015 = 100)',
      },
    },
    forecast: { months: forecastMonths, index, inflation },
  };
}

const output = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: {
    name: 'FAOSTAT Consumer Price Indices (domain CP), monthly',
    url: 'https://www.fao.org/faostat/en/#data/CP',
    download: 'https://bulks-faostat.fao.org/production/ConsumerPriceIndices_E_All_Data_(Normalized).zip',
    file: 'data/sources/faostat-cp-region.csv',
    retrievedAt: '2026-11-15',
    unit: 'Food and general consumer price indices (2015 = 100); food price inflation, % change on the same month a year earlier',
    flagLegend: { A: 'Official value', E: 'Estimated value', I: 'Imputed value', X: 'Figure from international organizations' },
  },
  horizonMonths: HORIZON,
  scenario: {
    adverseShockPp,
    derivation: 'Median across GCC countries of the rise in food inflation from its 2019-2020 median to its 2021-2022 peak (FAOSTAT, same series). The adverse scenario ramps year-on-year food inflation up by this amount, linearly over 12 months, on top of the baseline forecast. The policy-response scenario applies a chosen mitigation share to the same shock. Both are hypothetical illustrations, not predictions or measured policy effects.',
    perCountrySurgePp: surges,
  },
  countries: countriesOut,
};
fs.writeFileSync(OUT, JSON.stringify(output));
const made = Object.values(countriesOut).filter((c) => c.status === 'forecast').length;
console.log(`Forecasts written: ${made} countries with forecasts, ${Object.keys(countriesOut).length - made} without; latest observation ${commonLatest}; adverse shock ${adverseShockPp} pp.`);
