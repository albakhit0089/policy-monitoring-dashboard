#!/usr/bin/env node
'use strict';

// Refreshes data/sources/faostat-cp-region.csv from the official FAOSTAT bulk download.
// Safeguards: the download goes to a temporary file first, and the regional extract only replaces the
// committed one when it parses, covers all seven countries and does not lose months - a failed or
// truncated download can never overwrite valid historical data.
// Requires: curl and unzip on PATH (both present on GitHub Actions runners and Git Bash).
// Usage: node scripts/fetch-faostat-cp.cjs

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const URL = 'https://bulks-faostat.fao.org/production/ConsumerPriceIndices_E_All_Data_(Normalized).zip';
const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'data/sources/faostat-cp-region.csv');
const COUNTRIES = ['Bahrain', 'Kuwait', 'Oman', 'Qatar', 'Saudi Arabia', 'United Arab Emirates', 'Yemen'];

const latestMonth = (csv) => {
  let latest = '';
  for (const line of csv.split('\n')) {
    const m = line.match(/"(7\d{3})","[A-Za-z]+","\d+","(\d{4})"/);
    if (!m || Number(m[1]) > 7012) continue;
    const ym = `${m[2]}-${String(Number(m[1]) - 7000).padStart(2, '0')}`;
    if (ym > latest) latest = ym;
  }
  return latest;
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'faostat-cp-'));
try {
  const zip = path.join(tmp, 'cp.zip');
  execFileSync('curl', ['-sS', '-m', '600', '-o', zip, URL], { stdio: 'inherit' });
  const csvName = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').find((n) => n.includes('All_Data'));
  const full = execFileSync('unzip', ['-p', zip, csvName.trim()], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const lines = full.split('\n');
  const header = lines[0];
  if (!header.includes('Area') || !header.includes('Months Code')) throw new Error('Unexpected header in download');
  const regional = lines.filter((line, i) => i > 0 && COUNTRIES.some((c) => line.includes(`"${c}"`)));
  for (const c of COUNTRIES) if (!regional.some((line) => line.includes(`"${c}"`))) throw new Error(`Download is missing ${c}`);
  const next = [header, ...regional].join('\n');
  if (fs.existsSync(TARGET)) {
    const current = fs.readFileSync(TARGET, 'utf8');
    const currentLatest = latestMonth(current), nextLatest = latestMonth(next);
    const currentRows = current.split('\n').length, nextRows = next.split('\n').length;
    if (nextLatest < currentLatest || nextRows < currentRows * 0.98) {
      throw new Error(`Refusing to overwrite: new extract ends ${nextLatest} with ${nextRows} rows; current ends ${currentLatest} with ${currentRows} rows.`);
    }
  }
  fs.writeFileSync(TARGET, next.endsWith('\n') ? next : `${next}\n`);
  console.log(`Updated ${path.relative(ROOT, TARGET)}: ${next.split('\n').length} rows, latest month ${latestMonth(next)}. Now run: npm run build-forecasts && node scripts/validate-forecasts.cjs`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
