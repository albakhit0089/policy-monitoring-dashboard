#!/usr/bin/env node
'use strict';

// Builds data/forecasts/context.json (phase 2 drivers): IMF WEO headline inflation per country,
// World Bank commodity benchmarks, and WFP retail staple prices for Yemen aggregated to a national
// monthly median in USD. Inputs are the extracts in data/sources/ written by scripts/fetch-context.cjs.
// Usage: node scripts/build-context.cjs

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SOURCES = path.join(ROOT, 'data/sources');
const OUT = path.join(ROOT, 'data/forecasts/context.json');
const NAMES = { BHR: 'Bahrain', KWT: 'Kuwait', OMN: 'Oman', QAT: 'Qatar', SAU: 'Saudi Arabia', ARE: 'United Arab Emirates', YEM: 'Yemen' };
const MIN_MARKETS = 5; // a Yemen month needs at least this many reporting markets to be published
const round = (value, places = 2) => Math.round(value * 10 ** places) / 10 ** places;
const median = (values) => { const s = [...values].sort((a, b) => a - b); const mid = Math.floor(s.length / 2); return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2; };
const splitCsv = (line) => {
  const fields = []; let cell = '', quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) { if (ch === '"' && line[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === ',') { fields.push(cell); cell = ''; }
    else cell += ch;
  }
  fields.push(cell);
  return fields;
};

// 1. IMF WEO headline inflation (already country-filtered JSON with vintage metadata).
const imfRaw = JSON.parse(fs.readFileSync(path.join(SOURCES, 'imf-weo-pcpipch.json'), 'utf8'));
const imf = {
  label: imfRaw.label,
  source: { name: 'IMF World Economic Outlook (datamapper API)', url: 'https://www.imf.org/en/Publications/WEO', api: imfRaw.url, retrievedAt: imfRaw.retrievedAt },
  forecastFrom: imfRaw.forecastFrom,
  maxYear: imfRaw.maxYear,
  note: imfRaw.note,
  series: Object.fromEntries(Object.entries(imfRaw.series).map(([code, years]) => [NAMES[code], Object.fromEntries(Object.entries(years).filter(([year]) => Number(year) >= 2015))])),
};

// 2. World Bank commodity benchmarks.
const cmoLines = fs.readFileSync(path.join(SOURCES, 'cmo-monthly.csv'), 'utf8').trim().split('\n');
const cmoMeta = cmoLines[0].replace(/^# /, '');
const cmoHeader = splitCsv(cmoLines[1]).slice(1);
const commodities = { source: { name: 'World Bank Commodity Markets "pink sheet", monthly, nominal USD', url: 'https://www.worldbank.org/en/research/commodity-markets', detail: cmoMeta }, items: {} };
for (const column of cmoHeader) {
  const match = column.match(/^(.*) (\$\/\w+)$/);
  commodities.items[match ? match[1] : column] = { unit: match ? match[2] : '', monthly: {} };
}
for (const line of cmoLines.slice(2)) {
  const [month, ...values] = splitCsv(line);
  values.forEach((value, i) => {
    if (value === '') return;
    const key = Object.keys(commodities.items)[i];
    commodities.items[key].monthly[month] = round(Number(value), 2);
  });
}
// Drop any benchmark with no observation in the last 12 months (discontinued series).
const cmoLatest = Object.values(commodities.items).flatMap((item) => Object.keys(item.monthly)).sort().at(-1);
for (const [name, item] of Object.entries(commodities.items)) {
  const last = Object.keys(item.monthly).sort().at(-1);
  if (!last || last < `${Number(cmoLatest.slice(0, 4)) - 1}${cmoLatest.slice(4)}`) delete commodities.items[name];
  else item.latest = last;
}

// 3. WFP Yemen staples: national monthly median of market retail prices, converted to USD with the
// dataset's own unofficial exchange rate for the same market and month. WFP's published usdprice
// column uses an outdated official rate (about 236 YER/USD in late 2026 against market rates near
// 1,550), so it is not used. A market-month without its own exchange rate is dropped.
const wfpLines = fs.readFileSync(path.join(SOURCES, 'wfp-yemen-prices.csv'), 'utf8').trim().split('\n');
const wfpMeta = splitCsv(wfpLines[1])[0].replace(/^# /, '');
const byItem = {};
const rates = {}; // `${ym}|${market}` -> YER per USD
for (const line of wfpLines.slice(2)) {
  const [date, market, commodity, unit, yer] = splitCsv(line);
  const ym = date.slice(0, 7);
  if (commodity === 'Exchange rate (unofficial)') { rates[`${ym}|${market}`] = Number(yer); continue; }
  byItem[commodity] ??= { unit, months: {} };
  (byItem[commodity].months[ym] ??= new Map()).set(market, Number(yer));
}
const yemen = { source: { name: 'WFP food prices for Yemen (via HDX, public dataset)', url: 'https://data.humdata.org/dataset/wfp-food-prices-for-yemen', detail: wfpMeta }, minMarkets: MIN_MARKETS, note: `National monthly median of market retail prices. Yemen has two currency zones, so rial prices are converted to USD per market with the unofficial exchange rate reported in the same dataset for that market and month (WFP's published USD column uses an outdated official rate and is not used). Months with fewer than ${MIN_MARKETS} convertible markets are suppressed. Market-level observations, not a consumer price index.`, items: {} };
for (const [commodity, { unit, months }] of Object.entries(byItem)) {
  const monthly = {};
  for (const [ym, markets] of Object.entries(months).sort(([a], [b]) => a.localeCompare(b))) {
    const usdValues = [];
    for (const [market, yer] of markets) {
      const rate = rates[`${ym}|${market}`];
      if (rate > 100) usdValues.push(yer / rate);
    }
    if (usdValues.length < MIN_MARKETS) continue;
    monthly[ym] = { usd: round(median(usdValues), 2), markets: usdValues.length };
  }
  if (Object.keys(monthly).length >= 24) yemen.items[commodity] = { unit, monthly, latest: Object.keys(monthly).sort().at(-1) };
}

const output = { generatedAt: new Date().toISOString().slice(0, 10), imf, commodities, yemen };
fs.writeFileSync(OUT, JSON.stringify(output));
console.log(`Context written: IMF ${Object.keys(imf.series).length} countries (projections ${imf.forecastFrom}-${imf.maxYear}), ${Object.keys(commodities.items).length} commodity benchmarks to ${cmoLatest}, ${Object.keys(yemen.items).length} Yemen staples to ${Object.values(yemen.items).map((i) => i.latest).sort().at(-1)}.`);
