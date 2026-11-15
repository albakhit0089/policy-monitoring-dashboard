#!/usr/bin/env node
'use strict';

// Validates data/forecasts/food-cpi.json before it can ship. Fails the build on any breach, so a bad
// regeneration (or a bad source refresh) cannot replace valid published forecasts.

const path = require('node:path');
const data = require(path.resolve(__dirname, '../data/forecasts/food-cpi.json'));

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
const addMonths = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

check(/^\d{4}-\d{2}-\d{2}$/.test(data.generatedAt), 'generatedAt missing');
check(data.source?.url?.startsWith('https://www.fao.org/'), 'source URL missing');
check(typeof data.scenario?.adverseShockPp === 'number' && data.scenario.adverseShockPp > 0 && data.scenario.adverseShockPp < 30, 'adverse shock outside a plausible range');
check(data.scenario?.derivation?.includes('hypothetical'), 'scenario derivation must state it is hypothetical');

const countries = Object.entries(data.countries || {});
check(countries.length === 7, `expected 7 countries, found ${countries.length}`);
let forecasts = 0;
for (const [name, c] of countries) {
  const label = (msg) => `${name}: ${msg}`;
  check(['forecast', 'insufficient_data'].includes(c.status), label('unknown status'));
  const months = Object.keys(c.history?.food || {}).sort();
  check(months.length >= 24, label('too little history'));
  check(months.at(-1) === c.latestObservation, label('latestObservation mismatch'));
  for (const [ym, v] of Object.entries(c.history.food)) check(Number.isFinite(v) && v > 5 && v < 2000, label(`index value out of range at ${ym}`));
  // Reported inflation must match the index-derived year-on-year change.
  for (const [ym, infl] of Object.entries(c.history.inflation)) {
    const idx = c.history.food[ym], prior = c.history.food[addMonths(ym, -12)];
    if (idx == null || prior == null) continue;
    check(Math.abs((idx / prior - 1) * 100 - infl) < 0.35, label(`inflation inconsistent with index at ${ym}`));
  }
  if (c.status === 'insufficient_data') {
    check(!c.forecast, label('insufficient_data must not carry a forecast'));
    check(Boolean(c.statusReason), label('insufficient_data needs a reason'));
    continue;
  }
  forecasts += 1;
  check(months.length >= 120, label('forecast published with under 120 observations'));
  const contiguous = months.every((ym, i) => i === 0 || ym === addMonths(months[i - 1], 1));
  check(contiguous, label('history has gaps'));
  const f = c.forecast;
  check(f.months.length === data.horizonMonths, label('wrong horizon'));
  check(f.months[0] === addMonths(c.latestObservation, 1), label('forecast must start the month after the last observation'));
  for (let i = 0; i < f.months.length; i += 1) {
    check(f.index.lo80[i] <= f.index.lo50[i] && f.index.lo50[i] <= f.index.hi50[i] && f.index.hi50[i] <= f.index.hi80[i], label(`index bands disordered at ${f.months[i]}`));
    check(f.index.lo50[i] <= f.index.mid[i] + 0.01 && f.index.mid[i] <= f.index.hi50[i] + 0.01, label(`mid outside 50% band at ${f.months[i]}`));
    for (const band of ['mid', 'lo80', 'lo50', 'hi50', 'hi80']) check(Number.isFinite(f.index[band][i]), label(`missing index ${band} at ${f.months[i]}`));
    // Derived inflation must equal the band value against the observed index a year earlier.
    const prior = c.history.food[addMonths(f.months[i], -12)];
    check(prior != null, label(`no observed base for inflation at ${f.months[i]}`));
    if (prior != null) check(Math.abs((f.index.mid[i] / prior - 1) * 100 - f.inflation.mid[i]) < 0.1, label(`derived inflation mismatch at ${f.months[i]}`));
  }
  const bt = c.model?.backtest;
  check(bt?.pooled?.rmse > 0 && bt?.h1?.rmse > 0 && bt?.h12?.rmse > 0, label('backtest metrics missing'));
  check(bt?.benchmarkSeasonalNaive?.rmse > 0, label('benchmark missing'));
  check(bt?.skillVsSeasonalNaive > -0.5, label('model drastically worse than seasonal naive'));
  check(bt?.h1.rmse <= bt?.h12.rmse * 1.2, label('h1 error implausibly above h12'));
}
check(forecasts >= 5, `expected forecasts for at least 5 countries, found ${forecasts}`);
check(data.countries.Yemen?.status === 'insufficient_data', 'Yemen must not carry a model forecast (series ends 2017)');

if (failures.length) {
  console.error(`Forecast validation FAILED:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Forecast validation passed: ${forecasts} forecasts, horizon ${data.horizonMonths} months, bands ordered, inflation consistent with the index, Yemen correctly excluded.`);
