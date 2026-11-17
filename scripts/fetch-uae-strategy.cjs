#!/usr/bin/env node
'use strict';

// PILOT (UAE strategy tracker). Fetches three FAOSTAT bulk domains and writes small UAE-only extracts
// into data/sources/:
//   uae-trade-imports.csv  Detailed trade matrix (TM): UAE-reported imports by partner, basket items only
//   uae-fbs.csv            Food balances (FBS): production, imports, exports, domestic supply
//   uae-fs.csv             Suite of food security indicators (FS): selected indicators
// The trade matrix unpacks to about 8.5 GB, so it is streamed through `unzip -p` and filtered line by
// line; nothing is written to disk except the extract. A download that ends earlier than the committed
// extract is refused, as in the other fetch scripts.
// Requires: curl and unzip on PATH. Set UAE_RAW_DIR to reuse already downloaded TM.zip / FBS.zip / FS.zip.
// Usage: node scripts/fetch-uae-strategy.cjs

const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');

const ROOT = path.resolve(__dirname, '..');
const SOURCES = path.join(ROOT, 'data/sources');
const basket = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/strategy/uae-basket.json'), 'utf8'));
const CATALOGUE = 'https://bulks-faostat.fao.org/production/datasets_E.json';
const UAE = 'United Arab Emirates';
const TRADE_CODES = new Set(basket.tradeCategories.flatMap((category) => category.codes.map(String)));
const FBS_CODES = new Set(basket.balanceItems.map((item) => String(item.code)));
const FBS_ELEMENTS = new Set(['Production', 'Import quantity', 'Export quantity', 'Domestic supply quantity']);
const FS_CODES = new Set(basket.foodSecurityItems.map((item) => item.code));
const today = new Date().toISOString().slice(0, 10);

const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
// CSV fields; FAOSTAT quotes most fields but leaves a trailing empty "Note" field unquoted.
function fields(line) {
  const out = []; let cell = '', quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) { if (ch === '"' && line[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cell); cell = ''; }
    else cell += ch;
  }
  out.push(cell);
  return out;
}
function stream(zip, member, onLine, areas = [UAE]) {
  return new Promise((resolve, reject) => {
    const child = spawn('unzip', ['-p', zip, member]);
    const rl = readline.createInterface({ input: child.stdout });
    let header = null;
    rl.on('line', (line) => { if (header === null) { header = line; return; } if (areas.some((area) => line.includes(`"${area}"`))) onLine(fields(line)); });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(header) : reject(new Error(`unzip exited with ${code} for ${member}`))));
  });
}
function replaceIfNewer(target, text, latest) {
  if (fs.existsSync(target)) {
    const current = fs.readFileSync(target, 'utf8').match(/latest (\d{4})/);
    if (current && latest < Number(current[1])) throw new Error(`Refusing to overwrite ${path.basename(target)}: the download ends in ${latest}, the committed extract in ${current[1]}.`);
  }
  fs.writeFileSync(target, text);
  console.log(`${path.basename(target)}: latest ${latest}, ${text.split('\n').length - 3} rows`);
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uae-strategy-'));
  try {
    execFileSync('curl', ['-sSL', '-m', '120', '-o', path.join(tmp, 'catalogue.json'), CATALOGUE], { stdio: 'inherit' });
    const catalogue = JSON.parse(fs.readFileSync(path.join(tmp, 'catalogue.json'), 'utf8')).Datasets.Dataset;
    const dataset = (code) => { const entry = catalogue.find((item) => item.DatasetCode === code); if (!entry) throw new Error(`FAOSTAT domain ${code} not in the catalogue`); return entry; };
    const zipFor = (code) => {
      const reuse = process.env.UAE_RAW_DIR && path.join(process.env.UAE_RAW_DIR, `${code}.zip`);
      if (reuse && fs.existsSync(reuse)) return reuse;
      const out = path.join(tmp, `${code}.zip`);
      execFileSync('curl', ['-sSL', '-m', '3600', '-o', out, dataset(code).FileLocation], { stdio: 'inherit' });
      return out;
    };
    const csvName = (code) => decodeURIComponent(path.basename(dataset(code).FileLocation)).replace(/\.zip$/, '.csv');
    const meta = (code) => `# FAOSTAT ${code} | ${dataset(code).FileLocation} | updated ${String(dataset(code).DateUpdate).slice(0, 10)} | retrieved ${today}`;

    // 1. Trade matrix: UAE as reporter, imports only, basket items, 2010 onward. One row per year/item/partner.
    const trade = new Map();
    const tradeHeader = await stream(zipFor('TM'), csvName('TM'), (f) => {
      if (f[2] !== UAE || !TRADE_CODES.has(f[6]) || Number(f[12]) < 2010) return;
      const element = f[10] === 'Import quantity' ? 'qty' : f[10] === 'Import value' ? 'value' : null;
      if (!element || f[13] === '' || f[14] === '') return;
      const key = `${f[12]}|${f[6]}|${f[5]}`;
      const row = trade.get(key) || { year: f[12], code: f[6], item: f[8], partner: f[5], qty: '', value: '' };
      row[element] = Number(f[14]);
      trade.set(key, row);
    });
    if (!/Reporter Countries.*Partner Countries.*Item Code.*Element.*Year.*Value/.test(tradeHeader)) throw new Error('Unexpected trade matrix header.');
    const tradeRows = [...trade.values()].filter((row) => row.qty !== '' || row.value !== '').sort((a, b) => a.year.localeCompare(b.year) || Number(a.code) - Number(b.code) || a.partner.localeCompare(b.partner));
    const tradeLatest = Math.max(...tradeRows.map((row) => Number(row.year)));
    if (tradeRows.length < 3000) throw new Error(`Trade extract implausibly small (${tradeRows.length} rows).`);
    replaceIfNewer(path.join(SOURCES, 'uae-trade-imports.csv'), `${meta('TM')} | latest ${tradeLatest}\n"year","item_code","item","partner","qty_t","value_kusd"\n${tradeRows.map((row) => [row.year, row.code, row.item, row.partner, row.qty, row.value].map(quote).join(',')).join('\n')}\n`, tradeLatest);

    // 2. Food balances: selected items and elements (thousand tonnes) with FAO flags kept.
    const fbsRows = [];
    await stream(zipFor('FBS'), csvName('FBS'), (f) => {
      if (f[2] !== UAE || !FBS_CODES.has(f[4].replace(/^'?S?/, '')) || !FBS_ELEMENTS.has(f[7]) || f[11] === '') return;
      fbsRows.push([f[4].replace(/^'?S?/, ''), f[5], f[7], f[9], f[11], f[12]]);
    });
    const fbsLatest = Math.max(...fbsRows.map((row) => Number(row[3])));
    if (fbsRows.length < 300) throw new Error(`Food balance extract implausibly small (${fbsRows.length} rows).`);
    replaceIfNewer(path.join(SOURCES, 'uae-fbs.csv'), `${meta('FBS')} | latest ${fbsLatest}\n"item_code","item","element","year","value_kt","flag"\n${fbsRows.map((row) => row.map(quote).join(',')).join('\n')}\n`, fbsLatest);

    // 3. Food security indicators (UAE, plus the World aggregate for comparison): the "Value" element only (confidence bounds dropped), values kept as published ("<2.5").
    const fsRows = [];
    await stream(zipFor('FS'), csvName('FS'), (f) => {
      if (![UAE, 'World'].includes(f[2]) || !FS_CODES.has(f[3]) || f[6] !== 'Value' || f[10] === '') return;
      fsRows.push([f[2], f[3], f[4], f[8], f[10], f[11]]);
    }, [UAE, 'World']);
    const fsLatest = Math.max(...fsRows.filter((row) => row[0] === UAE).map((row) => Number(String(row[3]).slice(-4))));
    if (fsRows.length < 30) throw new Error(`Food security extract implausibly small (${fsRows.length} rows).`);
    replaceIfNewer(path.join(SOURCES, 'uae-fs.csv'), `${meta('FS')} | latest ${fsLatest}\n"area","item_code","item","year","value","flag"\n${fsRows.map((row) => row.map(quote).join(',')).join('\n')}\n`, fsLatest);
    console.log('Now run: npm run pilot-uae');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error.message); process.exit(1); });
