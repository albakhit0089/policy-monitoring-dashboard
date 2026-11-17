#!/usr/bin/env node
'use strict';

// PILOT (UAE strategy tracker). Validates the register and the computed tracker; exits non-zero on any
// breach so an unsourced goal, an unverified target used for a status, or an untraceable number cannot ship.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const register = read('data/strategy/uae-register.json');
const basket = read('data/strategy/uae-basket.json');
const tracker = read('data/strategy/uae-tracker.json');
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
const LEVELS = Object.keys(register.verificationLevels);

// 1. Register: every item sourced and verification-labelled.
const goalIds = new Set();
for (const strategy of register.strategies) {
  check(/^https:\/\//.test(strategy.source?.url || ''), `${strategy.id}: source URL missing`);
  check(/^\d{4}-\d{2}-\d{2}$/.test(strategy.source?.checked || ''), `${strategy.id}: source check date missing`);
  if (strategy.headline) check(strategy.headline.verification === 'official' && strategy.headline.quote, `${strategy.id}: headline must be an official quote`);
  for (const goal of strategy.goals) {
    goalIds.add(`${strategy.id}:${goal.id}`);
    check(LEVELS.includes(goal.verification), `${strategy.id}:${goal.id}: unknown verification level`);
    if (goal.verification === 'pending') check(!goal.quote && !goal.target && !goal.benchmark, `${strategy.id}:${goal.id}: a pending goal cannot carry a quote, target or benchmark`);
    else check(typeof goal.quote === 'string' && goal.quote.length > 5, `${strategy.id}:${goal.id}: quote missing`);
    if (goal.benchmark) check(goal.verification === 'official', `${strategy.id}:${goal.id}: only an official goal may set a benchmark`);
  }
}
check(tracker.benchmark.min === 3 && tracker.benchmark.max === 5, 'benchmark must come from the official goal (3-5 sources)');

// 2. Diversification metrics are internally consistent and current.
const thisYear = Number(tracker.generatedAt.slice(0, 4));
check(tracker.diversification.categories.length === basket.tradeCategories.length, 'a basket category has no trade data');
for (const category of tracker.diversification.categories) {
  check(Number(category.latest) >= thisYear - 4, `${category.name}: latest trade year ${category.latest} is stale`);
  check(Object.keys(category.years).length >= 5, `${category.name}: under five years of trade data`);
  for (const [year, entry] of Object.entries(category.years)) {
    check(entry.effective >= 1 && entry.effective <= entry.suppliers + 1e-9, `${category.name} ${year}: effective suppliers out of range`);
    check(entry.top.share > 0 && entry.top.share <= 100 && entry.top.share + 1e-9 >= 100 / entry.suppliers - .1, `${category.name} ${year}: top-supplier share inconsistent`);
    check(entry.leading.reduce((sum, item) => sum + item.share, 0) <= 100.5, `${category.name} ${year}: shares exceed 100%`);
  }
  check(['meets', 'partly', 'concentrated'].includes(category.status), `${category.name}: missing status`);
}
for (const item of tracker.production.items) for (const [year, entry] of Object.entries(item.years)) if (entry.selfSufficiency !== undefined) check(Number.isFinite(entry.selfSufficiency) && entry.selfSufficiency >= 0, `${item.name} ${year}: implausible self-sufficiency`);
for (const indicator of tracker.indicators) check(indicator.latest, `${indicator.name}: no data`);

// 3. Findings: every pillar covered, linked to registered goals, with draft options.
for (const pillar of register.pillars) {
  const finding = tracker.findings[pillar.id];
  check(finding, `pillar ${pillar.id}: no finding`);
  if (!finding) continue;
  check(finding.status && finding.statusLabel, `pillar ${pillar.id}: status missing`);
  check(finding.analysis.length >= 1 && finding.options.length >= 1, `pillar ${pillar.id}: analysis or options missing`);
  finding.goals.forEach((id) => check(goalIds.has(id), `pillar ${pillar.id}: unknown goal ${id}`));
  finding.options.forEach((option) => check(option.action && option.why && option.watch, `pillar ${pillar.id}: an option lacks action, reason or indicator`));
}
// A status may rest only on official goals: the waste pillar's target is press-reported, so it must stay "pending".
check(tracker.findings.waste.status === 'baseline-pending', 'waste pillar must not be scored while its target is press-reported and has no baseline');

// 4. Evidence: every cited measure is a UAE record with a source link.
const records = new Map(read('data/gcc-yemen-measures.json').records.map((record) => [record.id, record]));
for (const [pillar, evidence] of Object.entries(tracker.implementation)) for (const example of evidence.examples) {
  const record = records.get(example.id);
  check(record && record.country === 'United Arab Emirates' && /^https?:\/\//.test(record.source || ''), `${pillar}: cited measure ${example.id} is not a sourced UAE record`);
}

// Signals (reported strategy changes) must point at a sourced record with the same link, and stay press-labelled.
for (const signal of register.signals || []) {
  const record = records.get(signal.recordId);
  check(record && record.source === signal.source.url, `signal ${signal.recordId}: not a record with the same source link`);
  check(signal.verification !== 'official', `signal ${signal.recordId}: a record-derived signal cannot be labelled official`);
}

// 5. Every number in the findings text is traceable to the data (allowing rounding).
const findingsText = JSON.stringify(tracker.findings);
check(!/NaN|undefined|null%/.test(findingsText), 'findings text contains NaN/undefined');
const data = JSON.stringify({ ...tracker, findings: undefined }) + JSON.stringify(register) + JSON.stringify(basket);
const allowed = new Set();
for (const token of data.match(/-?\d+(?:\.\d+)?/g) || []) {
  const n = Number(token);
  [token, token.replace(/^-/, ''), String(n), String(Math.round(n)), n.toFixed(1), String(Math.round(Math.abs(n))), Math.abs(n).toFixed(1)].forEach((variant) => allowed.add(variant));
}
const stray = [...new Set((findingsText.match(/\d+(?:\.\d+)?/g) || []).filter((token) => !allowed.has(token)))];
check(!stray.length, `numbers in findings not traceable to the data: ${stray.join(', ')}`);

// 6. The pilot page parses as a module and avoids regex lookbehind (older Safari), like the dashboard.
const page = path.join(ROOT, 'pilot/uae-strategy.js');
if (fs.existsSync(page)) {
  const result = spawnSync(process.execPath, ['--check', page], { encoding: 'utf8' });
  check(result.status === 0, `pilot/uae-strategy.js syntax: ${result.stderr}`);
  check(!/\(\?<[=!]/.test(fs.readFileSync(page, 'utf8')), 'pilot/uae-strategy.js uses a regex lookbehind');
}

if (failures.length) {
  console.error(`UAE strategy pilot validation FAILED:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
const c = tracker.diversification.categories;
console.log(`UAE strategy pilot validation passed: ${goalIds.size} registered goals (all sourced or marked pending), ${c.length} basket categories to ${tracker.diversification.latestYear}, ${register.pillars.length} pillars with findings and draft options, every cited measure sourced, every number traceable.`);
