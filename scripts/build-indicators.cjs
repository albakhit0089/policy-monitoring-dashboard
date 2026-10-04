'use strict';

// Builds data/food-indicators.json from FAOSTAT bulk downloads (normalized CSV):
//   --prices  Prices_E_All_Data_(Normalized).csv  (domain PP, annual and monthly producer prices)
//   --diet    Cost_Affordability_Healthy_Diet_(CoAHD)_E_All_Data_(Normalized).csv
// Bulk files: https://bulks-faostat.fao.org/production/
// Usage: npm run build-indicators -- --prices "<Prices csv>" --diet "<CoAHD csv>"

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const COUNTRIES = ['Bahrain', 'Kuwait', 'Oman', 'Qatar', 'Saudi Arabia', 'United Arab Emirates', 'Yemen'];
const FIRST_PRICE_YEAR = 2018;
const MIN_MONTHS = 6; // monthly observations needed before a monthly average stands in for an annual value
const NON_FOOD_CODES = new Set(['1970', '2941']); // Unmanufactured tobacco, shorn wool
const SWING_THRESHOLD = 0.6;
// Official USD pegs (local currency per USD) used to repair inconsistent USD conversions.
const USD_PEGS = { Bahrain: 0.376, Oman: 0.3845, Qatar: 3.64, 'Saudi Arabia': 3.75, 'United Arab Emirates': 3.6725 };

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : null;
}
// FAOSTAT normalized CSVs quote every field; values never contain embedded quotes.
const parseLine = (line) => line.replace(/^"|"$/g, '').split('","');

async function readRows(file, keep) {
  const header = [];
  const rows = [];
  const input = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const line of input) {
    if (!header.length) { header.push(...line.replace(/^﻿/, '').split(',').map((h) => h.replace(/"/g, ''))); continue; }
    if (!keep(line)) continue;
    const fields = parseLine(line);
    rows.push(Object.fromEntries(header.map((key, i) => [key, fields[i]])));
  }
  return rows;
}
const regionLine = (line) => COUNTRIES.some((country) => line.includes(`"${country}"`));

// Food group from the CPC item code (leading zero removed, so crops start with "1").
function foodGroup(code) {
  const crops = { 1: 'Cereals', 2: 'Vegetables', 3: 'Fruits', 4: 'Oilseeds and olives', 5: 'Roots and tubers', 7: 'Pulses', 8: 'Sugar crops' };
  if (code.startsWith('1')) return crops[code[1]] || 'Other';
  if (code.startsWith('211')) return 'Meat';
  if (code.startsWith('22')) return 'Milk';
  if (code.startsWith('231')) return 'Eggs';
  if (code.startsWith('291')) return 'Honey';
  return 'Other';
}
const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const round = (value, places = 2) => Math.round(value * 10 ** places) / 10 ** places;

async function readPrices(file) {
  const rows = await readRows(file, regionLine);
  const items = new Map();
  const raw = new Map();
  let excludedBiological = 0, excludedNonFood = 0;
  for (const row of rows) {
    if (!COUNTRIES.includes(row.Area) || row.Value === '' || row.Value === undefined) continue;
    const year = Number(row.Year);
    if (year < FIRST_PRICE_YEAR) continue;
    const code = String(row['Item Code (CPC)']).replace(/^'/, '').replace(/^0/, '');
    if (code.endsWith('b') || /biological/i.test(row.Item)) { excludedBiological += 1; continue; }
    if (NON_FOOD_CODES.has(code)) { excludedNonFood += 1; continue; }
    const currency = /USD/.test(row.Element) ? 'usd' : /LCU/.test(row.Element) ? 'lcu' : null;
    if (!currency) continue; // SLC duplicates LCU; the price index is not used
    items.set(code, { code, name: String(row.Item).trim(), group: foodGroup(code) });
    const key = `${row.Area}|${code}`;
    if (!raw.has(key)) raw.set(key, { country: row.Area, code, annual: { usd: {}, lcu: {} }, monthly: { usd: {}, lcu: {} }, flags: {} });
    const entry = raw.get(key);
    if (row.Months === 'Annual value') { entry.annual[currency][year] = Number(row.Value); if (currency === 'lcu') entry.flags[year] = row.Flag; }
    else (entry.monthly[currency][year] ??= []).push(Number(row.Value));
  }

  const counts = { annual: 0, monthlyFilled: 0, carriedReplaced: 0, carriedKept: 0, usdCorrections: 0 };
  const correctedPeriods = new Set();
  const series = [];
  for (const entry of raw.values()) {
    const years = [...new Set([...Object.keys(entry.annual.lcu), ...Object.keys(entry.monthly.lcu)].map(Number))].sort((a, b) => a - b);
    const out = { country: entry.country, code: entry.code, usd: {}, lcu: {}, imputed: [], monthly: [], carried: [] };
    for (const year of years) {
      const annual = entry.annual.lcu[year];
      const months = entry.monthly.lcu[year] || [];
      // An annual value identical to the previous year's signals a carried-forward figure.
      const carried = annual !== undefined && entry.annual.lcu[year - 1] === annual;
      if (annual !== undefined && !(carried && months.length >= MIN_MONTHS)) {
        out.lcu[year] = annual;
        out.usd[year] = entry.annual.usd[year];
        counts.annual += 1;
        if (carried) { out.carried.push(year); counts.carriedKept += 1; }
        if (entry.flags[year] && entry.flags[year] !== 'A') out.imputed.push(year);
      } else if (months.length >= MIN_MONTHS) {
        out.lcu[year] = round(average(months));
        const usdMonths = entry.monthly.usd[year] || [];
        out.usd[year] = usdMonths.length >= MIN_MONTHS ? round(average(usdMonths)) : undefined;
        out.monthly.push(year);
        if (carried) counts.carriedReplaced += 1; else counts.monthlyFilled += 1;
      }
      if (out.lcu[year] === undefined) continue;
      // Fill or repair USD using the official peg where the currency is pegged.
      const peg = USD_PEGS[entry.country];
      if (peg && (out.usd[year] === undefined || Math.abs(out.lcu[year] / out.usd[year] / peg - 1) > 0.01)) {
        if (out.usd[year] !== undefined) { counts.usdCorrections += 1; correctedPeriods.add(`${entry.country} ${year}`); }
        out.usd[year] = round(out.lcu[year] / peg, 1);
      }
      if (out.usd[year] === undefined) delete out.usd[year];
    }
    if (Object.keys(out.lcu).length) series.push(out);
  }

  const swings = [];
  for (const entry of series) {
    const years = Object.keys(entry.lcu).map(Number).sort((a, b) => a - b);
    for (let i = 1; i < years.length; i += 1) {
      const change = entry.lcu[years[i]] / entry.lcu[years[i - 1]] - 1;
      if (Math.abs(change) > SWING_THRESHOLD) swings.push({ country: entry.country, code: entry.code, from: years[i - 1], to: years[i], change: Math.round(change * 1000) / 10 });
    }
  }
  const years = [...new Set(series.flatMap((entry) => Object.keys(entry.lcu).map(Number)))].sort((a, b) => a - b);
  return {
    years,
    items: [...items.values()].filter((item) => series.some((entry) => entry.code === item.code)).sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name)),
    series: series.sort((a, b) => a.country.localeCompare(b.country) || a.code.localeCompare(b.code)),
    swings, counts, correctedPeriods: [...correctedPeriods].sort(),
    excluded: { biological: excludedBiological, nonFood: excludedNonFood },
  };
}

async function readDiet(file) {
  const rows = await readRows(file, regionLine);
  const diet = { cohd: {}, pua: {}, nua: {}, components: { year: null, ppp: {} } };
  const componentName = (item) => item.replace(/^Cost of /, '').replace(/^./, (c) => c.toUpperCase());
  for (const row of rows) {
    const country = row.Area;
    if (!COUNTRIES.includes(country) || row.Value === '' || row.Value === undefined) continue;
    const value = Number(row.Value), year = Number(row.Year);
    const ppp = /PPP/.test(row.Unit);
    if (row.Item.startsWith('Cost of a healthy diet')) ((diet.cohd[country] ??= {})[year] ??= {})[ppp ? 'ppp' : 'lcu'] = value;
    else if (row.Item.startsWith('Prevalence of unaffordability')) (diet.pua[country] ??= {})[year] = value;
    else if (row.Item.startsWith('Number of people unable')) (diet.nua[country] ??= {})[year] = value;
    else if (row.Item.startsWith('Cost of') && ppp) { diet.components.year = year; (diet.components.ppp[country] ??= {})[componentName(row.Item)] = value; }
  }
  diet.countries = COUNTRIES.filter((country) => diet.cohd[country]);
  diet.release = rows.find((row) => row.Release)?.Release || '';
  return diet;
}

async function main() {
  const pricesFile = arg('prices');
  const dietFile = arg('diet');
  if (!pricesFile || !dietFile) throw new Error('Usage: npm run build-indicators -- --prices <Prices_E_All_Data_(Normalized).csv> --diet <Cost_Affordability_Healthy_Diet_(CoAHD)_E_All_Data_(Normalized).csv>');
  const prices = await readPrices(pricesFile);
  const diet = await readDiet(dietFile);
  const priceCountries = [...new Set(prices.series.map((s) => s.country))];
  const carriedByCountry = priceCountries.map((country) => [country, prices.series.filter((s) => s.country === country && s.carried.length).length, prices.series.filter((s) => s.country === country).length]).filter(([, carried]) => carried);
  const notes = [
    `Producer prices cover ${priceCountries.join(', ')}. ${COUNTRIES.filter((c) => !priceCountries.includes(c)).join(', ') || 'No country'} does not report producer prices to FAOSTAT.`,
    `Healthy diet indicators (${diet.release || 'FAOSTAT'}) cover ${diet.countries.join(', ')}. ${COUNTRIES.filter((c) => !diet.countries.includes(c)).join(', ')} is not estimated by FAO or the World Bank (no recent price-comparison data).`,
    `Prevalence of unaffordability is reported for ${Object.keys(diet.pua).join(', ') || 'no country'} only.`,
    `${prices.counts.monthlyFilled} annual values missing from FAOSTAT were filled with the average of at least ${MIN_MONTHS} monthly FAOSTAT prices, and ${prices.counts.carriedReplaced} annual values identical to the previous year's figure were replaced the same way.`,
    carriedByCountry.length ? `Some annual prices still repeat the previous year's value where no monthly data exist (${carriedByCountry.map(([country, carried, total]) => `${country} ${carried} of ${total} series`).join(', ')}); these are shown as reported.` : '',
    `${prices.excluded.biological} live-weight ("biological") meat values and ${prices.excluded.nonFood} non-food values were excluded.`,
    prices.counts.usdCorrections ? `${prices.counts.usdCorrections} USD values that did not match the official currency peg (${prices.correctedPeriods.join(', ')}) were recomputed from local-currency prices.` : '',
    'Yemen local-currency prices are strongly affected by exchange-rate depreciation; compare Yemen in USD for levels and treat changes with caution.',
    `${prices.swings.length} year-on-year local-currency price changes exceed ±${SWING_THRESHOLD * 100}% and are flagged for verification.`,
  ].filter(Boolean);
  const output = {
    generatedAt: new Date().toISOString().slice(0, 10),
    sources: {
      prices: { name: 'FAOSTAT Producer Prices (PP), bulk download', file: path.basename(pricesFile), unit: 'USD/tonne and local currency/tonne; annual, or average of monthly values where annual is missing' },
      diet: { name: `FAOSTAT Cost and Affordability of a Healthy Diet (CoAHD)${diet.release ? `, ${diet.release}` : ''}`, file: path.basename(dietFile), unit: 'Int$ PPP and local currency per person per day' },
    },
    prices: { years: prices.years, items: prices.items, series: prices.series, swings: prices.swings },
    diet,
    notes,
  };
  const target = path.resolve(__dirname, '..', 'data', 'food-indicators.json');
  fs.writeFileSync(target, `${JSON.stringify(output)}\n`);
  console.log(`Wrote ${path.relative(process.cwd(), target)}: ${prices.series.length} price series, ${prices.items.length} items, years ${prices.years[0]}–${prices.years.at(-1)}, ${diet.countries.length} diet countries.`);
  notes.forEach((note) => console.log(`- ${note}`));
}

main().catch((error) => { console.error(error); process.exit(1); });
