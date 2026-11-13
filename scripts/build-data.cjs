#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const ExcelJS = require('exceljs');
const { normalizeInstitutions, shortTitle, dedupeNear } = require('./lib/normalize.cjs');

const REGIONAL_COUNTRIES = new Set([
  'Bahrain',
  'Kuwait',
  'Oman',
  'Qatar',
  'Saudi Arabia',
  'United Arab Emirates',
  'Yemen',
]);

const DECISION_GROUPS = {
  '11': 'Tax',
  '12': 'Social protection',
  '13': 'Market',
  '14': 'Disposable income',
  '15': 'Nutrition & health assistance',
  '21': 'Production support',
  '22': 'Market management',
  '23': 'Natural resources management',
  '24': 'Institutional & organisational',
  '31': 'Imports',
  '32': 'Exports',
  '33': 'Other trade-related',
  '34': 'Macroeconomic decisions',
};
const FRAMEWORK_GROUPS = {
  '1': 'Development planning',
  '2': 'Food security & nutrition',
  '3': 'Agriculture & rural development',
  '4': 'Social protection & employment',
  '5': 'Natural resources & climate',
  '6': 'Trade & value chains',
  '7': 'Disaster risk management',
  '8': 'Gender',
};
const FAMILY = {
  '1': 'Consumer oriented',
  '2': 'Producer oriented',
  '3': 'Trade oriented',
  '4': 'Other decision family',
};
const COUNTRY_FIXES = new Map([
  ['iraq', 'Iraq'],
  ['tunisa', 'Tunisia'],
  ['saudi arabi', 'Saudi Arabia'],
  ['syria', 'Syrian Arab Republic'],
  ['syria arab republic', 'Syrian Arab Republic'],
]);

function normalize(value) {
  return String(value ?? '').toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function findHeader(headers, candidates) {
  const normalizedHeaders = Array.from(headers, normalize);
  for (const candidate of candidates) {
    const index = normalizedHeaders.findIndex((header) => header === candidate || header.includes(candidate));
    if (index >= 0) return index;
  }
  return -1;
}

function readCell(row, index) {
  return index < 0 ? '' : row[index];
}

function cleanText(value) {
  if (value && typeof value === 'object') {
    if (value.error) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('').replace(/\s+/g, ' ').trim();
    if (typeof value.text === 'string') return value.text.trim();
    if (value.result !== undefined) return cleanText(value.result);
  }
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function toIsoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  const text = cleanText(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function canonicalCountry(value) {
  const country = cleanText(value);
  return COUNTRY_FIXES.get(country.toLocaleLowerCase()) || country;
}


function classify(type, rawDomain) {
  const value = cleanText(rawDomain);
  if (type === 'decision') {
    const match = value.match(/^\s*(\d{2,})\s*--\s*(.*)$/);
    const code = match?.[1] || '';
    const domain = cleanText(match?.[2] || value);
    const family = FAMILY[code[0]] || 'Other decision family';
    const group = DECISION_GROUPS[code.slice(0, 2)] || (domain || 'Other policy decisions');
    return { family, group, domain, domainCode: code };
  }
  const match = value.match(/^\s*(\d+)(?:\.\d+)*\.?\s*(.*)$/);
  const code = match?.[1] || '';
  const domain = cleanText(match?.[2] || value);
  return {
    family: 'Long-term frameworks',
    group: FRAMEWORK_GROUPS[code] || (domain || 'Other frameworks'),
    domain,
    domainCode: code,
  };
}

function sheetType(name) {
  const key = normalize(name);
  if (key.startsWith('policydecisions')) return 'decision';
  if (key.startsWith('policyframeworks')) return 'framework';
  return null;
}

function parseSheet(sheet, sheetName) {
  const type = sheetType(sheetName);
  if (!type) return [];
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    rows.push(Array.from({ length: row.cellCount }, (_, index) => row.getCell(index + 1).value ?? ''));
  });
  const headerRow = rows.findIndex((row) => findHeader(row, ['countryname', 'country']) >= 0 && findHeader(row, ['description']) >= 0);
  if (headerRow < 0) return [];
  const headers = rows[headerRow];
  const columns = {
    country: findHeader(headers, ['countryname', 'country']),
    date: findHeader(headers, ['entryintoforce', 'entrydate']),
    source: findHeader(headers, ['hyperlinktodocument', 'source', 'hyperlink']),
    policyDomain: findHeader(headers, ['mainpolicydomain', 'policydomain']),
    description: findHeader(headers, ['description']),
    institution: findHeader(headers, ['decisionmakinginstitution', 'institution']),
    title: type === 'framework' ? findHeader(headers, ['title']) : -1,
    // Event flags added to the workbooks in 2026 (Yes/No columns).
    conflict: findHeader(headers, ['middleeastconflict']),
    elnino: findHeader(headers, ['elnino']),
  };
  if (columns.country < 0 || columns.description < 0) return [];
  return rows.slice(headerRow + 1).flatMap((row) => {
    const country = canonicalCountry(readCell(row, columns.country));
    const description = cleanText(readCell(row, columns.description));
    if (!country || !description) return [];
    const date = toIsoDate(readCell(row, columns.date));
    const classification = classify(type, readCell(row, columns.policyDomain));
    const rawTitle = type === 'framework' ? cleanText(readCell(row, columns.title)) : '';
    const title = rawTitle && rawTitle.split(' ').length <= 14 ? rawTitle : shortTitle(rawTitle || description);
    const yes = (index) => /^y(es)?$/i.test(cleanText(readCell(row, index)));
    const tags = [yes(columns.conflict) && 'middle-east-conflict-2026', yes(columns.elnino) && 'el-nino'].filter(Boolean);
    const typeLabel = type === 'decision' ? 'Short-term policy decision' : 'Long-term policy framework';
    return [{
      type,
      typeLabel,
      family: classification.family,
      group: classification.group,
      domain: classification.domain || 'Unspecified',
      domainCode: classification.domainCode,
      country,
      date,
      year: date ? Number(date.slice(0, 4)) : null,
      title,
      description,
      institution: cleanText(readCell(row, columns.institution)),
      source: cleanText(readCell(row, columns.source)),
      ...(tags.length ? { tags } : {}),
    }];
  });
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    if (entry.name.startsWith('~$') || entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return /\.xlsx?$/i.test(entry.name) ? [fullPath] : [];
  });
}

function dedupeKey(record) {
  const prefix = record.description.slice(0, 160).toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  return [record.type, record.country.toLocaleLowerCase(), record.date || '', prefix].join('|');
}

async function main() {
  const rootsIndex = process.argv.indexOf('--roots');
  const roots = rootsIndex >= 0 ? process.argv.slice(rootsIndex + 1) : [];
  if (!roots.length && !process.argv.includes('--merge')) {
    console.error('Usage: node scripts/build-data.cjs [--merge] --roots <workbook-folder> [<workbook-folder> ...]');
    process.exitCode = 1;
    return;
  }
  const files = [...new Set(roots.flatMap(walk))].sort((a, b) => a.localeCompare(b));
  const unique = new Map();
  let parsedRows = 0;
  // --merge keeps every record already in data/measures.json and adds only new ones,
  // so a new month's workbooks can be added without the earlier workbook folders.
  const merge = process.argv.includes('--merge');
  const existingPath = path.resolve(__dirname, '..', 'data', 'measures.json');
  if (merge) {
    if (!fs.existsSync(existingPath)) throw new Error('--merge needs an existing data/measures.json');
    JSON.parse(fs.readFileSync(existingPath, 'utf8')).records.forEach((record) => unique.set(dedupeKey(record), record));
    console.log(`Merging into ${unique.size.toLocaleString()} existing records.`);
  }
  const before = unique.size;
  const failures = [];
  for (const file of files) {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(file);
      for (const worksheet of workbook.worksheets) {
        const parsed = parseSheet(worksheet, worksheet.name);
        parsedRows += parsed.length;
        parsed.forEach((record) => {
          const key = dedupeKey(record);
          const existing = unique.get(key);
          if (!existing) unique.set(key, record);
          // A record already present (for example from --merge) still picks up event flags from the workbook.
          else if (record.tags) existing.tags = [...new Set([...(existing.tags || []), ...record.tags])];
        });
      }
    } catch (error) {
      failures.push(`${file}: ${error.message}`);
    }
  }
  // Titles: short framework titles from the workbook are kept; everything else gets a deterministic short title.
  const derived = (record) => record.title.endsWith('...') || record.description.startsWith(record.title.replace(/[.]{3}$/, ''));
  unique.forEach((record) => { record.title = record.type === 'framework' && !derived(record) && record.title.split(' ').length <= 14 ? record.title : shortTitle(record.description); });
  const institutions = normalizeInstitutions([...unique.values()]);
  unique.forEach((record, key) => { record.id ||= createHash('sha256').update(key).digest('hex').slice(0, 16); });
  const near = dedupeNear([...unique.values()]);
  const keptSet = new Set(near.records);
  [...unique].forEach(([key, record]) => { if (!keptSet.has(record)) unique.delete(key); });
  const records = [...unique.values()].sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.country.localeCompare(b.country) || a.title.localeCompare(b.title));
  records.forEach((record) => {
    record.id = createHash('sha256').update(dedupeKey(record)).digest('hex').slice(0, 16);
  });
  const output = path.resolve(__dirname, '..', 'data', 'measures.json');
  const regionalOutput = path.resolve(__dirname, '..', 'data', 'gcc-yemen-measures.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify({ recordCount: records.length, records })}\n`, 'utf8');
  const regionalRecords = records.filter((record) => REGIONAL_COUNTRIES.has(record.country));
  // Published full records (lazy-loaded); the raw institution spelling stays only in the local source file.
  const published = regionalRecords.map(({ institutionSource, ...record }) => record);
  const dataThrough = published.map((record) => record.date).filter(Boolean).sort().at(-1);
  fs.writeFileSync(regionalOutput, `${JSON.stringify({ recordCount: published.length, dataThrough, records: published })}\n`, 'utf8');
  writeSummary(published, dataThrough);
  console.log(`Institutions (distinct per country): ${institutions.before.toLocaleString()} before normalisation, ${institutions.after.toLocaleString()} after.`);
  console.log(`Near-duplicates removed (same country and date, near-identical description): ${near.removed.length}.`);
  const countries = new Set(records.map((record) => record.country));
  console.log(`Read ${files.length} workbooks; parsed ${parsedRows.toLocaleString()} rows; wrote ${records.length.toLocaleString()} unique records across ${countries.size} countries${merge ? ` (${(records.length - before).toLocaleString()} new)` : ''}.`);
  console.log(`Wrote ${regionalRecords.length.toLocaleString()} GCC and Yemen records to ${regionalOutput}.`);
  console.log(`Output: ${output}`);
  // Refresh the plain-HTML summary in index.html from the new data.
  require('./build-static.cjs');
  if (failures.length) {
    console.warn(`${failures.length} workbook(s) could not be read:`);
    failures.forEach((failure) => console.warn(`  ${failure}`));
  }
}

// Compact, dictionary-encoded records for charts and filters: everything except description and source.
// Pages that need the full text (records, search, reports) load gcc-yemen-measures.json on demand.
function writeSummary(records, dataThrough) {
  const fields = ['type', 'family', 'group', 'domain', 'country', 'institution'];
  const dict = Object.fromEntries(fields.map((field) => [field, [...new Set(records.map((record) => record[field] || ''))].sort()]));
  const index = Object.fromEntries(fields.map((field) => [field, new Map(dict[field].map((value, i) => [value, i]))]));
  // Titles only for the latest measures (shown on the overview); the rest arrive with the full records.
  const titled = new Set([...records].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 60).map((record) => record.id));
  const rows = records.map((record) => [record.id, record.date || '', ...fields.map((field) => index[field].get(record[field] || '')), record.domainCode || '', titled.has(record.id) ? record.title : '', record.institutionBranch || '', (record.tags || []).join(' ')]);
  const columns = ['id', 'date', ...fields, 'domainCode', 'title', 'institutionBranch', 'tags'];
  const output = path.resolve(__dirname, '..', 'data', 'gcc-yemen-summary.json');
  fs.writeFileSync(output, `${JSON.stringify({ recordCount: rows.length, dataThrough, columns, dict, rows })}\n`, 'utf8');
  console.log(`Wrote chart summary: ${rows.length.toLocaleString()} rows, ${Math.round(fs.statSync(output).size / 1024)} KB.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
