#!/usr/bin/env node
'use strict';

// Adds FAOSTAT Consumer Price Indices (domain CP) to data/food-indicators.json.
// Input: a FAOSTAT CSV export with Food Indices, General Indices and Food price inflation by month.
// Usage: node scripts/build-cpi.cjs <FAOSTAT_CP_export.csv>
const fs = require('node:fs');
const path = require('node:path');

const COUNTRIES = new Set(['Bahrain', 'Kuwait', 'Oman', 'Qatar', 'Saudi Arabia', 'United Arab Emirates', 'Yemen']);
const ITEMS = { 23013: 'food', 23012: 'general', 23014: 'inflation' };

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

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/build-cpi.cjs <FAOSTAT_CP_export.csv>');
  process.exit(1);
}
const [header, ...lines] = parseCsv(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
const col = (name) => header.indexOf(name);
for (const name of ['Domain Code', 'Area', 'Year', 'Item Code', 'Months Code', 'Value', 'Flag']) {
  if (col(name) < 0) throw new Error(`Column "${name}" not found; expected a FAOSTAT CSV export.`);
}

const countries = {};
const months = new Set();
let used = 0;
for (const line of lines) {
  const key = ITEMS[line[col('Item Code')]];
  const area = line[col('Area')];
  const monthCode = Number(line[col('Months Code')]);
  const value = Number(line[col('Value')]);
  if (line[col('Domain Code')] !== 'CP' || !key || !COUNTRIES.has(area) || !(monthCode >= 7001 && monthCode <= 7012) || !Number.isFinite(value) || line[col('Value')] === '') continue;
  const month = `${line[col('Year')]}-${String(monthCode - 7000).padStart(2, '0')}`;
  months.add(month);
  const entry = countries[area] ||= { food: {}, general: {}, inflation: {}, estimated: [] };
  entry[key][month] = value;
  if (line[col('Flag')] === 'E' && key !== 'inflation') entry.estimated.push(`${key}:${month}`);
  used += 1;
}
if (!used) throw new Error('No consumer price index rows for the GCC States or Yemen were found.');

// FAOSTAT sometimes fills the newest months by copying the same month of the previous year (food price
// inflation then shows 0%). Drop that trailing run so the latest month is a real observation.
const yearEarlier = (month) => `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`;
const dropped = [];
for (const [country, entry] of Object.entries(countries)) {
  const copied = [];
  for (const month of Object.keys(entry.food).sort().reverse()) {
    if (entry.food[yearEarlier(month)] === undefined || entry.food[month] !== entry.food[yearEarlier(month)]) break;
    copied.push(month);
  }
  copied.forEach((month) => { delete entry.food[month]; delete entry.general[month]; delete entry.inflation[month]; });
  if (copied.length) dropped.push(`${country} ${copied.length === 1 ? copied[0] : `${copied.at(-1)} to ${copied[0]}`}`);
}

const output = path.resolve(__dirname, '..', 'data', 'food-indicators.json');
const food = JSON.parse(fs.readFileSync(output, 'utf8'));
const sorted = [...months].sort();
food.cpi = { months: sorted, base: 2015, countries };
food.sources.cpi = {
  name: 'FAOSTAT Consumer Price Indices (CP)',
  file: path.basename(file),
  unit: 'Food and general consumer price indices (2015 = 100) and food price inflation (% change on the same month a year earlier), monthly',
};
const missing = [...COUNTRIES].filter((country) => !countries[country]);
food.notes = food.notes.filter((note) => !note.startsWith('Consumer price indices'));
food.notes.push(`Consumer price indices cover ${Object.keys(countries).join(', ')}, ${sorted[0]} to ${sorted.at(-1)}.${missing.length ? ` ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} not covered in this FAOSTAT release.` : ''} Food price inflation is FAOSTAT's estimate of the change on the same month a year earlier.${dropped.length ? ` Months that only repeat the previous year's index are excluded (${dropped.join('; ')}).` : ''}`);
food.generatedAt = new Date().toISOString().slice(0, 10);
fs.writeFileSync(output, `${JSON.stringify(food)}\n`, 'utf8');
console.log(`Added ${used} consumer price values for ${Object.keys(countries).length} countries, ${sorted[0]} to ${sorted.at(-1)}.`);
if (dropped.length) console.log(`Excluded months that repeat the previous year: ${dropped.join('; ')}.`);
