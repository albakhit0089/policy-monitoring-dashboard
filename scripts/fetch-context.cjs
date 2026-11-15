#!/usr/bin/env node
'use strict';

// Fetches the phase-2 context sources and writes filtered raw extracts into data/sources/:
//   imf-weo-pcpipch.json   IMF WEO headline inflation (datamapper API), the seven countries only
//   cmo-monthly.csv        World Bank Commodity Markets "pink sheet", selected benchmarks, monthly
//   wfp-yemen-prices.csv   WFP retail food prices for Yemen (public HDX dataset), selected staples
// Safeguards mirror fetch-faostat-cp.cjs: each extract is validated before it replaces the committed
// one, and a download that is truncated or loses months is refused.
// Requires: curl on PATH. Usage: node scripts/fetch-context.cjs

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const SOURCES = path.join(ROOT, 'data/sources');
const ISO3 = ['BHR', 'KWT', 'OMN', 'QAT', 'SAU', 'ARE', 'YEM'];
const IMF_URL = 'https://www.imf.org/external/datamapper/api/v1/PCPIPCH';
const CM_PAGE = 'https://www.worldbank.org/en/research/commodity-markets';
const HDX_API = 'https://data.humdata.org/api/3/action/package_show?id=wfp-food-prices-for-yemen';
// Pink sheet names exactly as published (trailing asterisks stripped when matching).
const COMMODITIES = ['Crude oil, Brent', 'Palm oil', 'Soybeans', 'Maize', 'Rice, Thai 5%', 'Wheat, US HRW', 'Sugar, world', 'DAP', 'Urea'];
// The unofficial exchange rate is kept as well: WFP's own usdprice column uses an outdated official
// rate (about 236 YER/USD in late 2026, against market rates near 1,550), so USD values must be
// derived from the dataset's market exchange rates instead (done in build-context.cjs).
const YEMEN_ITEMS = ['Wheat flour', 'Wheat', 'Rice (imported)', 'Sugar', 'Oil (vegetable)', 'Potatoes', 'Tomatoes', 'Lentils', 'Exchange rate (unofficial)'];

const curl = (url, out) => execFileSync('curl', ['-sSL', '-m', '600', '-o', out, url], { stdio: 'inherit' });
const latestYm = (text, re) => { let latest = ''; for (const m of text.matchAll(re)) if (m[1] > latest) latest = m[1]; return latest; };
function replaceIfNewer(target, next, re) {
  if (fs.existsSync(target)) {
    const current = fs.readFileSync(target, 'utf8');
    if (latestYm(next, re) < latestYm(current, re)) throw new Error(`Refusing to overwrite ${path.basename(target)}: the download ends earlier than the committed extract.`);
  }
  fs.writeFileSync(target, next);
  console.log(`${path.basename(target)}: latest month ${latestYm(next, re)}`);
}
// Minimal CSV field parser for quoted WFP rows.
function splitCsv(line) {
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
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'context-'));
try {
  // 1. IMF WEO: keep only the seven countries, record the vintage span.
  const imfFile = path.join(tmp, 'imf.json');
  curl(IMF_URL, imfFile);
  const imf = JSON.parse(fs.readFileSync(imfFile, 'utf8')).values.PCPIPCH;
  const series = Object.fromEntries(ISO3.map((code) => [code, imf[code]]));
  for (const code of ISO3) if (!series[code] || Object.keys(series[code]).length < 10) throw new Error(`IMF series missing for ${code}`);
  const maxYear = Math.max(...ISO3.flatMap((code) => Object.keys(series[code]).map(Number)));
  const out = { indicator: 'PCPIPCH', label: 'Inflation rate, average consumer prices (annual % change)', url: IMF_URL, retrievedAt: new Date().toISOString().slice(0, 10), maxYear, forecastFrom: maxYear - 5, note: 'IMF WEO projects about six years ahead; values from forecastFrom onward are IMF projections. Headline inflation covers all items - it is not food inflation.', series };
  const imfTarget = path.join(SOURCES, 'imf-weo-pcpipch.json');
  if (fs.existsSync(imfTarget) && JSON.parse(fs.readFileSync(imfTarget, 'utf8')).maxYear > maxYear) throw new Error('Refusing to overwrite IMF extract with an older vintage.');
  fs.writeFileSync(imfTarget, JSON.stringify(out, null, 1));
  console.log(`imf-weo-pcpipch.json: ${ISO3.length} countries, projections to ${maxYear}`);

  // 2. World Bank pink sheet: resolve the current workbook URL from the page, then extract columns.
  const pageFile = path.join(tmp, 'cm.html');
  curl(CM_PAGE, pageFile);
  const xlsxUrl = (fs.readFileSync(pageFile, 'utf8').match(/https:\/\/[^"']*CMO-Historical-Data-Monthly\.xlsx/) || [])[0];
  if (!xlsxUrl) throw new Error('Could not find the CMO monthly workbook link on the commodity markets page.');
  const xlsxFile = path.join(tmp, 'cmo.xlsx');
  curl(xlsxUrl, xlsxFile);
  const ctx = {}; ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/vendor/xlsx.full.min.js'), 'utf8'), ctx);
  const wb = ctx.XLSX.read(new Uint8Array(fs.readFileSync(xlsxFile)), { type: 'array' });
  const rows = ctx.XLSX.utils.sheet_to_json(wb.Sheets['Monthly Prices'], { header: 1 });
  const updated = (rows[3] || [])[0] || '';
  const names = rows[4], units = rows[5];
  const cols = COMMODITIES.map((want) => {
    const index = names.findIndex((n) => typeof n === 'string' && n.trim().replace(/\s*\*+$/, '') === want);
    if (index < 0) throw new Error(`Pink sheet column not found: ${want}`);
    return { want, index, unit: String(units[index] || '').replace(/[()]/g, '') };
  });
  const lines = [`# ${updated.trim()} | retrieved ${new Date().toISOString().slice(0, 10)} | ${xlsxUrl}`, ['month', ...cols.map((c) => `${c.want} ${c.unit}`)].map((v) => `"${v}"`).join(',')];
  for (const row of rows.slice(6)) {
    const m = String(row[0] || '').match(/^(\d{4})M(\d{2})$/);
    if (!m || `${m[1]}-${m[2]}` < '2010-01') continue;
    lines.push([`${m[1]}-${m[2]}`, ...cols.map((c) => (typeof row[c.index] === 'number' ? row[c.index] : ''))].map((v) => `"${v}"`).join(','));
  }
  replaceIfNewer(path.join(SOURCES, 'cmo-monthly.csv'), `${lines.join('\n')}\n`, /"(\d{4}-\d{2})"/g);

  // 3. WFP Yemen prices: resolve the CSV URL through the public HDX CKAN API, keep retail staples.
  const hdxFile = path.join(tmp, 'hdx.json');
  curl(HDX_API, hdxFile);
  const resource = JSON.parse(fs.readFileSync(hdxFile, 'utf8')).result.resources.find((r) => r.format === 'CSV' && /food.prices/i.test(r.name));
  if (!resource) throw new Error('Yemen food prices CSV not found on HDX.');
  const wfpFile = path.join(tmp, 'wfp.csv');
  curl(resource.url, wfpFile);
  const wfpLines = fs.readFileSync(wfpFile, 'utf8').replace(/^﻿/, '').split('\n').map((line) => line.replace(/\r$/, ''));
  const header = splitCsv(wfpLines[0]);
  const idx = Object.fromEntries(['date', 'market', 'commodity', 'unit', 'pricetype', 'currency', 'price', 'usdprice'].map((k) => [k, header.indexOf(k)]));
  if (Object.values(idx).some((i) => i < 0)) throw new Error('Unexpected WFP CSV header.');
  const kept = ['"date","market","commodity","unit","price_yer"'];
  for (const line of wfpLines.slice(1)) {
    if (!line.trim()) continue;
    const f = splitCsv(line);
    if (f[idx.pricetype] !== 'Retail' || !YEMEN_ITEMS.includes(f[idx.commodity]) || f[idx.date] < '2016-01') continue;
    if (!Number(f[idx.price]) || f[idx.currency] !== 'YER') continue;
    kept.push([f[idx.date], f[idx.market], f[idx.commodity], f[idx.unit], f[idx.price]].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
  }
  kept.splice(1, 0, `"# source ${resource.url} | modified ${resource.last_modified} | retrieved ${new Date().toISOString().slice(0, 10)}","","","",""`);
  if (kept.length < 5000) throw new Error(`WFP extract implausibly small (${kept.length} rows).`);
  replaceIfNewer(path.join(SOURCES, 'wfp-yemen-prices.csv'), `${kept.join('\n')}\n`, /"(\d{4}-\d{2})-\d{2}"/g);
  console.log('Now run: node scripts/build-context.cjs && node scripts/validate-context.cjs');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
