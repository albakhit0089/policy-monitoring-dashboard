#!/usr/bin/env node
'use strict';

// Validates data/forecasts/context.json. Fails the build on any breach, so a bad refresh cannot ship.

const path = require('node:path');
const data = require(path.resolve(__dirname, '../data/forecasts/context.json'));

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
const COUNTRIES = ['Bahrain', 'Kuwait', 'Oman', 'Qatar', 'Saudi Arabia', 'United Arab Emirates', 'Yemen'];
const monthsAgo = (ym, months) => {
  const d = new Date(`${data.generatedAt}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return ym >= `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

// IMF
check(/\d{4}-\d{2}-\d{2}/.test(data.generatedAt), 'generatedAt missing');
check(data.imf?.forecastFrom === data.imf?.maxYear - 5, 'IMF forecastFrom must be maxYear - 5 (WEO convention)');
check(data.imf?.note?.includes('not food inflation'), 'IMF note must say it is not food inflation');
for (const country of COUNTRIES) {
  const series = data.imf?.series?.[country] || {};
  check(Object.keys(series).length >= 10, `IMF: ${country} series too short`);
  check(series[data.imf.maxYear] !== undefined, `IMF: ${country} missing projection for ${data.imf.maxYear}`);
  for (const [year, value] of Object.entries(series)) check(Number.isFinite(value) && value > -30 && value < 500, `IMF: ${country} implausible value in ${year}`);
}

// Commodities
const items = Object.entries(data.commodities?.items || {});
check(items.length >= 6, `commodities: only ${items.length} benchmarks`);
for (const [name, item] of items) {
  const months = Object.keys(item.monthly).sort();
  check(months.length >= 120, `commodities: ${name} has under 10 years of data`);
  check(monthsAgo(item.latest, 6), `commodities: ${name} latest (${item.latest}) is stale`);
  check(/^\$\//.test(item.unit), `commodities: ${name} missing a USD unit`);
  for (const value of Object.values(item.monthly)) check(Number.isFinite(value) && value > 0, `commodities: ${name} has a non-positive value`);
}

// Yemen
const staples = Object.entries(data.yemen?.items || {});
check(staples.length >= 5, `yemen: only ${staples.length} staples`);
check(data.yemen?.note?.includes('not a consumer price index'), 'yemen note must separate market prices from a CPI');
for (const [name, item] of staples) {
  check(monthsAgo(item.latest, 4), `yemen: ${name} latest (${item.latest}) is stale`);
  for (const [ym, entry] of Object.entries(item.monthly)) {
    check(entry.markets >= data.yemen.minMarkets, `yemen: ${name} ${ym} published with under ${data.yemen.minMarkets} markets`);
    check(Number.isFinite(entry.usd) && entry.usd > 0 && entry.usd < 100, `yemen: ${name} ${ym} implausible USD price`);
  }
}

if (failures.length) {
  console.error(`Context validation FAILED:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Context validation passed: IMF ${COUNTRIES.length} countries to ${data.imf.maxYear}, ${items.length} commodity benchmarks, ${staples.length} Yemen staples, freshness and plausibility checks met.`);
