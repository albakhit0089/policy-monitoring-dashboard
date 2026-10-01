'use strict';

// Builds data/food-indicators.json from FAOSTAT exports:
//   --prices  Producer Prices (PP) workbook exported from FAOSTAT (.xlsx)
//   --diet    Cost and Affordability of a Healthy Diet (CAHD) records as JSON
//             (array of { country, year, item, unit, value, flag })
// Usage: npm run build-indicators -- --prices "<file.xlsx>" --diet "<healthy-diet.json>"

const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');

const COUNTRIES = ['Bahrain', 'Kuwait', 'Oman', 'Qatar', 'Saudi Arabia', 'United Arab Emirates', 'Yemen'];
const ALIASES = { UAE: 'United Arab Emirates' };
const NON_FOOD_CODES = new Set(['1970', '2941']); // Unmanufactured tobacco, shorn wool
const SWING_THRESHOLD = 0.6;
// Official USD pegs (local currency per USD) used to repair inconsistent USD conversions in the export.
const USD_PEGS = { Bahrain: 0.376, Oman: 0.3845, Qatar: 3.64, 'Saudi Arabia': 3.75 };

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : null;
}

// Food group from the CPC item code prefix. FAOSTAT drops CPC's leading zero, so crops (CPC 01xxx) start with "1".
function foodGroup(code) {
  const crops = { 1: 'Cereals', 2: 'Vegetables', 3: 'Fruits', 4: 'Oilseeds and olives', 5: 'Roots and tubers', 7: 'Pulses', 8: 'Sugar crops' };
  if (code.startsWith('1')) return crops[code[1]] || 'Other';
  if (code.startsWith('211')) return 'Meat';
  if (code.startsWith('22')) return 'Milk';
  if (code.startsWith('231')) return 'Eggs';
  if (code.startsWith('291')) return 'Honey';
  return 'Other';
}

async function readPrices(file) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const sheet = workbook.worksheets[0];
  const header = sheet.getRow(1).values.slice(1);
  const rows = [];
  sheet.eachRow((row, index) => { if (index > 1) rows.push(Object.fromEntries(header.map((key, i) => [key, row.values[i + 1]]))); });

  const items = new Map();
  const series = new Map();
  let excludedBiological = 0;
  let excludedNonFood = 0;
  for (const row of rows) {
    const country = ALIASES[row.Area] || row.Area;
    if (!COUNTRIES.includes(country) || row.Value === null || row.Value === undefined || row.Value === '') continue;
    const code = String(row['Item Code (CPC)']).replace(/^'/, '');
    // "(biological)" items are FAOSTAT's live-weight variants of carcass meat; keeping both double-counts meat.
    if (code.endsWith('b')) { excludedBiological += 1; continue; }
    if (NON_FOOD_CODES.has(code)) { excludedNonFood += 1; continue; }
    const currency = /USD/.test(row.Element) ? 'usd' : /LCU/.test(row.Element) ? 'lcu' : null;
    if (!currency) continue; // SLC duplicates LCU for these countries
    items.set(code, { code, name: String(row.Item).trim(), group: foodGroup(code) });
    const key = `${country}|${code}`;
    if (!series.has(key)) series.set(key, { country, code, usd: {}, lcu: {}, imputed: [] });
    const entry = series.get(key);
    entry[currency][row.Year] = Number(row.Value);
    if (row.Flag !== 'A' && currency === 'usd') entry.imputed.push(Number(row.Year));
  }

  let usdCorrections = 0;
  const correctedPeriods = new Set();
  for (const entry of series.values()) {
    const peg = USD_PEGS[entry.country];
    if (!peg) continue;
    for (const year of Object.keys(entry.lcu)) {
      if (entry.usd[year] && Math.abs(entry.lcu[year] / entry.usd[year] / peg - 1) > 0.01) {
        entry.usd[year] = Math.round(entry.lcu[year] / peg * 10) / 10;
        usdCorrections += 1;
        correctedPeriods.add(`${entry.country} ${year}`);
      }
    }
  }

  const swings = [];
  for (const entry of series.values()) {
    const years = Object.keys(entry.lcu).map(Number).sort();
    for (let i = 1; i < years.length; i += 1) {
      const change = entry.lcu[years[i]] / entry.lcu[years[i - 1]] - 1;
      if (Math.abs(change) > SWING_THRESHOLD) swings.push({ country: entry.country, code: entry.code, from: years[i - 1], to: years[i], change: Math.round(change * 1000) / 10 });
    }
  }
  const years = [...new Set(rows.map((row) => Number(row.Year)))].sort();
  return {
    years,
    items: [...items.values()].sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name)),
    series: [...series.values()].sort((a, b) => a.country.localeCompare(b.country) || a.code.localeCompare(b.code)),
    swings,
    excluded: { biological: excludedBiological, nonFood: excludedNonFood },
    usdCorrections,
    correctedPeriods: [...correctedPeriods].sort(),
  };
}

function readDiet(file) {
  const records = JSON.parse(fs.readFileSync(file, 'utf8'));
  const diet = { cohd: {}, pua: {}, nua: {}, components: { year: null, ppp: {} } };
  const componentName = (item) => item.replace(/^Cost of /, '').replace(/^./, (c) => c.toUpperCase());
  for (const record of records) {
    const country = ALIASES[record.country] || record.country;
    if (!COUNTRIES.includes(country) || record.value === null || record.value === undefined) continue;
    const ppp = /PPP/.test(record.unit);
    if (record.item.startsWith('Cost of a healthy diet')) {
      ((diet.cohd[country] ??= {})[record.year] ??= {})[ppp ? 'ppp' : 'lcu'] = record.value;
    } else if (record.item.startsWith('Prevalence of unaffordability')) {
      (diet.pua[country] ??= {})[record.year] = record.value;
    } else if (record.item.startsWith('Number of people unable')) {
      (diet.nua[country] ??= {})[record.year] = record.value;
    } else if (record.item.startsWith('Cost of') && ppp) {
      diet.components.year = record.year;
      (diet.components.ppp[country] ??= {})[componentName(record.item)] = record.value;
    }
  }
  diet.countries = COUNTRIES.filter((country) => diet.cohd[country]);
  return diet;
}

async function main() {
  const pricesFile = arg('prices');
  const dietFile = arg('diet');
  if (!pricesFile || !dietFile) throw new Error('Usage: npm run build-indicators -- --prices <PP.xlsx> --diet <healthy-diet.json>');
  const prices = await readPrices(pricesFile);
  const diet = readDiet(dietFile);
  const notes = [
    `Producer prices cover ${[...new Set(prices.series.map((s) => s.country))].join(', ')}; ${COUNTRIES.filter((c) => !prices.series.some((s) => s.country === c)).join(', ') || 'no country'} has no FAOSTAT producer price data in this export.`,
    `Healthy diet indicators cover ${diet.countries.join(', ')}; ${COUNTRIES.filter((c) => !diet.countries.includes(c)).join(', ') || 'no country'} is not covered.`,
    `Prevalence of unaffordability is reported for ${Object.keys(diet.pua).join(', ') || 'no country'} only.`,
    `${prices.excluded.biological} live-weight ("biological") meat values and ${prices.excluded.nonFood} non-food values were excluded.`,
    `Series that repeat one value in every year (likely carried-forward estimates): ${[...new Set(prices.series.map((s) => s.country))].map((country) => { const rows = prices.series.filter((s) => s.country === country && Object.keys(s.lcu).length > 1); const flat = rows.filter((s) => new Set(Object.values(s.lcu)).size === 1).length; return `${country} ${flat}/${rows.length}`; }).join(', ')}. These are excluded from price-change statistics.`,
    `${prices.usdCorrections} USD values that did not match the official currency peg (${prices.correctedPeriods.join(', ')}) were recomputed from local-currency prices.`,
    `Yemen local-currency prices are strongly affected by exchange-rate depreciation; compare Yemen in USD for levels and treat changes with caution.`,
    `${prices.swings.length} year-on-year local-currency price changes exceed ±${SWING_THRESHOLD * 100}% and are flagged for verification.`,
  ];
  const output = {
    generatedAt: new Date().toISOString().slice(0, 10),
    sources: {
      prices: { name: 'FAOSTAT Producer Prices (PP)', file: path.basename(pricesFile), unit: 'USD/tonne and local currency/tonne, annual' },
      diet: { name: 'FAOSTAT Cost and Affordability of a Healthy Diet (CAHD)', file: path.basename(dietFile), unit: 'Int$ PPP per person per day' },
    },
    prices: { years: prices.years, items: prices.items, series: prices.series, swings: prices.swings },
    diet,
    notes,
  };
  const target = path.resolve(__dirname, '..', 'data', 'food-indicators.json');
  fs.writeFileSync(target, `${JSON.stringify(output)}\n`);
  console.log(`Wrote ${path.relative(process.cwd(), target)}: ${prices.series.length} price series, ${prices.items.length} items, ${diet.countries.length} diet countries.`);
  notes.forEach((note) => console.log(`- ${note}`));
}

main().catch((error) => { console.error(error); process.exit(1); });
