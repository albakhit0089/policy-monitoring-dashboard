// Narrative engine: turns computed signals from the policy record and FAOSTAT indicators into an
// FAO-style technical brief. Pure module (no DOM) so the same code runs in the browser and in tests.
//
// Rules the engine keeps:
// - every number in the prose passes through the Writer, which records it, so tests can trace it to the data;
// - every measure named in the text is a cited record with a source link, listed again in the annex;
// - counts support a statement but never open one; interpretation stays measured ("suggests", "is consistent with").
import { approachesOf, examples } from "./policy-analysis.js?v=pi-20261113";
import { cpiSummary, dietSummary } from "./food-analysis.js?v=pi-20261113";

export const COUNTRIES = ["Bahrain", "Kuwait", "Oman", "Qatar", "Saudi Arabia", "United Arab Emirates", "Yemen"];
const DAY = 864e5;

// Policy themes used to organise the analysis (each groups approaches from policy-analysis.js).
export const THEMES = [
  { key: "supply", label: "Food security, reserves and supply chains", short: "food supply and reserves", approaches: ["supply", "cooperation"], objective: "secure food supply against disruption to imports and shipping" },
  { key: "trade", label: "Trade and markets", short: "trade and markets", approaches: ["trade", "markets"], objective: "keep supplies flowing and keep prices in check" },
  { key: "producers", label: "Producer support and domestic production", short: "producer support", approaches: ["production", "finance", "livestock", "fisheries", "technology", "capacity"], objective: "raise domestic output and support producers" },
  { key: "water", label: "Water, climate and natural resources", short: "water and climate", approaches: ["water", "climate"], objective: "protect the water and land on which production depends" },
  { key: "safety", label: "Food safety and standards", short: "food safety", approaches: ["safety"], objective: "protect consumers and keep trade channels open" },
  { key: "social", label: "Nutrition and social protection", short: "nutrition and social protection", approaches: ["social"], objective: "protect access to food for vulnerable households" },
  { key: "governance", label: "Strategies, laws and institutions", short: "strategies and institutions", approaches: ["governance"], objective: "set the long-term framework for the sector" },
];
const THEME = Object.fromEntries(THEMES.map((theme) => [theme.key, theme]));

// Policy instruments, read from the first two sentences of each measure.
// `label` is the plural used in prose ("mainly through trade measures"), `one` the singular for a single measure.
// Order matters: the first match is the instrument, so a workshop or forum *about* regulation counts as a workshop.
export const INSTRUMENTS = [
  { key: "event", label: "forums and exhibitions", one: "forum or exhibition", pattern: /\b(forums?|conferences?|exhibitions?|festivals?|summits?|symposi\w*|expo|participat\w* in)\b/i },
  { key: "capacity", label: "training and awareness", one: "training or awareness activity", pattern: /\b(training|workshops?|capacity[- ]building|awareness|campaigns?|extension services?)\b/i },
  { key: "trade", label: "trade measures", one: "trade measure", pattern: /\b(imports?|exports?|tariffs?|customs|quotas?|re-export\w*)\b/i },
  { key: "regulation", label: "regulation and standards", one: "regulation", pattern: /\b(laws?|decrees?|regulations?|resolutions?|bann?(ed|ing)?|prohibit\w*|standards?|licen[cs]\w*|permits?|inspection\w*|enforce\w*|penalt\w*)\b/i },
  { key: "subsidy", label: "subsidies and financial support", one: "financial support measure", pattern: /\b(subsid\w*|grants?|loans?|credit lines?|financing|financial support|compensat\w*|insurance|incentives?)\b/i },
  { key: "investment", label: "investment and infrastructure", one: "investment", pattern: /\b(invest\w*|construct\w*|facilit(y|ies)|infrastructure|million|billion)\b/i },
  { key: "institutional", label: "strategies and institutional reform", one: "strategy or institutional reform", pattern: /\b(strateg(y|ies)|national plan|action plan|road ?map|establish\w*|reform\w*|restructur\w*|committee|council|framework)\b/i },
  { key: "agreement", label: "agreements and partnerships", one: "agreement", pattern: /\b(agreements?|agreed|memorand\w*|MoUs?|partnerships?|signed)\b/i },
];
// Market news rather than a policy decision ("is projected to grow", "recorded growth").
const NEWS = /\b(projected|is expected to|forecast|reported|recorded [a-z ]{0,20}growth|grew by|growth of|percent year-on-year|according to data|will participate|participat\w* in|showcas\w*|increased in value|declined? by|rose by)\b/i;
const INSTRUMENT = Object.fromEntries(INSTRUMENTS.map((item) => [item.key, item]));
const lead = (record) => String(record.description || record.title || "").split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
const instrumentCache = new WeakMap();
export function instrumentOf(record) {
  if (!instrumentCache.has(record)) instrumentCache.set(record, INSTRUMENTS.find((item) => item.pattern.test(lead(record)))?.key || "other");
  return instrumentCache.get(record);
}
export function themesOf(record) {
  const approaches = approachesOf(record);
  return THEMES.filter((theme) => theme.approaches.some((key) => approaches.includes(key))).map((theme) => theme.key);
}
const RESTRICTION = /\b(bann?(ed|ing|s)?|prohibit\w*|suspend\w*|halt\w*|restrict(s|ed|ing|ions?)?)\b/i;
const TRADE_FLOW = /\b(imports?|imported|importing|exports?|exported|exporting|shipments?|entry of|re-export\w*|trade in)\b/i;
export function restrictionOf(record) {
  return String(record.description || "").split(/(?<=[.!?])\s+/).slice(0, 3).find((part) => RESTRICTION.test(part) && TRADE_FLOW.test(part)) || null;
}
// Measures whose opening sentence is the restriction come first, so the cited title shows the restriction itself.
const restrictionRank = (record) => String(record.description || "").split(/(?<=[.!?])\s+/).findIndex((part) => RESTRICTION.test(part) && TRADE_FLOW.test(part));
const SHOCK = /\b(disrupt\w*|shortage\w*|rerout\w*|blockade|conflict|congestion|supply chain|shipping|hormuz|bab el-mandeb|red sea)\b/i;
const SEASON = /\b(ramadan|eid al|harvest season|harvest of|(date|fishing|rainy|summer|winter|planting|agricultural|growing) season|seasonal|khareef)\b/i;
const MONEY = /(\$|US\$|USD|SAR|SR|AED|QR|QAR|KD|KWD|BD|BHD|RO|OMR|YER)\s?[\d.,]+\s?(million|billion|bn)\b|[\d.,]+\s?(million|billion)\s?(US )?(dollars|riyals?|dirhams?|dinars?|rials?)/i;
// How much a measure matters for a briefing: frameworks, binding rules, restrictions and large sums first.
export function significance(record) {
  const instrument = instrumentOf(record);
  return (record.type === "framework" ? 4 : 0) + ({ regulation: 3, institutional: 3, trade: 2, subsidy: 2, investment: 2, agreement: 1, capacity: 0, event: -3, other: 0 })[instrument] + (restrictionOf(record) ? 2 : 0) + (MONEY.test(lead(record)) ? (/billion/i.test(lead(record)) ? 2 : 1) : 0) - (NEWS.test(lead(record)) ? 3 : 0) + (hasSource(record) ? 0 : -5);
}

// ---------- writer: numbers, dates and deterministic variety ----------
class Writer {
  constructor(seed) { this.facts = new Set(); this.seed = seed; this.cited = new Map(); }
  note(text) { String(text).match(/\d+(?:[.,]\d+)*/g)?.forEach((token) => this.facts.add(token.replace(/,/g, ""))); return text; }
  num(value, digits = 0) { return this.note(Number(value).toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits })); }
  pct(value, digits = 1) { return `${this.num(value, digits)}%`; }
  date(iso) { return this.note(new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })); }
  month(key) { return this.note(new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })); }
  pick(variants, salt = "") { let hash = 0; for (const char of `${this.seed}|${salt}`) hash = (hash * 31 + char.charCodeAt(0)) >>> 0; return variants[hash % variants.length]; }
  cite(record) { this.cited.set(record.id, record); return { cite: record.id }; }
}
const name = (country) => country === "United Arab Emirates" ? "the UAE" : country;
const Name = (country) => country === "United Arab Emirates" ? "The UAE" : country;
const list = (items) => items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
const article = (word) => /^[aeiou]/i.test(word) ? "an" : "a";
// Only real links count as sources (one record carries a headline in its source field).
function hasSource(record) { return /^https?:\/\//i.test(record.source || ""); }
// "the Ministry of ...", "the Environment Authority"; proper names ("Silal Group", "MEWA") stay as they are.
// Long joint entries ("Ministry A, Ministry B and partner C") are left out; the country names the actor instead.
const institutionName = (value) => !value || value.length > 70 ? "" : /^(Ministry|Ministries|Environment|National|General|Public|Supreme|Agricultural|Food|Municipality|Department|Directorate|Statistics|Higher|Central)\b/.test(value) ? `the ${value}` : value;
const p = (...parts) => ({ type: "p", parts: parts.flat().filter((part) => part !== "" && part !== null && part !== undefined) });
const bullets = (items) => ({ type: "list", items: items.map((item) => [item].flat()) });
const time = (iso) => new Date(`${iso}T00:00:00Z`).getTime();
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const monthKeyOf = (iso) => iso.slice(0, 7);
const countBy = (rows, keyFn) => { const counts = new Map(); rows.forEach((row) => [].concat(keyFn(row)).forEach((key) => key && counts.set(key, (counts.get(key) || 0) + 1))); return [...counts.entries()].sort((a, b) => b[1] - a[1]); };

// ---------- scope ----------
// scope: { kind: "monthly" | "country" | "regional" | "event", country, month, period, event }
export function resolveScope(records, scope, events = []) {
  const dated = records.filter((record) => record.date);
  const through = dated.map((record) => record.date).sort().at(-1);
  const inCountry = (record) => !scope.country || scope.country === "all" || record.country === scope.country;
  let from, to, label, previous = null, rows, event = null;
  if (scope.kind === "event") {
    event = events.find((item) => item.id === scope.event);
    if (!event) throw new Error(`Unknown event ${scope.event}`);
    const ids = new Set(event.recordIds || []);
    rows = dated.filter((record) => ids.has(record.id) || (record.tags || []).some((tag) => (event.tags || []).includes(tag)));
    from = rows.map((record) => record.date).sort()[0] || through; to = rows.map((record) => record.date).sort().at(-1) || through;
    label = event.name;
  } else {
    if (scope.kind === "monthly") {
      const month = scope.month || monthKeyOf(through);
      const [year, mon] = month.split("-").map(Number);
      from = `${month}-01`; to = isoDay(Date.UTC(year, mon, 0));
      previous = { from: isoDay(Date.UTC(year, mon - 2, 1)), to: isoDay(Date.UTC(year, mon - 1, 0)) };
    } else {
      const period = scope.period || "last12";
      if (/^\d{4}$/.test(period)) { from = `${period}-01-01`; to = `${period}-12-31`; previous = { from: `${Number(period) - 1}-01-01`, to: `${Number(period) - 1}-12-31` }; }
      else if (period === "all") { from = dated.map((record) => record.date).sort()[0]; to = through; }
      else { to = through; from = isoDay(time(through) - 365 * DAY + DAY); previous = { from: isoDay(time(from) - 365 * DAY), to: isoDay(time(from) - DAY) }; }
    }
    rows = dated.filter((record) => inCountry(record) && record.date >= from && record.date <= to);
  }
  const effectiveTo = to > through ? through : to;
  const partial = scope.kind === "monthly" && effectiveTo < to;
  const prevRows = previous ? dated.filter((record) => inCountry(record) && record.date >= previous.from && record.date <= previous.to) : null;
  // Twelve months before the period, for "new instrument" and average comparisons.
  const baseFrom = isoDay(time(from) - 365 * DAY);
  const baseline = dated.filter((record) => inCountry(record) && record.date >= baseFrom && record.date < from);
  const region = scope.kind === "event" ? rows : dated.filter((record) => record.date >= from && record.date <= to);
  return { ...scope, from, to, effectiveTo, through, partial, label, previous, rows, prevRows, baseline, region, event };
}

// ---------- signals ----------
function themeStats(rows) {
  return THEMES.map((theme) => {
    const items = rows.filter((record) => themesOf(record).includes(theme.key));
    return { ...theme, rows: items, count: items.length, countries: countBy(items, (record) => record.country), instruments: countBy(items, instrumentOf).filter(([key]) => key !== "other") };
  }).sort((a, b) => b.count - a.count);
}
function illustrate(theme, rows, count, used) {
  // Policy decisions first: market news and events are used only when there is nothing else.
  const candidates = rows.filter((record) => hasSource(record) && !used.has(record.id));
  const decisions = candidates.filter((record) => significance(record) >= 0);
  const pool = decisions.length >= Math.min(count, 2) ? decisions : candidates;
  const picked = [];
  // Theme-fit examples from each approach, then the most significant, spread across countries.
  theme.approaches.forEach((key) => examples(pool.filter((record) => !picked.includes(record)), key, 1).forEach((record) => picked.push(record)));
  pool.filter((record) => !picked.includes(record)).sort((a, b) => significance(b) - significance(a)).forEach((record) => picked.push(record));
  const spread = [];
  for (const record of picked) { if (spread.length >= count) break; if (spread.some((item) => item.country === record.country) && picked.some((other) => !spread.includes(other) && !spread.some((item) => item.country === other.country))) continue; spread.push(record); }
  for (const record of picked) { if (spread.length >= count) break; if (!spread.includes(record)) spread.push(record); }
  spread.forEach((record) => used.add(record.id));
  return spread;
}
function cpiFor(food, country, from, to) {
  const cpi = food && cpiSummary(food);
  if (!cpi) return null;
  const entry = food.cpi.countries[country];
  if (!entry) return null;
  const months = Object.keys(entry.inflation).sort();
  const inPeriod = months.filter((month) => month >= from.slice(0, 7) && month <= to.slice(0, 7));
  const row = cpi.rows.find((item) => item.country === country);
  return { row, inPeriod, latest: months.at(-1), value: (month) => entry.inflation[month], general: entry.general, food: entry.food };
}

// ---------- the brief ----------
export function buildBrief({ records, food = null, events = [], scope, preparedBy = "Policy Intelligence dashboard, FAO Subregional Office for the Gulf Cooperation Council States and Yemen", today = new Date().toISOString().slice(0, 10), version = "Version 1.0 (automated draft)" }) {
  const s = resolveScope(records, scope, events);
  const w = new Writer(`${scope.kind}|${scope.country || "all"}|${s.from}|${s.to}`);
  const one = s.country && s.country !== "all" ? s.country : null;
  const where = s.kind === "event" ? `the GCC States and Yemen` : one ? name(one) : "the GCC States and Yemen";
  const when = s.kind === "monthly" ? `In ${w.month(s.from.slice(0, 7))}` : s.kind === "event" ? `Across the measures linked to ${s.label}` : `Between ${w.date(s.from)} and ${w.date(s.effectiveTo)}`;
  const periodLabel = s.kind === "monthly" ? w.month(s.from.slice(0, 7)) : s.kind === "event" ? `${w.date(s.from)} to ${w.date(s.to)}` : `${w.date(s.from)} to ${w.date(s.effectiveTo)}`;
  const prevLabel = s.kind === "monthly" ? w.month(s.previous.from.slice(0, 7)) : s.previous ? `the previous ${w.num(12)} months` : null;
  const title = { monthly: "Monthly policy briefing", country: "Country policy brief", regional: "Regional policy analysis", event: "Event brief" }[s.kind];
  const subtitle = `${s.kind === "event" ? s.label : one || "GCC States and Yemen"} · ${periodLabel}`;
  const countriesLine = s.kind === "event" ? list(countBy(s.rows, (record) => record.country).map(([country]) => country)) : one || COUNTRIES.join(", ");
  const base = { title, subtitle, countriesLine, preparedBy, date: today, version, periodLabel, partial: s.partial, through: s.through };

  if (!s.rows.length) {
    const sections = [{ title: "Key messages", blocks: [p(`No food or agriculture policy measures were recorded for ${where} in this period. This most likely reflects gaps in public reporting rather than an absence of policy action.`)] }];
    return finish(w, { ...base, sections, annexNote: dataNote(w, s, one) });
  }

  const stats = themeStats(s.rows);
  // Themes with at least two measures; a very small scope (an event with a handful of records) falls back to one.
  const active = stats.filter((theme) => theme.count >= 2).length ? stats.filter((theme) => theme.count >= 2) : stats.filter((theme) => theme.count >= 1);
  const prevStats = s.prevRows ? Object.fromEntries(themeStats(s.prevRows).map((theme) => [theme.key, theme.count])) : null;
  const used = new Set();
  const ranked = s.rows.filter(hasSource).sort((a, b) => significance(b) - significance(a) || b.date.localeCompare(a.date));
  const leadRecord = ranked[0];
  const restrictions = s.rows.filter((record) => hasSource(record) && restrictionOf(record)).sort((a, b) => restrictionRank(a) - restrictionRank(b) || significance(b) - significance(a));
  const leaders = countBy(s.rows, (record) => record.country);

  // CPI context for the countries in scope.
  const cpiCountries = (one ? [one] : COUNTRIES).map((country) => ({ country, cpi: cpiFor(food, country, s.from, s.to) })).filter((item) => item.cpi);
  const hot = cpiCountries.map(({ country, cpi }) => ({ country, cpi, month: cpi.inPeriod.at(-1) || cpi.latest })).map((item) => ({ ...item, value: item.cpi.value(item.month) })).filter((item) => item.value !== undefined).sort((a, b) => b.value - a.value);
  const consumerRows = (country) => s.rows.filter((record) => record.country === country && themesOf(record).some((key) => key === "trade" || key === "social") && /price|market|consumer|subsid|assistance|basket|vulnerable|social/i.test(lead(record)));

  // ---------- 1. Key messages ----------
  const km = [];
  const top = active.slice(0, 2);
  if (!top.length) km.push(p(`${when}, the few measures recorded for ${where} do not fall clearly under any of the main policy themes.`));
  else km.push(p(`${when}, food and agriculture policy in ${where} ${w.pick(["centred on", "focused on", "was led by measures on"], "km1")} ${top[0].short}${top[1] ? ` and on ${top[1].short}` : ""}${!one && leaders.length > 1 && leaders[0][1] / s.rows.length >= .4 ? `. ${Name(leaders[0][0])} was the most active country` : ""}.`));
  if (leadRecord) {
    used.add(leadRecord.id);
    const kind = INSTRUMENT[instrumentOf(leadRecord)]?.one;
    km.push(p(`${w.pick(["The most consequential step was", "The step with the widest reach was", "The most significant decision was"], "km2")} `, w.cite(leadRecord), `, ${kind ? `${article(kind)} ${kind}` : "a policy decision"} by ${institutionName(leadRecord.institution) || name(leadRecord.country)}.`));
  }
  if (hot.length) {
    const h = hot[0];
    const few = consumerRows(h.country).length < 2;
    km.push(p(`${one ? `Food prices in ${name(h.country)} rose by` : `Food prices rose fastest in ${name(h.country)}, by`} ${w.pct(h.value)} in the year to ${w.month(h.month)}${few ? `, while few measures acted on consumer prices or support to households` : ""}.`));
  }
  const rising = prevStats ? active.filter((theme) => theme.count >= 4 && prevStats[theme.key] !== undefined && theme.count >= (prevStats[theme.key] || 0) * 1.5 + 2) : [];
  if (rising.length) km.push(p(`Attention to ${rising[0].short} ${w.pick(["rose", "increased", "grew"], "km4")} compared with ${prevLabel}, which ${w.pick(["suggests a shift in priorities", "is consistent with a shift in priorities"], "km4b")}.`));
  if (restrictions.length) km.push(p(`Trade restrictions such as `, w.cite(restrictions[0]), ` may tighten supply in neighbouring markets and merit monitoring.`));
  else if (s.kind !== "event" && !one && hot.length && hot[0].value >= 3 && !rising.some((theme) => theme.key === "social") && s.rows.filter((record) => themesOf(record).includes("social")).length / s.rows.length < .08) km.push(p(`Measures to protect household access to food remain a thin strand of policy as food prices rise.`));

  // ---------- 2. Context ----------
  const context = [];
  if (cpiCountries.length) {
    if (one) {
      const { cpi } = cpiCountries[0];
      const month = cpi.inPeriod.at(-1) || cpi.latest;
      const yearAgo = `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`;
      const g = cpi.general[month] && cpi.general[yearAgo] ? (cpi.general[month] / cpi.general[yearAgo] - 1) * 100 : null;
      context.push(p(`Food price inflation in ${name(one)} was ${w.pct(cpi.value(month))} in ${w.month(month)}${g !== null ? `, against ${w.pct(g)} for all consumer prices` : ""} (FAOSTAT consumer price indices).${month < s.to.slice(0, 7) ? ` Later months are not yet published.` : ""}`));
      if (cpi.row.peakMonth !== month && cpi.row.peak > cpi.value(month) + 1) context.push(p(`It had peaked at ${w.pct(cpi.row.peak)} in ${w.month(cpi.row.peakMonth)}.`));
    } else if (hot.length) {
      const low = hot.at(-1);
      context.push(p(`Food price inflation ranged from ${w.pct(low.value)} in ${name(low.country)} (${w.month(low.month)}) to ${w.pct(hot[0].value)} in ${name(hot[0].country)} (${w.month(hot[0].month)}), according to FAOSTAT consumer price indices.`));
      const marked = hot.filter((item) => item.value >= 3).map((item) => name(item.country));
      if (marked.length) context.push(p(`Food prices were rising by ${w.pct(3, 0)} a year or more in ${list(marked)}. Yemen is not covered by this series.`));
    }
  } else if (one === "Yemen") context.push(p(`FAOSTAT consumer price indices and healthy diet cost estimates are not available for Yemen, so price pressure cannot be assessed from these sources.`));
  const diet = food && dietSummary(food).rows.find((row) => one && row.country === one && row.latest !== undefined);
  if (diet) context.push(p(`A healthy diet cost ${w.pct(diet.lcuChange, 0)} more in local currency in ${w.note(String(diet.latestYear))} than in ${w.note(String(diet.firstYear))} (FAOSTAT).`));
  // Measures the monitoring team tagged to an event come first, then wording that reports a disruption.
  // Measures the monitoring team tagged to an event come first; otherwise wording that reports a disruption.
  const taggedRows = s.rows.filter((record) => hasSource(record) && (record.tags || []).length).sort((a, b) => significance(b) - significance(a));
  const shocks = (taggedRows.length ? taggedRows : s.rows.filter((record) => hasSource(record) && SHOCK.test(lead(record))).sort((a, b) => significance(b) - significance(a))).slice(0, 2);
  if (shocks.length) {
    shocks.forEach((record) => used.add(record.id));
    const tagName = taggedRows.length ? (events.find((item) => (item.tags || []).some((tag) => shocks[0].tags.includes(tag)))?.name || shocks[0].tags[0]) : null;
    const cites = shocks.flatMap((record, i) => [i ? " and " : "", w.cite(record)]);
    context.push(tagName ? p(`The monitoring team linked `, ...cites, ` to the ${tagName}.`) : p(`${w.pick(["Market and supply pressures appear in", "Supply conditions are reflected in"], "ctx-shock")} `, ...cites, "."));
  } else context.push(p(`The monitored measures report no specific market or supply shock in this period.`));
  const seasonal = s.rows.filter((record) => hasSource(record) && SEASON.test(lead(record)) && !used.has(record.id)).slice(0, 1);
  if (seasonal.length) { used.add(seasonal[0].id); context.push(p(`Seasonal activity also featured, for example `, w.cite(seasonal[0]), `.`)); }
  if (s.prevRows) {
    const now = s.rows.length, before = s.prevRows.length;
    const direction = now > before * 1.15 ? `higher than in ${prevLabel}` : now < before * .85 ? `lower than in ${prevLabel}` : `similar to ${prevLabel}`;
    context.push(p(`Policy activity was ${direction} (${w.num(now)} measures against ${w.num(before)})${s.partial ? `, although this month is covered only to ${w.date(s.effectiveTo)}` : ""}.`));
  }

  // ---------- 3. Policy developments and analysis ----------
  const themeBlocks = active.slice(0, s.kind === "monthly" ? 4 : 5).flatMap((theme) => {
    const blocks = [{ type: "h3", text: theme.label }];
    const countries = theme.countries.map(([country]) => name(country));
    const instruments = theme.instruments.slice(0, 2).map(([key]) => INSTRUMENT[key].label);
    const actors = one ? Name(one) : countries.length > 4 ? `${countries.slice(0, 4).join(", ")} and others` : list(countries);
    blocks.push(p(`${actors.charAt(0).toUpperCase()}${actors.slice(1)} acted on ${theme.short}${instruments.length ? `, mainly through ${list(instruments)}` : ""}. ${w.pick(["These measures aim to", "The aim is to", "Together they seek to"], theme.key)} ${theme.objective}.`));
    const comparisons = [];
    if (prevStats) {
      const before = prevStats[theme.key] || 0;
      comparisons.push(theme.count > before * 1.25 + 1 ? `Activity in this area rose compared with ${prevLabel} (${w.num(theme.count)} measures against ${w.num(before)}).` : theme.count < before * .75 - 1 ? `Activity in this area eased compared with ${prevLabel} (${w.num(theme.count)} measures against ${w.num(before)}).` : w.pick([`Activity was broadly in line with ${prevLabel}.`, `The level of activity changed little from ${prevLabel}.`], `${theme.key}-flat`));
    }
    if (one) {
      const regionTheme = s.region.filter((record) => record.country !== one);
      const peerShare = regionTheme.length ? regionTheme.filter((record) => themesOf(record).includes(theme.key)).length / regionTheme.length : 0;
      const ownShare = theme.count / s.rows.length;
      if (peerShare && ownShare >= peerShare * 1.3) comparisons.push(`${Name(one)} gave this area more weight than its neighbours (${w.pct(ownShare * 100, 0)} of its measures against ${w.pct(peerShare * 100, 0)}).`);
      else if (peerShare && ownShare <= peerShare * .7) comparisons.push(`${Name(one)} gave this area less weight than its neighbours (${w.pct(ownShare * 100, 0)} of its measures against ${w.pct(peerShare * 100, 0)}).`);
    }
    // New instruments: used in this area now but not by that country in the previous 12 months.
    const fresh = theme.rows.filter((record) => instrumentOf(record) !== "other" && instrumentOf(record) !== "event" && !s.baseline.some((old) => old.country === record.country && instrumentOf(old) === instrumentOf(record) && themesOf(old).includes(theme.key)));
    if (fresh.length && s.kind !== "event") comparisons.push(`${Name(fresh[0].country)} used ${INSTRUMENT[instrumentOf(fresh[0])].label} in this area for the first time in ${w.num(12)} months.`);
    const cluster = countBy(theme.rows, (record) => `${record.country}|${record.institution}`).find(([key, count]) => count >= 3 && key.split("|")[1]);
    // An institution behind most of a theme is reported once per brief (in a country brief it is usually the lead ministry).
    if (cluster && !w.clusterNoted) {
      w.clusterNoted = true;
      comparisons.push(`${(s => s.charAt(0).toUpperCase() + s.slice(1))(institutionName(cluster[0].split("|")[1]))} ${w.pick(["alone accounted for", "was behind", "issued"], `${theme.key}-cluster`)} ${w.num(cluster[1])} of these measures.`);
    }
    const spike = hot.find((item) => item.value >= 5 && theme.rows.some((record) => record.country === item.country && (theme.key === "trade" || theme.key === "social")));
    if (spike) comparisons.push(`In ${name(spike.country)}, these measures coincided with food price inflation of ${w.pct(spike.value)} (${w.month(spike.month)}).`);
    if (comparisons.length) blocks.push(p(comparisons.join(" ")));
    const picks = illustrate(theme, theme.rows, Math.min(4, Math.max(2, Math.ceil(theme.count / 8))), used);
    if (picks.length) blocks.push({ type: "p", parts: ["Illustrative measures:"] }, bullets(picks.map((record) => [w.cite(record), ` (${INSTRUMENT[instrumentOf(record)]?.one || "policy decision"})`])));
    return blocks;
  });

  // ---------- 4. Policy coherence and gaps ----------
  const coherence = [];
  restrictions.slice(0, 2).forEach((record) => coherence.push([w.cite(record), ` restricts trade flows. It may tighten supply in neighbouring markets that rely on these flows.`]));
  // Production expansion alongside water measures, in the same country: one sentence for all such countries.
  const both = (one ? [one] : COUNTRIES).filter((country) => {
    const rows = s.rows.filter((record) => record.country === country);
    const has = (key) => rows.some((record) => themesOf(record).includes(key) && (key !== "producers" || /production|expan|farm|greenhouse/i.test(lead(record))));
    return has("producers") && has("water") && rows.length >= 5;
  });
  if (both.length) coherence.push([`In ${list(both.map(name))}, expansion of domestic production ran alongside water measures. Whether new capacity respects water limits is worth assessing.`]);
  const exposed = hot.filter((item) => item.value >= 3 && consumerRows(item.country).length === 0);
  // Gaps "in this period" only make sense for a period brief, not for the handful of measures behind an event.
  if (exposed.length && s.kind !== "event") { const text = list(exposed.map((item) => `${name(item.country)} (${w.pct(item.value)} in ${w.month(item.month)})`)); coherence.push([`${text.charAt(0).toUpperCase()}${text.slice(1)} recorded food price inflation of ${w.pct(3, 0)} or more but no measures on consumer prices or household support in this period.`]); }
  const socialShare = s.rows.filter((record) => themesOf(record).includes("social")).length / s.rows.length;
  if (socialShare < .05 && s.kind !== "event") coherence.push([`Nutrition and social protection account for only ${w.pct(socialShare * 100, 0)} of measures, a small share relative to the risk that rising food prices pose to poorer households.`]);
  const gaps = [];
  // An event naturally involves few countries, so its brief reports which ones instead of a coverage gap.
  if (s.kind === "event") gaps.push(`The event covers measures from ${list(leaders.map(([country]) => name(country)))}.`);
  const quiet = (one || s.kind === "event" ? [] : COUNTRIES).filter((country) => !s.rows.some((record) => record.country === country));
  if (quiet.length) gaps.push(`No measures were recorded for ${list(quiet.map(name))}, which more likely reflects reporting coverage than a lack of policy.`);
  if (s.partial) gaps.push(`The month is covered only to ${w.date(s.effectiveTo)}.`);
  gaps.push(`Themes and instruments are identified from the wording of each summary, so they are indicative.`);
  coherence.push([`Coverage limits: ${gaps.join(" ")}`]);

  // ---------- 5. Implications ----------
  const implications = [];
  const supplySide = s.rows.filter((record) => themesOf(record).some((key) => ["supply", "producers", "water"].includes(key))).length / s.rows.length;
  implications.push([`Food security: ${supplySide >= .6 ? "policy remains oriented to securing and expanding supply, which supports availability but does less for access" : "policy balances supply measures with measures on markets and access"}.`]);
  if (hot.length) implications.push([`Prices: ${hot[0].value >= 5 ? `food price inflation of ${w.pct(hot[0].value)} in ${name(hot[0].country)} suggests pressure on household budgets that supply measures alone are unlikely to relieve` : `food price inflation was moderate in the countries covered, which gives room for longer-term measures`}.`]);
  const producerRows = s.rows.filter((record) => themesOf(record).includes("producers"));
  if (producerRows.length) implications.push([`Producers: ${producerRows.filter((record) => ["subsidy", "investment"].includes(instrumentOf(record))).length >= 2 ? "investment and financial support continue to favour expansion of capacity; reach to smaller producers is not visible in the record" : "support to producers relies mostly on programmes and training rather than finance"}.`]);

  // ---------- 6. Recommendations ----------
  const recs = [];
  if (restrictions.length) recs.push([`Track the duration and price effect of `, w.cite(restrictions[0]), `. FAO can support timely regional notification of trade measures.`]);
  hot.filter((item) => item.value >= 5 && (s.kind !== "event" || leaders.some(([country]) => country === item.country))).slice(0, 1).forEach((item) => recs.push([`Support ${name(item.country)} with food price monitoring and options for targeted household support, given food price inflation of ${w.pct(item.value)}.`]));
  const framework = ranked.find((record) => ["regulation", "institutional"].includes(instrumentOf(record)) && !restrictionOf(record));
  if (framework) recs.push([`Follow the implementation of `, w.cite(framework), `: implementing rules, budget and progress reporting.`]);
  if (coherence.some((item) => /water limits/.test(item.join("")))) recs.push([`Offer technical assistance on water-efficient production standards for new agricultural projects.`]);
  if (quiet.length) recs.push([`Strengthen monitoring coverage for ${list(quiet.map(name))}, for example through focal points in the relevant ministries.`]);
  if (socialShare < .05 && s.kind !== "event") recs.push([`Review options to link food security strategies with social protection, drawing on regional experience.`]);

  const keyMessages = km.slice(0, 5);
  const sections = [
    { title: "Key messages", blocks: [bullets(keyMessages.map((block) => block.parts))] },
    { title: "Context", blocks: context },
    { title: "Policy developments and analysis", blocks: themeBlocks.length ? themeBlocks : [p("Too few measures were recorded to analyse by theme.")] },
    { title: "Policy coherence and gaps", blocks: [bullets(coherence)] },
    { title: "Implications", blocks: [bullets(implications)] },
    { title: "Recommendations and areas for FAO support", blocks: [bullets(recs.length ? recs : [["Continue regular monitoring; the period shows no specific gap that calls for new support."]])] },
  ];
  // Computed indicators and the evidence pool, for the optional AI-assisted draft (which may use nothing else).
  const indicators = { scope: subtitle, period: { from: s.from, to: s.effectiveTo, partial: s.partial }, measuresInScope: s.rows.length, measuresInPreviousPeriod: s.prevRows ? s.prevRows.length : null, themes: stats.filter((theme) => theme.count).map((theme) => ({ theme: theme.label, measures: theme.count, previous: prevStats ? prevStats[theme.key] || 0 : null, countries: theme.countries.map(([country]) => country) })), foodPriceInflation: hot.map((item) => ({ country: item.country, month: item.month, percent: item.value })), tradeRestrictions: restrictions.map((record) => record.id) };
  const evidenceIds = [...new Set([...w.cited.keys(), ...ranked.slice(0, 60).map((record) => record.id)])].slice(0, 80);
  return finish(w, { ...base, sections, indicators, evidenceIds, annexNote: dataNote(w, s, one) });
}

function dataNote(w, s, one) {
  return [
    `Coverage: ${s.kind === "event" ? `measures tagged to ${s.label}` : one ? name(one) : "the six GCC States and Yemen"}, ${w.date(s.from)} to ${w.date(s.effectiveTo)}; ${w.num(s.rows.length)} measures in scope.`,
    s.partial ? `The latest month is partial: data run to ${w.date(s.effectiveTo)}.` : "",
    `Sources: the FAO monitored policy record (summaries of public reporting) and FAOSTAT consumer price indices and healthy diet cost estimates.`,
    `Themes and instruments are identified from keywords in each summary and are indicative. Policy measures are summaries for monitoring, not legal texts; consult the original source.`,
  ].filter(Boolean);
}

function finish(w, report) {
  const cited = [...w.cited.values()].sort((a, b) => b.date.localeCompare(a.date));
  return { ...report, annex: cited.map((record) => ({ id: record.id, date: record.date, country: record.country, institution: [record.institution, record.institutionBranch].filter(Boolean).join(" – "), title: record.title, source: record.source })), cited: w.cited, facts: w.facts };
}

// ---------- renderers ----------
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const safeUrl = (value) => { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } };
const shortDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
function partsToHtml(report, parts) {
  return parts.map((part) => {
    if (typeof part === "string") return esc(part);
    const record = report.cited.get(part.cite);
    return `“<a class="cite" href="${esc(safeUrl(record.source))}" target="_blank" rel="noopener noreferrer" data-record="${esc(record.id)}">${esc(record.title)}</a>” <span class="cite-meta">(${esc(name(record.country))}, ${esc(shortDate(record.date))})</span>`;
  }).join("");
}
export function toHtml(report) {
  const blocks = (items) => items.map((block) => block.type === "h3" ? `<h4>${esc(block.text)}</h4>` : block.type === "list" ? `<ul class="narrative-list">${block.items.map((item) => `<li>${partsToHtml(report, item)}</li>`).join("")}</ul>` : `<p>${partsToHtml(report, block.parts)}</p>`).join("");
  const sections = report.sections.map((section, i) => `<section><h3>${i + 1}. ${esc(section.title)}</h3>${blocks(section.blocks)}</section>`).join("");
  const annex = `<section class="report-annex"><h3>${report.sections.length + 1}. Annex: measures referenced</h3>${report.annex.length ? `<div class="report-table-wrap"><table><thead><tr><th>Date</th><th>Country</th><th>Institution</th><th>Measure</th><th>Source</th></tr></thead><tbody>${report.annex.map((row) => `<tr><td>${esc(shortDate(row.date))}</td><td>${esc(row.country)}</td><td>${esc(row.institution || "Not stated")}</td><td>${esc(row.title)}</td><td><a href="${esc(safeUrl(row.source))}" target="_blank" rel="noopener noreferrer">Source</a></td></tr>`).join("")}</tbody></table></div><p class="report-table-caption">Source: FAO policy monitoring record; summaries of public reporting.</p>` : "<p>No measures are referenced.</p>"}<h4>Data note</h4><ul class="narrative-list">${report.annexNote.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></section>`;
  return `<div class="report-document"><header class="report-cover"><div class="eyebrow">FOOD AND AGRICULTURE ORGANIZATION OF THE UNITED NATIONS · POLICY INTELLIGENCE</div><h2>${esc(report.title)}</h2><p class="report-cover-sub">${esc(report.subtitle)}</p><dl class="report-cover-meta"><div><dt>Countries</dt><dd>${esc(report.countriesLine)}</dd></div><div><dt>Prepared by</dt><dd>${esc(report.preparedBy)}</dd></div><div><dt>Date</dt><dd>${esc(shortDate(report.date))}</dd></div><div><dt>Version</dt><dd>${esc(report.version)}</dd></div></dl>${report.partial ? `<p class="report-partial">Partial month: data run to ${esc(shortDate(report.through))}.</p>` : ""}</header>${sections}${annex}<p class="report-note">Policy measures are short summaries compiled for monitoring and analysis, not legal texts. Always consult the original source.</p></div>`;
}
export function toMarkdown(report) {
  const md = (parts) => parts.map((part) => { if (typeof part === "string") return part; const record = report.cited.get(part.cite); return `“[${record.title}](${safeUrl(record.source)})” (${name(record.country)}, ${shortDate(record.date)})`; }).join("");
  const out = [`# ${report.title}`, `**${report.subtitle}**`, `- Countries: ${report.countriesLine}`, `- Prepared by: ${report.preparedBy}`, `- Date: ${shortDate(report.date)}`, `- Version: ${report.version}`];
  if (report.partial) out.push(`> Partial month: data run to ${shortDate(report.through)}.`);
  report.sections.forEach((section, i) => {
    out.push(`## ${i + 1}. ${section.title}`);
    section.blocks.forEach((block) => out.push(block.type === "h3" ? `### ${block.text}` : block.type === "list" ? block.items.map((item) => `- ${md(item)}`).join("\n") : md(block.parts)));
  });
  out.push(`## ${report.sections.length + 1}. Annex: measures referenced`, "| Date | Country | Institution | Measure | Source |", "| --- | --- | --- | --- | --- |", ...report.annex.map((row) => `| ${shortDate(row.date)} | ${row.country} | ${(row.institution || "Not stated").replace(/\|/g, "/")} | ${row.title.replace(/\|/g, "/")} | [Source](${safeUrl(row.source)}) |`), "", "_Source: FAO policy monitoring record; summaries of public reporting._", "### Data note", ...report.annexNote.map((item) => `- ${item}`), "", "> Policy measures are short summaries compiled for monitoring and analysis, not legal texts. Always consult the original source.");
  return `${out.join("\n\n")}\n`;
}
// Plain text of the narrative (for tests and "Copy text").
export function toText(report) {
  const text = (parts) => parts.map((part) => typeof part === "string" ? part : `“${report.cited.get(part.cite).title}” (${name(report.cited.get(part.cite).country)}, ${shortDate(report.cited.get(part.cite).date)})`).join("");
  return report.sections.map((section, i) => [`${i + 1}. ${section.title}`, ...section.blocks.map((block) => block.type === "h3" ? block.text : block.type === "list" ? block.items.map((item) => `- ${text(item)}`).join("\n") : text(block.parts))].join("\n")).join("\n\n");
}
