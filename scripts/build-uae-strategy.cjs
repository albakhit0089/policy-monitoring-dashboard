#!/usr/bin/env node
'use strict';

// PILOT (UAE strategy tracker). Builds data/strategy/uae-tracker.json from:
//   data/strategy/uae-register.json   sourced strategy goals (hand-curated, verification-labelled)
//   data/strategy/uae-basket.json     stand-in basket and indicator selection
//   data/sources/uae-*.csv            FAOSTAT extracts written by scripts/fetch-uae-strategy.cjs
//   data/gcc-yemen-measures.json      the monitored policy record (implementation evidence)
//   data/food-indicators.json         FAOSTAT consumer price indices (affordability context)
// Every number in the findings text is computed here from those files; nothing is typed in by hand.
// Usage: node scripts/build-uae-strategy.cjs

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const register = JSON.parse(read('data/strategy/uae-register.json'));
const basket = JSON.parse(read('data/strategy/uae-basket.json'));
const UAE = 'United Arab Emirates';
const BENCHMARK = register.strategies.find((s) => s.id === 'nfss2051').goals.find((g) => g.benchmark).benchmark; // 3-5 sources
const round = (value, places = 1) => Math.round(value * 10 ** places) / 10 ** places;
const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const count = (n, lower = false) => { const word = n <= 10 ? WORDS[n] : String(n); return lower && n <= 10 ? word.toLowerCase() : word; };
const dayLabel = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const monthLabel = (key) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const pct = (value, places = 0) => `${round(value, places).toFixed(places)}%`;
const list = (items) => items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
function splitCsv(line) {
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
function readExtract(file) {
  const lines = read(file).trim().split('\n');
  const meta = lines[0].replace(/^# /, '');
  const header = splitCsv(lines[1]);
  return { meta, rows: lines.slice(2).map((line) => Object.fromEntries(splitCsv(line).map((value, i) => [header[i], value]))) };
}

// ---------- 1. Import diversification (trade matrix) ----------
const trade = readExtract('data/sources/uae-trade-imports.csv');
const categories = basket.tradeCategories.map((category) => {
  const codes = new Set(category.codes.map(String));
  const byYear = {};
  trade.rows.filter((row) => codes.has(row.item_code) && row.qty_t !== '' && Number(row.qty_t) > 0).forEach((row) => {
    const year = (byYear[row.year] ??= new Map());
    year.set(row.partner, (year.get(row.partner) || 0) + Number(row.qty_t));
  });
  const years = {};
  for (const [year, partners] of Object.entries(byYear)) {
    const total = [...partners.values()].reduce((sum, value) => sum + value, 0);
    const shares = [...partners.entries()].map(([partner, qty]) => ({ partner, share: qty / total })).sort((a, b) => b.share - a.share);
    const hhi = shares.reduce((sum, item) => sum + item.share ** 2, 0);
    years[year] = { totalT: Math.round(total), suppliers: shares.length, effective: round(1 / hhi, 2), top: { partner: shares[0].partner, share: round(shares[0].share * 100, 1) }, over5: shares.filter((item) => item.share >= .05).length, leading: shares.slice(0, 5).map((item) => ({ partner: item.partner, share: round(item.share * 100, 1) })) };
  }
  const yearKeys = Object.keys(years).sort();
  const latest = yearKeys.at(-1);
  const compareYear = String(Number(latest) - 5);
  const effective = years[latest]?.effective;
  const status = effective === undefined ? 'no-data' : effective >= BENCHMARK.min ? 'meets' : effective >= 2 ? 'partly' : 'concentrated';
  return { ...category, latest, compareYear: years[compareYear] ? compareYear : yearKeys[0], years, status };
});
const latestTradeYear = categories.map((c) => c.latest).sort().at(-1);
const byStatus = (status) => categories.filter((c) => c.status === status);
const changeOf = (c) => c.years[c.latest].effective - c.years[c.compareYear].effective;

// ---------- 2. Local production (food balances) ----------
const fbs = readExtract('data/sources/uae-fbs.csv');
const fbsFlags = fbs.rows.reduce((acc, row) => { acc[row.flag || 'official'] = (acc[row.flag || 'official'] || 0) + 1; return acc; }, {});
const balance = basket.balanceItems.map((item) => {
  const rows = fbs.rows.filter((row) => row.item_code === String(item.code));
  const years = {};
  rows.forEach((row) => { (years[row.year] ??= {})[{ Production: 'production', 'Import quantity': 'imports', 'Export quantity': 'exports', 'Domestic supply quantity': 'supply' }[row.element]] = Number(row.value_kt); });
  for (const entry of Object.values(years)) {
    entry.production ??= 0; // FAOSTAT omits a production row where none is recorded
    if (entry.supply > 0) entry.selfSufficiency = round(entry.production / entry.supply * 100, 1);
  }
  const keys = Object.keys(years).filter((year) => years[year].selfSufficiency !== undefined).sort();
  return { ...item, years, latest: keys.at(-1), first: keys.includes('2015') ? '2015' : keys[0] };
}).filter((item) => item.latest);
const ssrChange = (item) => item.years[item.latest].selfSufficiency - item.years[item.first].selfSufficiency;
const rising = balance.filter((item) => ssrChange(item) >= 3).sort((a, b) => ssrChange(b) - ssrChange(a));
const falling = balance.filter((item) => ssrChange(item) <= -3).sort((a, b) => ssrChange(a) - ssrChange(b));
const nearZero = balance.filter((item) => item.years[item.latest].selfSufficiency < 2);
// Combined crop self-sufficiency, with and without cereals: the reported 50% "crop needs" target is not
// yet defined, and the definition changes the answer more than any trend does.
const CEREALS = new Set([2511, 2514]);
const CROPS = new Set([2511, 2514, 2531, 2601, 2605, 2619]);
const cropShare = (includeCereals) => {
  const items = balance.filter((item) => CROPS.has(item.code) && (includeCereals || !CEREALS.has(item.code)));
  const year = items.map((item) => item.latest).sort()[0];
  const production = items.reduce((sum, item) => sum + (item.years[year]?.production || 0), 0);
  const supply = items.reduce((sum, item) => sum + (item.years[year]?.supply || 0), 0);
  return { year, production: round(production, 0), supply: round(supply, 0), share: round(production / supply * 100, 0), items: items.map((item) => item.name) };
};
const cropAggregate = { withCereals: cropShare(true), withoutCereals: cropShare(false) };
const cropSignal = (register.signals || []).find((signal) => signal.target?.pillar === 'production');

// ---------- 3. Food security indicators ----------
const fsx = readExtract('data/sources/uae-fs.csv');
const seriesOf = (area, code) => fsx.rows.filter((row) => row.area === area && row.item_code === code).map((row) => ({ period: row.year, value: row.value, numeric: /^-?[\d.]+$/.test(row.value) ? Number(row.value) : null })).sort((a, b) => a.period.localeCompare(b.period));
const indicators = basket.foodSecurityItems.map((item) => {
  const series = seriesOf(UAE, item.code);
  const latest = series.at(-1) || null;
  const world = latest ? seriesOf('World', item.code).find((entry) => entry.period === latest.period) || null : null;
  return { ...item, series, latest, world };
});
const indicator = (code) => indicators.find((item) => item.code === code)?.latest;
const worldOf = (code) => indicators.find((item) => item.code === code)?.world;
// "about twice the world average of 16.2%", "above ...", "below ..." - computed, never asserted.
function versusWorld(local, world) {
  if (!world || local.numeric === null || world.numeric === null || world.numeric <= 0) return 'with no world comparison available';
  const ratio = local.numeric / world.numeric;
  if (ratio >= 1.8) return `about ${ratio >= 2.5 ? round(ratio, 1) : 'twice'} the world average of ${world.value}%`;
  if (ratio > 1.05) return `above the world average of ${world.value}%`;
  if (ratio < .95) return `below the world average of ${world.value}%`;
  return `close to the world average of ${world.value}%`;
}

// ---------- 4. Prices (FAOSTAT CPI, already on the dashboard) ----------
const food = JSON.parse(read('data/food-indicators.json'));
const cpi = food.cpi?.countries?.[UAE];
const cpiMonths = cpi ? Object.keys(cpi.inflation).sort() : [];
const cpiLatest = cpiMonths.length ? { month: cpiMonths.at(-1), label: monthLabel(cpiMonths.at(-1)), value: round(cpi.inflation[cpiMonths.at(-1)], 1).toFixed(1) } : null;

// ---------- 5. Implementation evidence (policy record) ----------
const records = JSON.parse(read('data/gcc-yemen-measures.json')).records.filter((record) => record.country === UAE && record.date && /^https?:\/\//.test(record.source || ''));
const through = JSON.parse(read('data/gcc-yemen-measures.json')).records.map((record) => record.date).filter(Boolean).sort().at(-1);
const PILLAR_PATTERNS = {
  supply: /\b(imports?|importing|supplier|sourcing|diversif\w*|trade agreements?|economic partnership|CEPA|offtake|overseas|abroad|food corridors?|supply chains?|logistic\w*|customs|re-export\w*)\b/i,
  production: /\b(local production|domestic production|locally (grown|produced)|farms?|farmers?|greenhouses?|hydroponic\w*|vertical farm\w*|agri-?tech|aquaculture|fish farm\w*|livestock|poultry|dairy|crops?|harvest\w*|cultivat\w*|seeds?)\b/i,
  preparedness: /\b(strategic (reserves?|stocks?)|stockpil\w*|food reserves?|emergenc\w*|crisis|crises|contingenc\w*|resilien\w*|preparedness|shortages?)\b/i,
  waste: /\b(food (loss|waste)|wastage|ne'?ma|leftover\w*|surplus food|food banks?|compost\w*)\b/i,
  safety: /\b(food safety|inspection\w*|contamina\w*|residues?|halal|conformity|quality control|food standards?|ADAFSA|recall\w*|label\w*)\b/i,
};
const lead = (record) => `${record.title}. ${String(record.description || '').split(/(?:[.!?])\s+/).slice(0, 2).join(' ')}`;
const EVENT = /\b(participat\w*|exhibitions?|expo|forums?|conferences?|festivals?|summits?|showcas\w*|registration)\b/i;
const MONEY = /(\$|US\$|USD|AED|Dh|dirhams?)\s?[\d.,]+\s?(million|billion|bn|mn)?|[\d.,]+\s?(million|billion)\s?(US )?(dollars|dirhams?)/i;
const DAY = 864e5;
const throughMs = new Date(`${through}T00:00:00Z`).getTime();
const implementation = Object.fromEntries(Object.entries(PILLAR_PATTERNS).map(([pillar, pattern]) => {
  const rows = records.filter((record) => pattern.test(lead(record))).sort((a, b) => b.date.localeCompare(a.date));
  const age = (record) => (throughMs - new Date(`${record.date}T00:00:00Z`).getTime()) / DAY;
  const last12 = rows.filter((record) => age(record) < 365);
  const prev12 = rows.filter((record) => age(record) >= 365 && age(record) < 730);
  const institutions = Object.entries(rows.filter((record) => record.institution && record.institution.length <= 70).reduce((acc, record) => { acc[record.institution] = (acc[record.institution] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([name, count]) => ({ name, count }));
  // Examples: binding and on-topic measures first; forums, fairs and festivals are left out.
  const score = (record) => (record.type === 'framework' ? 3 : 0) + (pattern.test(record.title) ? 2 : 0) + (MONEY.test(lead(record)) ? 1 : 0);
  const examples = last12.filter((record) => !EVENT.test(lead(record))).sort((a, b) => score(b) - score(a) || b.date.localeCompare(a.date)).slice(0, 4).map((record) => ({ id: record.id, date: record.date, title: record.title, institution: record.institution || null, type: record.type, source: record.source }));
  return [pillar, { total: rows.length, last12: last12.length, prev12: prev12.length, latest: rows[0]?.date || null, institutions, examples, silent: last12.length === 0 }];
}));
const evidenceLine = (pillar) => {
  const e = implementation[pillar];
  if (!e.total) return 'The policy record holds no measures on this pillar.';
  const pace = e.last12 > e.prev12 * 1.25 ? 'a quickening pace' : e.last12 < e.prev12 * .75 ? 'a slowing pace' : 'a steady pace';
  return e.silent ? `No implementing measures were recorded in the last 12 months; the latest dates from ${dayLabel(e.latest)}. This is a silent pillar.` : `Implementation continues at ${pace} (${e.last12} measures in the last 12 months against ${e.prev12} in the 12 before; latest ${dayLabel(e.latest)}).`;
};
const owner = (pillar) => implementation[pillar].institutions[0]?.name || 'Not identifiable from the record';

// ---------- 6. Findings: status, analysis, draft options (all computed) ----------
const nameList = (items, fn) => list(items.map(fn));
// Proper names (a named programme) keep their capitals mid-sentence.
const nameIn = (c) => /^National Programme/.test(c.name) ? `the ${c.name}` : c.name.charAt(0).toLowerCase() + c.name.slice(1);
const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const concentrated = byStatus('concentrated').sort((a, b) => a.years[a.latest].effective - b.years[b.latest].effective), partly = byStatus('partly'), meets = byStatus('meets');
const inputsAtRisk = [...concentrated, ...partly].filter((c) => c.group === 'Inputs');
const improved = categories.filter((c) => changeOf(c) >= .5).sort((a, b) => changeOf(b) - changeOf(a));
const narrowed = categories.filter((c) => changeOf(c) <= -.5).sort((a, b) => changeOf(a) - changeOf(b));
const cereal = indicator('21035'), importBill = indicator('21033'), insecurity = indicator('210091'), obesity = indicator('21042'), anaemia = indicator('21043');
const supplyStatus = concentrated.length / categories.length >= .25 ? 'at-risk' : (concentrated.length + partly.length) ? 'partly' : 'on-track';
const findings = {
  supply: {
    status: supplyStatus,
    statusLabel: { 'at-risk': 'At risk against the 3-5 source benchmark', partly: 'Partly meets the 3-5 source benchmark', 'on-track': 'Meets the 3-5 source benchmark' }[supplyStatus],
    goals: ['nfss2051:g1', 'nfss2051:g2', 'nfss2051:g3', 'dubaifss:d1'],
    analysis: [
      `In ${latestTradeYear}, ${count(meets.length, true)} of the ${categories.length} basket categories drew on the equivalent of ${count(BENCHMARK.min, true)} or more equally sized suppliers, the lower end of the strategy's ${BENCHMARK.min}-${BENCHMARK.max} source benchmark.${partly.length ? ` ${nameList(partly, (c) => c.name)} fell just short.` : ''}`,
      concentrated.length ? `${count(concentrated.length)} ${concentrated.length === 1 ? 'category depends' : 'categories depend'} on fewer than two effective suppliers: ${nameList(concentrated, (c) => `${nameIn(c)} (${c.years[c.latest].top.partner}, ${pct(c.years[c.latest].top.share)} of tonnes)`)}. For these, one disruption at the dominant origin, whether an export ban, a harvest failure or a shipping closure, would remove most of the supply at once.` : 'No category depends on fewer than two effective suppliers.',
      inputsAtRisk.length ? `Concentration also reaches inputs: ${nameList(inputsAtRisk, (c) => `${nameIn(c)}, which supplies ${c.dependents}`)}. Expanding local production does not remove import risk; part of it moves upstream to the inputs that production needs.` : '',
      `Since ${categories[0].compareYear}, diversification ${improved.length ? `widened for ${nameList(improved.slice(0, 4), (c) => nameIn(c))}` : 'widened for no category'}${narrowed.length ? ` and narrowed for ${nameList(narrowed.slice(0, 4), (c) => nameIn(c))}` : ''}.`,
    ].filter(Boolean),
    method: `Effective number of suppliers = 1 / (sum of squared supplier shares of import tonnes), the inverse Herfindahl-Hirschman index: it equals the number of equally sized suppliers that would give the same concentration. Based on UAE-reported imports, which include goods later re-exported. The strategy's own method for counting "sources" is not published, so this is an analytical proxy.`,
    evidence: evidenceLine('supply'),
    options: [
      concentrated.length ? { action: `Prioritise alternative-origin agreements for ${nameList(concentrated.slice(0, 3), (c) => nameIn(c))}`, why: `Effective suppliers below 2; top origin holds ${nameList(concentrated.slice(0, 3), (c) => `${pct(c.years[c.latest].top.share)} of ${nameIn(c)}`)}.`, watch: `Effective number of suppliers rising to ${BENCHMARK.min} or more` } : null,
      inputsAtRisk.length ? { action: 'Bring production inputs into the food basket and the reserve plan', why: `${nameList(inputsAtRisk, (c) => `${c.name} (${c.dependents})`)} ${inputsAtRisk.length === 1 ? 'is' : 'are'} supplied by very few origins.`, watch: `Effective suppliers of ${nameList(inputsAtRisk, (c) => nameIn(c))}` } : null,
      { action: 'Publish the official basket and the method for counting sources', why: 'The 18-item basket and the measurement method are not public, so progress against goal 3 cannot be verified externally.', watch: 'Official basket list and source-count method released' },
    ].filter(Boolean),
  },
  production: {
    status: rising.length > falling.length ? 'improving' : falling.length > rising.length ? 'declining' : 'mixed',
    statusLabel: `${rising.length > falling.length ? 'Improving' : falling.length > rising.length ? 'Declining' : 'Mixed'} (no numeric target published)`,
    goals: ['dubaifss:d2'],
    analysis: [
      rising.length ? `Local production covers a growing share of supply for ${nameList(rising.slice(0, 4), (item) => `${item.name.toLowerCase()} (from ${pct(item.years[item.first].selfSufficiency)} in ${item.first} to ${pct(item.years[item.latest].selfSufficiency)} in ${item.latest})`)}.` : 'No item shows a clear rise in self-sufficiency.',
      falling.length ? `Self-sufficiency fell for ${nameList(falling.slice(0, 3), (item) => `${item.name.toLowerCase()} (${pct(item.years[item.first].selfSufficiency)} to ${pct(item.years[item.latest].selfSufficiency)})`)}, as demand grew faster than output.` : '',
      nearZero.length ? `${cap(nameList(nearZero, (item) => item.name.toLowerCase()))} ${nearZero.length === 1 ? 'remains' : 'remain'} almost entirely imported. Field staples are structurally constrained by water, so their security rests on the supply pillar, not on this one${rising.length ? `; the gains are in ${nameList(rising.slice(0, 3), (item) => item.name.toLowerCase())}` : ''}.` : '',
      cropSignal ? `A strategy update reported in ${monthLabel(cropSignal.date.slice(0, 7))} aims for domestic production to meet ${cropSignal.target.value}% of crop needs (press-reported; not used for the status). On FAO balances the tracked crops supplied ${cropAggregate.withCereals.share}% of their combined domestic supply locally in ${cropAggregate.withCereals.year}, or ${cropAggregate.withoutCereals.share}% leaving cereals aside. The distance to the target therefore depends mostly on whether cereals are counted, which the published update must make explicit.` : '',
      `FAO's food balances for the UAE are largely imputed or estimated (${Object.entries(fbsFlags).map(([flag, count]) => `${count} values flagged ${flag}`).join(', ')}), so levels are indicative; the direction of travel is more reliable than any single value.`,
    ].filter(Boolean),
    method: 'Self-sufficiency ratio = production / domestic supply quantity (FAOSTAT food balances, thousand tonnes). Where FAOSTAT records no production row, production is taken as zero.',
    evidence: evidenceLine('production'),
    options: [
      { action: 'Set and publish measurable local-production targets per basket item', why: 'The published aims ("enhance local production") carry no numeric target, so progress cannot be judged against intent.', watch: 'Targets published with baseline year' },
      { action: 'Track the water cost of new production capacity', why: 'Gains are in water-intensive protected horticulture and dairy; expansion and water strategy need a common metric.', watch: 'Water use per tonne for new projects' },
    ],
  },
  preparedness: {
    status: 'exposed',
    statusLabel: 'High structural exposure (reserve levels not public)',
    goals: ['nfss2051:g3', 'dubaifss:d5'],
    analysis: [
      cereal ? `Cereal import dependency stands at ${cereal.value}% (${cereal.period}): virtually every tonne of grain is imported.` : '',
      importBill ? `The food import bill is about ${importBill.value}% of merchandise exports (${importBill.period}), so the constraint is not the ability to pay; it is physical access when trade routes or origins are disrupted.` : '',
      cpiLatest ? `Food price inflation was ${cpiLatest.value}% in ${cpiLatest.label}, the latest month FAOSTAT publishes for the UAE; it is the affordability signal to watch during a supply shock.` : '',
      'With ability to pay strong and import dependence near total, reserve depth (days of cover per staple) becomes the decisive preparedness indicator. It is not published, so this pillar can be assessed only on exposure, not on readiness.',
    ].filter(Boolean),
    method: 'FAOSTAT suite of food security indicators (3-year averages) and FAOSTAT consumer price indices.',
    evidence: evidenceLine('preparedness'),
    options: [
      { action: 'Agree a confidential reserve-cover indicator with the government', why: 'Exposure is near total for cereals; without reserve data, readiness cannot be assessed.', watch: 'Days of cover per staple (restricted reporting)' },
      { action: 'Run a disruption stress test on the concentrated categories', why: 'Concentrated categories lose most of their supply if one origin fails.', watch: 'Months of supply covered by alternative origins' },
    ],
  },
  waste: {
    status: 'baseline-pending',
    statusLabel: 'Baseline pending - progress not measurable',
    goals: ['nema:n1', 'dubaifss:d3'],
    analysis: [
      'The national target is to halve food loss and waste by 2030 (press-reported; official document pending). No baseline has been published, so neither the starting level nor progress can be measured.',
      'The national baseline study was due to report in the first half of 2026; no published results were found. FAO\'s modelled estimate of retail losses for the UAE is a fixed parameter rather than a measurement and is not used here.',
    ],
    method: 'Target from the register; no outcome series is available.',
    evidence: evidenceLine('waste'),
    options: [
      { action: 'Obtain the baseline study results and adopt them as the tracking baseline', why: 'Without a baseline, a 50% reduction target cannot be monitored.', watch: 'Baseline published; first progress measurement' },
    ],
  },
  safety: {
    status: 'no-outcome-data',
    statusLabel: 'No comparable outcome indicator - implementation only',
    goals: ['dubaifss:d4'],
    analysis: [
      'International datasets carry no comparable food-safety outcome measure for the UAE, so this pillar is tracked through implementation only.',
      obesity || anaemia ? `Nutrition outcomes bear on the "quality" side of the aim. ${[obesity && `Adult obesity is ${obesity.value}% (${obesity.period}), ${versusWorld(obesity, worldOf('21042'))}`, anaemia && `anaemia among women of reproductive age is ${anaemia.value}% (${anaemia.period}), ${versusWorld(anaemia, worldOf('21043'))}`].filter(Boolean).join('; ')}.${obesity && worldOf('21042') && obesity.numeric / worldOf('21042').numeric >= 1.5 ? ' The obesity burden is the clearest quality gap, and supply-side goals do not address it.' : ''}` : '',
    ].filter(Boolean),
    method: 'FAOSTAT suite of food security indicators.',
    evidence: evidenceLine('safety'),
    options: [
      { action: 'Add nutrition outcomes to the strategy indicator set', why: obesity ? `Adult obesity at ${obesity.value}% is ${versusWorld(obesity, worldOf('21042'))}; the published goals carry no nutrition outcome.` : 'Quality outcomes are not tracked.', watch: 'Obesity and anaemia trends against a stated target' },
    ],
  },
};
for (const [pillar, finding] of Object.entries(findings)) finding.owner = owner(pillar);

// ---------- 7. Headline proxy: the four dimensions the Global Food Security Index used, no composite ----------
const headline = {
  note: 'Independent proxy built from official FAO data along the four dimensions of the Global Food Security Index. It is not the index, and no composite score is computed: weighting choices would be arbitrary without the official methodology.',
  dimensions: [
    { id: 'affordability', name: 'Affordability', items: [cpiLatest && { label: 'Food price inflation', value: `${cpiLatest.value}%`, period: cpiLatest.label }, insecurity && { label: 'Moderate or severe food insecurity', value: `${insecurity.value}%`, period: insecurity.period }, importBill && { label: 'Food imports, share of merchandise exports', value: `${importBill.value}%`, period: importBill.period }].filter(Boolean) },
    { id: 'availability', name: 'Availability', items: [cereal && { label: 'Cereal import dependency', value: `${cereal.value}%`, period: cereal.period }, { label: 'Basket categories meeting the 3-source benchmark', value: `${meets.length} of ${categories.length}`, period: latestTradeYear }].filter(Boolean) },
    { id: 'quality', name: 'Quality and safety', items: [indicator('21013') && { label: 'Average protein supply', value: `${indicator('21013').value} g/person/day`, period: indicator('21013').period }, obesity && { label: 'Adult obesity', value: `${obesity.value}%`, period: obesity.period }, anaemia && { label: 'Anaemia, women 15-49', value: `${anaemia.value}%`, period: anaemia.period }].filter(Boolean) },
    { id: 'resilience', name: 'Resilience', items: [{ label: 'Concentrated basket categories (<2 effective suppliers)', value: String(concentrated.length), period: latestTradeYear }, { label: 'Reserve cover', value: 'Not public', period: '' }].filter(Boolean) },
  ],
};

// ---------- 8. Alerts: sourced events + computed exposure and price signals ----------
const alertLog = JSON.parse(read('data/strategy/uae-alerts.json'));
const allRecords = new Map(JSON.parse(read('data/gcc-yemen-measures.json')).records.map((record) => [record.id, record]));
const commodities = JSON.parse(read('data/forecasts/context.json')).commodities;
const today = new Date().toISOString().slice(0, 10);
const crisisDay = Math.floor((new Date(`${today}T00:00:00Z`) - new Date(`${alertLog.crisis.start}T00:00:00Z`)) / DAY) + 1;
const monthShift = (key, n) => { const d = new Date(`${key}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
const RULES = alertLog.priceRules;
function priceSignal(name) {
  const item = commodities.items[name];
  if (!item) return null;
  const keys = Object.keys(item.monthly).sort(), latest = keys.at(-1);
  const change = (from) => item.monthly[from] ? round((item.monthly[latest] / item.monthly[from] - 1) * 100, 1) : null;
  const signal = { benchmark: name, unit: item.unit, latest, latestLabel: monthLabel(latest), value: item.monthly[latest], sinceBaseline: change(RULES.baselineMonth), threeMonth: change(monthShift(latest, -3)), twelveMonth: change(monthShift(latest, -12)), baselineLabel: monthLabel(RULES.baselineMonth) };
  signal.level = signal.threeMonth >= RULES.high.threeMonth || signal.sinceBaseline >= RULES.high.sinceBaseline ? 'high'
    : signal.threeMonth >= RULES.watch.threeMonth || signal.sinceBaseline >= RULES.watch.sinceBaseline || signal.twelveMonth >= RULES.watch.twelveMonth ? 'watch' : 'none';
  return signal;
}
const BENCHMARK_NAME = { 'Sugar, world': 'sugar', 'Wheat, US HRW': 'wheat (US hard red winter)', 'Rice, Thai 5%': 'rice (Thai 5% broken)', DAP: 'DAP fertilizer', Urea: 'urea', Maize: 'maize', Soybeans: 'soybean', 'Palm oil': 'palm oil' };
const LEVEL_RANK = { clear: 0, none: 0, watch: 1, high: 2, critical: 3 };
const categoryById = Object.fromEntries(categories.map((c) => [c.id, c]));
// Overland reach: share of basket tonnes supplied by neighbours reachable by road (Saudi Arabia, Oman).
const OVERLAND = ['Saudi Arabia', 'Oman'];
const overlandRows = categories.map((c) => {
  const codes = new Set(c.codes.map(String));
  const rows = trade.rows.filter((row) => codes.has(row.item_code) && row.year === c.latest && Number(row.qty_t) > 0);
  const total = rows.reduce((sum, row) => sum + Number(row.qty_t), 0);
  const land = rows.filter((row) => OVERLAND.includes(row.partner)).reduce((sum, row) => sum + Number(row.qty_t), 0);
  return { id: c.id, name: c.name, share: round(land / total * 100, 1), totalT: Math.round(total) };
});
const overlandTotal = round(overlandRows.reduce((sum, row) => sum + row.share * row.totalT / 100, 0) / overlandRows.reduce((sum, row) => sum + row.totalT, 0) * 100, 1);
const sources = Object.fromEntries(Object.entries(alertLog.sources).map(([key, source]) => [key, { ...source, url: source.recordId ? allRecords.get(source.recordId)?.source || '' : source.url }]));
const alerts = alertLog.alerts.map((alert) => {
  const price = alert.benchmark ? priceSignal(alert.benchmark) : null;
  const exposure = (alert.categories || []).map((id) => {
    const c = categoryById[id], y = c.years[c.latest];
    const country = alert.supplierCountry ? y.leading.find((item) => item.partner === alert.supplierCountry) : null;
    return { id, name: c.name, year: c.latest, effective: y.effective, status: c.status, top: y.top, supplierShare: country ? country.share : null, supplierCountry: alert.supplierCountry || null, leading: y.leading.slice(0, 4) };
  });
  const so = [];
  exposure.forEach((e) => {
    if (e.supplierShare !== null && e.supplierCountry === e.top.partner) so.push(`${e.supplierCountry} supplied ${pct(e.supplierShare)} of the UAE's imports of ${e.name.toLowerCase()} in ${e.year}, with ${e.effective} effective suppliers in all.`);
    else if (e.supplierShare !== null) so.push(`${e.supplierCountry} supplied ${pct(e.supplierShare)} of the UAE's imports of ${e.name.toLowerCase()} in ${e.year}; the leading origin was ${e.top.partner} (${pct(e.top.share)}).`);
    else so.push(`The leading origin of the UAE's imports of ${e.name.toLowerCase()} in ${e.year} was ${e.top.partner} (${pct(e.top.share)}), with ${e.effective} effective suppliers in all.`);
  });
  if (price) so.push(`The world ${BENCHMARK_NAME[price.benchmark] || price.benchmark} benchmark stood at ${price.value} ${price.unit} in ${price.latestLabel}: ${price.sinceBaseline >= 0 ? 'up' : 'down'} ${pct(Math.abs(price.sinceBaseline))} since ${price.baselineLabel} and ${price.twelveMonth >= 0 ? 'up' : 'down'} ${pct(Math.abs(price.twelveMonth))} on a year earlier.`);
  if (alert.id === 'hormuz') so.push(`Only ${pct(overlandTotal)} of basket import tonnes came from neighbours reachable by road (${list(OVERLAND)}) in ${latestTradeYear}; the rest normally arrived by sea, most of it through the strait.`);
  return { ...alert, price, exposure, exposureText: so, sources: alert.facts.flatMap((fact) => fact.src).filter((key, i, all) => all.indexOf(key) === i).map((key) => ({ key, ...sources[key] })) };
}).sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]);
const sugarSignal = priceSignal('Sugar, world');
const situation = {
  day: crisisDay, start: alertLog.crisis.start, startLabel: dayLabel(alertLog.crisis.start), overlandShare: overlandTotal, overland: overlandRows,
  kpis: [
    ...alertLog.crisis.kpis.map((kpi) => ({ ...kpi, source: sources[kpi.src] })),
    { label: 'Staple import tonnes from road-reachable neighbours', value: pct(overlandTotal), period: `FAOSTAT trade, ${latestTradeYear}`, computed: true },
    sugarSignal && { label: 'World sugar price since the crisis began', value: `${sugarSignal.sinceBaseline >= 0 ? '+' : ''}${pct(sugarSignal.sinceBaseline)}`, period: `${sugarSignal.baselineLabel} to ${sugarSignal.latestLabel}, World Bank`, computed: true },
  ].filter(Boolean),
};

// ---------- 9. Commitments: from announcement to results ----------
const STAGES = [
  { id: 'preparatory', label: 'Preparatory', test: (text) => EVENT.test(text) || /\b(training|workshops?|awareness|campaigns?)\b/i.test(text) },
  { id: 'results', label: 'Results reported', test: (text) => /\b(achiev\w*|reached|surpass\w*|record (output|production|harvest|high)|produced \d|harvested|% of (its|the) target|reduced \w+ by \d|cut \w+ by \d)\b/i.test(text) },
  { id: 'operational', label: 'Operational', test: (text) => /\b(opened|inaugurat\w*|commission\w*|began (operations|production|supplies|shipments|exports)|started (operations|production)|operational|delivered|first shipment|commenced|now (supplies|produces|operates))\b/i.test(text) },
  { id: 'financed', label: 'Financed', test: (text) => MONEY.test(text) || /\b(fund(ing|ed)?|financ\w*|budget|allocat\w*)\b/i.test(text) },
  { id: 'adopted', label: 'Agreed or adopted', test: (text) => /\b(approv\w*|adopt\w*|issued|decree|resolution|law|regulations?|enacted|mandat\w*|signed|memorandum|agreements?)\b/i.test(text) },
];
// Statements of intent ("will", "plans to", an MoU "to explore") never count as operations or results.
const INTENT = /\b(will|plans? to|aims? to|to explore|intends? to|proposed|set to|expected to|memorand\w*|MoUs?)\b/i;
const stageOf = (record) => { const text = lead(record); const found = (STAGES.find((stage) => stage.test(text)) || { id: 'announced' }).id; return INTENT.test(text) && ['operational', 'results', 'financed'].includes(found) ? (STAGES.find((stage) => stage.id === 'adopted').test(text) ? 'adopted' : 'announced') : found; };
const STAGE_ORDER = ['preparatory', 'announced', 'adopted', 'financed', 'operational', 'results'];
const STAGE_LABEL = { preparatory: 'Preparatory', announced: 'Announced', adopted: 'Agreed or adopted', financed: 'Financed', operational: 'Operational', results: 'Results reported' };
const commitments = (register.commitments || []).map((commitment) => {
  const pattern = commitment.pattern ? new RegExp(`\\b(${commitment.pattern})`, 'i') : PILLAR_PATTERNS[commitment.pillar];
  const rows = records.filter((record) => record.date >= commitment.since && pattern.test(lead(record))).sort((a, b) => b.date.localeCompare(a.date));
  const stages = Object.fromEntries(STAGE_ORDER.map((id) => [id, 0]));
  rows.forEach((record) => { stages[stageOf(record)] += 1; });
  const age = (record) => (throughMs - new Date(`${record.date}T00:00:00Z`).getTime()) / DAY;
  const delivering = rows.filter((record) => ['operational', 'results'].includes(stageOf(record)));
  const moving = rows.filter((record) => ['adopted', 'financed'].includes(stageOf(record)));
  const outside = (commitment.evidenceOutsideRecord || []).filter((item) => ['operational', 'results'].includes(item.stage) && age(item) < 183);
  const recentDelivery = [...delivering.filter((record) => age(record) < 183), ...outside];
  const recentMoving = moving.filter((record) => age(record) < 183);
  const status = !rows.length ? 'no-action' : recentDelivery.length ? 'delivering' : recentMoving.length ? 'moving' : rows.some((record) => age(record) < 183) ? 'announcements' : 'stalled';
  const advanced = rows.filter((record) => STAGE_ORDER.indexOf(stageOf(record)) >= 2).length;
  // Prefer a measure whose title fits this commitment and no other pillar (a composting plant at a dairy
  // farm is waste, not local production); fall back to the most recent match.
  const others = Object.entries(PILLAR_PATTERNS).filter(([key]) => key !== commitment.pillar).map(([, re]) => re);
  const fits = (record) => pattern.test(record.title) && !others.some((re) => re.test(record.title));
  const pick = (list) => { const record = list.find(fits) || list[0]; return record ? { id: record.id, date: record.date, title: record.title, source: record.source, stage: STAGE_LABEL[stageOf(record)] } : null; };
  const statusText = {
    delivering: `Delivering: ${recentDelivery.length} ${recentDelivery.length === 1 ? 'measure' : 'measures'} in the last six months ${recentDelivery.length === 1 ? 'shows' : 'show'} operations or reported results${outside.length ? ' (including evidence from outside the record)' : ''}.`,
    moving: 'Moving: agreements, rules or financing in the last six months, but no operations or results reported yet.',
    announcements: 'Announcements only in the last six months: no agreement, financing, operation or result recorded.',
    stalled: `Stalled: no measure recorded in the last six months; the latest dates from ${rows[0] ? dayLabel(rows[0].date) : '-'}.`,
    'no-action': 'No implementing measure found in the record.',
  }[status];
  return { ...commitment, pattern: undefined, outsideEvidence: commitment.evidenceOutsideRecord || [], measures: rows.length, stages, status, statusText, followThrough: rows.length ? round(advanced / rows.length * 100, 0) : null, latestDelivery: pick(delivering), latestStep: pick(rows) };
});

// ---------- 11. Government use: Arabic text, supplier lists for the planner, decision note ----------
// Arabic is generated from templates with Western digits, so every number stays traceable; it is a draft
// translation for native-speaker review.
const COUNTRY_AR = { Brazil: 'البرازيل', India: 'الهند', 'Russian Federation': 'روسيا', Australia: 'أستراليا', 'Saudi Arabia': 'السعودية', Oman: 'عُمان', Thailand: 'تايلاند', Pakistan: 'باكستان', 'Viet Nam': 'فيتنام', Canada: 'كندا', Romania: 'رومانيا', 'United States of America': 'الولايات المتحدة', Ukraine: 'أوكرانيا', 'Türkiye': 'تركيا', Argentina: 'الأرجنتين', Indonesia: 'إندونيسيا', Malaysia: 'ماليزيا', 'New Zealand': 'نيوزيلندا', Egypt: 'مصر', 'South Africa': 'جنوب أفريقيا', Kazakhstan: 'كازاخستان', France: 'فرنسا', Germany: 'ألمانيا', China: 'الصين', 'Netherlands (Kingdom of the)': 'هولندا', Spain: 'إسبانيا', Italy: 'إيطاليا', Poland: 'بولندا', Belgium: 'بلجيكا', Ireland: 'أيرلندا', 'United Kingdom of Great Britain and Northern Ireland': 'المملكة المتحدة', 'Iran (Islamic Republic of)': 'إيران', Kenya: 'كينيا', Ethiopia: 'إثيوبيا', Sudan: 'السودان', Jordan: 'الأردن', Lebanon: 'لبنان', Yemen: 'اليمن', Qatar: 'قطر', Kuwait: 'الكويت', Bahrain: 'البحرين', Philippines: 'الفلبين', 'Sri Lanka': 'سريلانكا', Bangladesh: 'بنغلاديش', Myanmar: 'ميانمار', Mexico: 'المكسيك', Chile: 'تشيلي', Uruguay: 'الأوروغواي', Paraguay: 'باراغواي', Colombia: 'كولومبيا', Ecuador: 'الإكوادور', Peru: 'بيرو', Morocco: 'المغرب', Tunisia: 'تونس', Japan: 'اليابان', Denmark: 'الدنمارك', Bulgaria: 'بلغاريا', Hungary: 'المجر', Serbia: 'صربيا', 'Republic of Moldova': 'مولدوفا', Lithuania: 'ليتوانيا', Latvia: 'لاتفيا', Belarus: 'بيلاروس', Georgia: 'جورجيا', Uzbekistan: 'أوزبكستان', Singapore: 'سنغافورة', 'United Republic of Tanzania': 'تنزانيا', Uganda: 'أوغندا', 'Syrian Arab Republic': 'سوريا', Iraq: 'العراق', Austria: 'النمسا', Switzerland: 'سويسرا', Greece: 'اليونان', Portugal: 'البرتغال', Sweden: 'السويد', Norway: 'النرويج', Finland: 'فنلندا', Estonia: 'إستونيا', Croatia: 'كرواتيا', Slovenia: 'سلوفينيا', Czechia: 'التشيك', Slovakia: 'سلوفاكيا', Mongolia: 'منغوليا', 'Republic of Korea': 'كوريا الجنوبية', Cambodia: 'كمبوديا', Somalia: 'الصومال', Djibouti: 'جيبوتي', Eritrea: 'إريتريا', Nigeria: 'نيجيريا', Ghana: 'غانا', "Côte d'Ivoire": 'ساحل العاج', Cameroon: 'الكاميرون', 'Russian Federation ': 'روسيا' };
const BASKET_AR = { wheat: 'القمح', rice: 'الأرز', maize: 'الذرة', barley: 'الشعير', sugar: 'السكر', vegoil: 'الزيوت النباتية', chicken: 'لحم الدجاج', beef: 'لحم البقر', smallrum: 'لحم الضأن والماعز', milkpowder: 'الحليب المجفف', eggs: 'البيض', pulses: 'البقوليات', potatoes: 'البطاطس', onions: 'البصل', fruit: 'الفواكه', soymeal: 'كسب فول الصويا', rapeseed: 'بذور اللفت (الكانولا)' };
const MONTH_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const monthAr = (key) => `${MONTH_AR[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
const dayAr = (iso) => `${Number(iso.slice(8, 10))} ${MONTH_AR[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const BENCHMARK_AR = { 'Sugar, world': 'السكر', 'Wheat, US HRW': 'القمح (الأمريكي الأحمر الشتوي الصلب)', 'Rice, Thai 5%': 'الأرز (التايلندي 5% كسر)', DAP: 'سماد فوسفات ثنائي الأمونيوم' };
const countryAr = (name) => COUNTRY_AR[name] || name;
const UNIT_AR = { '$/mt': 'دولار للطن', '$/kg': 'دولار للكيلوغرام', '$/bbl': 'دولار للبرميل' };
const listAr = (items) => items.length <= 1 ? items.join('') : `${items.slice(0, -1).join('، ')} و${items.at(-1)}`;
categories.forEach((c) => { c.name_ar = BASKET_AR[c.id] || c.name; });
const exposureAr = (alert) => {
  const out = [];
  alert.exposure.forEach((e) => {
    const name = BASKET_AR[e.id];
    if (e.supplierShare !== null && e.supplierCountry === e.top.partner) out.push(`وفّرت ${countryAr(e.supplierCountry)} ${pct(e.supplierShare)} من واردات الإمارات من ${name} في ${e.year}، ويبلغ العدد الفعلي للموردين ${e.effective}.`);
    else if (e.supplierShare !== null) out.push(`وفّرت ${countryAr(e.supplierCountry)} ${pct(e.supplierShare)} من واردات الإمارات من ${name} في ${e.year}، فيما كان المصدر الرئيسي ${countryAr(e.top.partner)} (${pct(e.top.share)}).`);
    else out.push(`كان المصدر الرئيسي لواردات الإمارات من ${name} في ${e.year} هو ${countryAr(e.top.partner)} (${pct(e.top.share)})، ويبلغ العدد الفعلي للموردين ${e.effective}.`);
  });
  if (alert.price) out.push(`بلغ المؤشر العالمي لسعر ${BENCHMARK_AR[alert.price.benchmark] || alert.price.benchmark} ${alert.price.value} ${UNIT_AR[alert.price.unit] || alert.price.unit} في ${monthAr(alert.price.latest)}: ${alert.price.sinceBaseline >= 0 ? 'بارتفاع' : 'بانخفاض'} ${pct(Math.abs(alert.price.sinceBaseline))} منذ ${monthAr(RULES.baselineMonth)}، و${alert.price.twelveMonth >= 0 ? 'بارتفاع' : 'بانخفاض'} ${pct(Math.abs(alert.price.twelveMonth))} مقارنة بالعام السابق.`);
  if (alert.id === 'hormuz') out.push(`جاءت ${pct(overlandTotal)} فقط من أطنان واردات السلة في ${latestTradeYear} من دول مجاورة يمكن الوصول إليها براً (السعودية وعُمان)، ووصل الباقي عادةً بحراً، ومعظمه عبر المضيق.`);
  return out;
};
const ENTITIES = alertLog.entities;
const TIMEFRAME = { critical: { en: 'This week', ar: 'هذا الأسبوع' }, high: { en: 'Within two weeks', ar: 'خلال أسبوعين' }, watch: { en: 'This month', ar: 'هذا الشهر' }, clear: { en: 'Routine monitoring', ar: 'متابعة اعتيادية' } };
alerts.forEach((alert) => {
  alert.exposureText_ar = exposureAr(alert);
  alert.leadEntity = ENTITIES[alert.lead];
  alert.alsoEntities = (alert.also || []).map((key) => ENTITIES[key]);
  alert.timeframe = TIMEFRAME[alert.level];
  alert.sources.forEach((source) => { source.type_ar = { official: 'رسمي', press: 'صحافة', tracker: 'أداة تتبع', reference: 'مرجع', record: 'سجل السياسات' }[source.type] || source.type; });
});
// Full supplier list per category (latest year) for the "what if we lose a supplier?" planner.
categories.forEach((c) => {
  const codes = new Set(c.codes.map(String));
  const byPartner = new Map();
  trade.rows.filter((row) => codes.has(row.item_code) && row.year === c.latest && Number(row.qty_t) > 0).forEach((row) => byPartner.set(row.partner, (byPartner.get(row.partner) || 0) + Number(row.qty_t)));
  const total = [...byPartner.values()].reduce((sum, value) => sum + value, 0);
  c.partners = [...byPartner.entries()].map(([partner, t]) => ({ partner, partner_ar: countryAr(partner), t: Math.round(t), share: round(t / total * 100, 2) })).sort((a, b) => b.t - a.t);
});
// The nine price-approved essential goods, mapped to basket categories (bread and wheat share one).
const essentials = [
  { id: 'wheat', en: 'Wheat and bread', ar: 'القمح والخبز' }, { id: 'rice', en: 'Rice', ar: 'الأرز' }, { id: 'sugar', en: 'Sugar', ar: 'السكر' },
  { id: 'vegoil', en: 'Cooking oil', ar: 'زيت الطهي' }, { id: 'chicken', en: 'Poultry', ar: 'الدواجن' }, { id: 'eggs', en: 'Eggs', ar: 'البيض' },
  { id: 'milkpowder', en: 'Dairy (milk powder)', ar: 'الألبان (الحليب المجفف)' }, { id: 'pulses', en: 'Legumes', ar: 'البقوليات' },
];
const STATUS_AR = {
  delivering: (c) => `تنفيذ فعلي: ${c.recentDelivery === 1 ? 'إجراء واحد يُظهر' : `${c.recentDelivery} إجراءات تُظهر`} تشغيلاً أو نتائج معلنة خلال الأشهر الستة الماضية${c.outsideEvidence.length ? ' (بما في ذلك أدلة من خارج السجل)' : ''}.`,
  moving: () => 'في طور التقدم: اتفاقيات أو قواعد أو تمويل خلال الأشهر الستة الماضية، دون تشغيل أو نتائج معلنة بعد.',
  announcements: () => 'إعلانات فقط خلال الأشهر الستة الماضية: لم يُسجَّل اتفاق أو تمويل أو تشغيل أو نتائج.',
  stalled: (c) => `متوقف: لم يُسجَّل أي إجراء خلال الأشهر الستة الماضية؛ آخر إجراء بتاريخ ${c.latestStep ? dayAr(c.latestStep.date) : '-'}.`,
  'no-action': () => 'لم يُعثر على إجراء تنفيذي في السجل.',
};
commitments.forEach((c) => { c.recentDelivery = Number((c.statusText.match(/^Delivering: (\d+)/) || [])[1] || 0); c.statusText_ar = STATUS_AR[c.status](c); });

const decisionAlerts = alerts.filter((alert) => alert.level !== 'clear' && !/^No (new )?decision/.test(alert.decision));
const priceList = ['Sugar, world', 'Wheat, US HRW', 'Rice, Thai 5%'].map((name) => priceSignal(name)).filter(Boolean);
const sourcesUsed = [...new Map(alerts.flatMap((alert) => alert.sources).map((source) => [source.url, source])).values()];
const deliveringNames = (lang) => commitments.filter((c) => c.status === 'delivering').map((c) => lang === 'ar' ? c.name_ar : nameIn(c));
const movingNames = (lang) => commitments.filter((c) => c.status === 'moving').map((c) => lang === 'ar' ? c.name_ar : nameIn(c));
const decisionNote = {
  en: {
    dir: 'ltr',
    title: 'UAE food security: decision note',
    subtitle: `${monthLabel(today.slice(0, 7))} · draft for decision support`,
    date: today,
    headings: { situation: 'Situation', decisions: 'Decisions required', commitments: 'Are commitments being delivered?', support: 'Technical support available', columns: ['Issue', 'Decision required', 'Suggested lead', 'Timeframe', 'Indicator to watch'] },
    situation: [
      `Day ${crisisDay} of the Strait of Hormuz disruption, which began on ${dayLabel(alertLog.crisis.start)}. About 70% of Gulf food imports normally pass through the strait; cargo is being rerouted through Fujairah, Khor Fakkan and Sohar at higher cost. Only ${pct(overlandTotal)} of the UAE's staple imports came from neighbours reachable by road in ${latestTradeYear}.`,
      `Food inflation in Dubai reached 8.05% in September 2026. World prices have risen since ${monthLabel(RULES.baselineMonth)}: ${list(priceList.map((s) => `${(BENCHMARK_NAME[s.benchmark] || s.benchmark).replace(/ \(.*\)$/, '')} ${s.sinceBaseline >= 0 ? '+' : ''}${s.sinceBaseline}%`))}. The government stated strategic reserves of up to six months in March; replenishment through bypass routes is now the decisive unknown.`,
    ],
    decisions: decisionAlerts.map((alert) => ({ id: alert.id, level: alert.level, issue: `${alert.title}. ${alert.exposureText[0] || ''}`, decision: alert.decision, lead: alert.leadEntity.en, also: alert.alsoEntities.map((e) => e.en), timeframe: alert.timeframe.en, indicator: alert.watch })),
    leadNote: alertLog.leadNote.en,
    commitments: `${deliveringNames('en').length ? `${cap(list(deliveringNames('en')))} show delivery in the last six months.` : 'No commitment shows delivery in the last six months.'}${movingNames('en').length ? ` ${cap(list(movingNames('en')))} ${movingNames('en').length === 1 ? 'is' : 'are'} moving: agreements or financing, but no operations or results reported yet.` : ''}`,
    support: ['Market and price monitoring methods and indicators for staples under supply stress.', 'Trade-policy analysis of supplier-country restrictions and the UAE\'s exposure to them.', 'Food loss and waste measurement aligned with SDG 12.3, to give the 2030 target a baseline.', 'Food balance and data-system support, so that strategy indicators can be tracked between crises.'],
    supportNote: 'International organisations, including FAO, can provide this support on request.',
    disclaimer: 'Draft analysis from public data for decision support; not an official assessment. Figures should be confirmed with the responsible authorities.',
  },
  ar: {
    dir: 'rtl',
    title: 'الأمن الغذائي في دولة الإمارات: مذكرة قرار',
    subtitle: `${monthAr(today.slice(0, 7))} · مسودة لدعم القرار`,
    date: today,
    headings: { situation: 'الوضع الراهن', decisions: 'القرارات المطلوبة', commitments: 'هل يجري تنفيذ الالتزامات؟', support: 'الدعم الفني المتاح', columns: ['المسألة', 'القرار المطلوب', 'الجهة المقترحة للقيادة', 'الإطار الزمني', 'مؤشر المتابعة'] },
    situation: [
      `اليوم ${crisisDay} من اضطراب مضيق هرمز الذي بدأ في ${dayAr(alertLog.crisis.start)}. يمر نحو 70% من واردات الخليج الغذائية عادةً عبر المضيق، ويجري تحويل الشحنات عبر الفجيرة وخورفكان وصحار بتكلفة أعلى. ولم تأتِ سوى ${pct(overlandTotal)} من واردات الإمارات من السلع الأساسية في ${latestTradeYear} من دول مجاورة يمكن الوصول إليها براً.`,
      `بلغ تضخم أسعار الغذاء في دبي 8.05% في سبتمبر 2026. وارتفعت الأسعار العالمية منذ ${monthAr(RULES.baselineMonth)}: ${listAr(priceList.map((s) => `${(BENCHMARK_AR[s.benchmark] || s.benchmark).replace(/ \(.*\)$/, '')} ${s.sinceBaseline >= 0 ? '+' : ''}${s.sinceBaseline}%`))}. وأعلنت الحكومة في مارس أن المخزون الاستراتيجي يكفي لمدة تصل إلى ستة أشهر، ويبقى تجديده عبر طرق الالتفاف العامل الحاسم غير المعروف.`,
    ],
    decisions: decisionAlerts.map((alert) => ({ id: alert.id, level: alert.level, issue: `${alert.ar.title}. ${alert.exposureText_ar[0] || ''}`, decision: alert.ar.decision, lead: alert.leadEntity.ar, also: alert.alsoEntities.map((e) => e.ar), timeframe: alert.timeframe.ar, indicator: alert.ar.watch })),
    leadNote: alertLog.leadNote.ar,
    commitments: `${deliveringNames('ar').length ? `تُظهر الالتزامات التالية تنفيذاً فعلياً خلال الأشهر الستة الماضية: ${listAr(deliveringNames('ar'))}.` : 'لا يُظهر أي التزام تنفيذاً فعلياً خلال الأشهر الستة الماضية.'}${movingNames('ar').length ? ` وفي طور التقدم (اتفاقيات أو تمويل دون تشغيل أو نتائج بعد): ${listAr(movingNames('ar'))}.` : ''}`,
    support: ['أساليب ومؤشرات لرصد الأسواق والأسعار للسلع الأساسية تحت ضغط الإمداد.', 'تحليل سياسات التجارة لقيود الدول المورّدة ومدى تعرّض الإمارات لها.', 'قياس الفاقد والهدر الغذائي وفق هدف التنمية المستدامة 12.3، لوضع خط أساس لهدف 2030.', 'دعم موازين الأغذية وأنظمة البيانات لتتبع مؤشرات الاستراتيجية بين الأزمات.'],
    supportNote: 'يمكن للمنظمات الدولية، ومنها منظمة الأغذية والزراعة للأمم المتحدة (الفاو)، تقديم هذا الدعم عند الطلب.',
    disclaimer: 'تحليل أولي مستند إلى بيانات عامة لدعم القرار، وليس تقييماً رسمياً؛ ينبغي تأكيد الأرقام مع الجهات المختصة. النص العربي ترجمة أولية تحتاج إلى مراجعة لغوية.',
  },
  sources: sourcesUsed.map((source) => ({ label: source.label, url: source.url, type: source.type })),
};

const output = {
  generatedAt: new Date().toISOString().slice(0, 10),
  essentials,
  decisionNote,
  kpisAr: alertLog.crisis.kpis.map((kpi) => kpi.ar),
  situation,
  alerts,
  commitments,
  status: register.status,
  sources: { trade: trade.meta, balances: fbs.meta, foodSecurity: fsx.meta, records: `Monitored policy record (summaries of public reporting), data through ${through}`, prices: 'FAOSTAT consumer price indices (CP)' },
  benchmark: BENCHMARK,
  basketNote: basket.note,
  diversification: { latestYear: latestTradeYear, categories },
  production: { items: balance, flags: fbsFlags, cropAggregate },
  signals: register.signals || [],
  indicators,
  prices: cpiLatest,
  implementation,
  findings,
  headline,
};
fs.mkdirSync(path.join(ROOT, 'data/strategy'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data/strategy/uae-tracker.json'), JSON.stringify(output));
console.log(`UAE tracker written: ${categories.length} basket categories to ${latestTradeYear} (${meets.length} meet, ${partly.length} partly, ${concentrated.length} concentrated), ${balance.length} balance items, ${indicators.filter((i) => i.latest).length} indicators, ${records.length} UAE records with sources.`);
