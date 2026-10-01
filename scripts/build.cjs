'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const required = ['index.html', 'styles.css', 'app.js', 'data-service.js', 'data/gcc-yemen-measures.json'];
const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) throw new Error(`Required static files are missing: ${missing.join(', ')}`);
for (const file of ['app.js', 'data-service.js', 'api/policy-ai.js', 'scripts/build-data.cjs', 'scripts/test-ai-api.mjs']) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${file} syntax check failed:\n${result.stderr}`);
}
// The full multi-country source is generated locally and deliberately not published.
const sourcePath = path.join(root, 'data/measures.json');
const source = fs.existsSync(sourcePath) ? JSON.parse(fs.readFileSync(sourcePath, 'utf8')) : null;
const payload = JSON.parse(fs.readFileSync(path.join(root, 'data/gcc-yemen-measures.json'), 'utf8'));
const allowed = new Set(['Bahrain', 'Kuwait', 'Oman', 'Qatar', 'Saudi Arabia', 'United Arab Emirates', 'Yemen']);
if (source && source.records.length !== source.recordCount) throw new Error('Full source dataset recordCount does not match records length.');
if (payload.records.length !== payload.recordCount) throw new Error('Regional data recordCount does not match records length.');
if (payload.records.some((record) => !allowed.has(record.country))) throw new Error('Non-GCC/Yemen record found in the dashboard dataset.');
if (new Set(payload.records.map((record) => record.id)).size !== payload.records.length) throw new Error('Regional record IDs are not unique.');
if (source) {
  const sourceIds = new Set(source.records.map((record) => record.id));
  if (payload.records.some((record) => !sourceIds.has(record.id))) throw new Error('Regional record not present in the preserved source dataset.');
}
if (new Set(payload.records.map((record) => record.country)).size !== 7) throw new Error('Regional dataset does not contain all seven target countries.');
console.log(`Static dashboard check passed: ${payload.recordCount.toLocaleString()} GCC/Yemen records, seven countries; ${source ? `preserved ${source.recordCount.toLocaleString()} source records` : 'full source dataset not present (skipped cross-check)'}; JavaScript syntax valid.`);
