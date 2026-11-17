#!/usr/bin/env node
'use strict';

// PILOT. Writes pilot/uae-strategy-standalone.html: the UAE pilot page as ONE self-contained file
// (styles, D3, data, Word export and page script inlined) that opens by double-click, with no server.
// The file is a local review copy and is not committed (see .gitignore).
// Usage: node scripts/build-uae-standalone.cjs

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
// Inlined code must not close its own <script> or <style> element early.
const safeScript = (code) => code.replace(/<\/script/gi, '<\\/script');
const safeStyle = (css) => css.replace(/<\/style/gi, '<\\/style');

const data = { tracker: JSON.parse(read('data/strategy/uae-tracker.json')), register: JSON.parse(read('data/strategy/uae-register.json')) };
// docx.js is an ES module with no imports; expose its export on window for a classic script.
const docx = read('docx.js').replace(/^export\s+/gm, '');
if (/^\s*import\s/m.test(docx)) throw new Error('docx.js now has imports; the standalone builder must be updated.');
const page = read('pilot/uae-strategy.js');
const html = read('pilot/uae-strategy.html')
  .replace(/<link rel="stylesheet" href="\.\.\/styles\.css[^"]*" \/>/, () => `<style>${safeStyle(read('styles.css'))}</style>`)
  .replace(/<link rel="stylesheet" href="\.\/uae-strategy\.css[^"]*" \/>/, () => `<style>${safeStyle(read('pilot/uae-strategy.css'))}</style>`)
  .replace(/<link rel="icon"[^>]*>/, '')
  .replace(/<script src="\.\.\/assets\/vendor\/d3\.min\.js" defer><\/script>/, () => `<script>${safeScript(read('assets/vendor/d3.min.js'))}</script>\n<script>window.PilotDocx = (function () {\n${safeScript(docx)}\nreturn { buildDocx };\n})();</script>\n<script>window.__UAE_PILOT__ = ${safeScript(JSON.stringify(data))};</script>`)
  .replace(/<script type="module" src="\.\/uae-strategy\.js[^"]*"><\/script>/, () => `<script type="module">${safeScript(page)}</script>`);
for (const marker of ['window.__UAE_PILOT__', 'window.PilotDocx', 'd3js.org', 'drawDiversification']) if (!html.includes(marker)) throw new Error(`Standalone build failed: ${marker} missing.`);
if (/(href|src)="\.\.?\//.test(html)) throw new Error('Standalone build still references a local file.');
const out = path.join(ROOT, 'pilot/uae-strategy-standalone.html');
fs.writeFileSync(out, html);
console.log(`Standalone review copy written: ${path.relative(ROOT, out)} (${Math.round(html.length / 1024)} KB). Open it by double-clicking.`);
