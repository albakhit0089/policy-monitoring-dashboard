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

// Alerts: every fact sourced with a link; a level never below its computed price signal.
const RANK = { clear: 0, none: 0, watch: 1, high: 2, critical: 3 };
for (const alert of tracker.alerts) {
  check(['critical', 'high', 'watch', 'clear'].includes(alert.level), `alert ${alert.id}: unknown level`);
  check(alert.facts.length && alert.facts.every((fact) => fact.src.length), `alert ${alert.id}: a fact has no source`);
  check(alert.sources.every((source) => /^https?:\/\//.test(source.url || '')), `alert ${alert.id}: a source has no link`);
  check(alert.sources.every((source) => !source.recordId || records.get(source.recordId)?.source === source.url), `alert ${alert.id}: record source mismatch`);
  if (alert.price) check(RANK[alert.level] >= RANK[alert.price.level], `alert ${alert.id}: level ${alert.level} is below its price signal (${alert.price.level})`);
  check(alert.response && alert.watch, `alert ${alert.id}: response or indicator missing`);
}
check(tracker.situation.day > 0, 'crisis day count missing');
// Commitments: sourced basis; outside-record evidence carries its own link.
for (const commitment of tracker.commitments) {
  check(commitment.basis && LEVELS.includes(commitment.verification), `commitment ${commitment.id}: basis or verification missing`);
  if (commitment.recordId) check(records.has(commitment.recordId), `commitment ${commitment.id}: record ${commitment.recordId} not found`);
  commitment.outsideEvidence.forEach((item) => check(/^https:\/\//.test(item.source?.url || ''), `commitment ${commitment.id}: outside evidence without a link`));
}
// Government use: every decision has a suggested lead that is a real UAE entity in the record, a timeframe
// and an indicator; English and Arabic carry the same decisions and the not-official disclaimer; every alert
// and commitment has its Arabic text.
const institutions = new Set([...records.values()].filter((record) => record.country === 'United Arab Emirates').map((record) => record.institution));
const note = tracker.decisionNote;
check(note.en.decisions.length >= 1 && note.en.decisions.length === note.ar.decisions.length, 'decision note: English and Arabic decisions differ');
for (const [lang, version] of Object.entries({ en: note.en, ar: note.ar })) {
  version.decisions.forEach((item) => check(item.issue && item.decision && item.lead && item.timeframe && item.indicator, `decision note (${lang}): ${item.id} incomplete`));
  check(version.disclaimer && version.situation.length === 2, `decision note (${lang}): disclaimer or situation missing`);
}
check(/not an official assessment/.test(note.en.disclaimer) && /ليس تقييماً رسمياً/.test(note.ar.disclaimer), 'decision note lacks the not-official disclaimer');
for (const alert of tracker.alerts) {
  check(institutions.has(alert.leadEntity?.en), `alert ${alert.id}: suggested lead is not an entity in the UAE record`);
  alert.alsoEntities.forEach((entity) => check(institutions.has(entity.en), `alert ${alert.id}: ${entity.en} not in the UAE record`));
  check(alert.ar && alert.ar.title && alert.ar.facts.length === alert.facts.length && alert.ar.response && alert.ar.watch && alert.ar.decision, `alert ${alert.id}: Arabic text incomplete`);
  check(alert.exposureText_ar.length === alert.exposureText.length, `alert ${alert.id}: Arabic exposure text incomplete`);
}
tracker.commitments.forEach((c) => check(c.name_ar && c.statusText_ar && c.basis_ar, `commitment ${c.id}: Arabic text missing`));
check(tracker.essentials.length === 8 && tracker.essentials.every((e) => tracker.diversification.categories.some((c) => c.id === e.id)), 'essential goods mapping incomplete');

// 5. Every number in computed text (findings, alerts, commitments, decision note; English and Arabic) is
// traceable to the data (allowing rounding).
const findingsText = JSON.stringify([tracker.findings, tracker.alerts.map((alert) => [alert.exposureText, alert.exposureText_ar]), tracker.commitments.map((c) => [c.statusText, c.statusText_ar]), note.en.situation, note.ar.situation, note.en.decisions.map((d) => d.issue), note.ar.decisions.map((d) => d.issue), note.en.commitments, note.ar.commitments]);
check(!/NaN|undefined|null%/.test(findingsText), 'findings text contains NaN/undefined');
const data = JSON.stringify({ ...tracker, findings: undefined, decisionNote: undefined, commitments: tracker.commitments.map((c) => ({ ...c, statusText: undefined, statusText_ar: undefined })), alerts: tracker.alerts.map((a) => ({ ...a, exposureText: undefined, exposureText_ar: undefined })) }) + JSON.stringify(register) + JSON.stringify(basket) + JSON.stringify(read('data/strategy/uae-alerts.json')) + JSON.stringify(read('data/forecasts/context.json').commodities);
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
