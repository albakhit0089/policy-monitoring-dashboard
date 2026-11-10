// Policy intelligence functions: the monthly brief, country benchmarking profiles and thematic comparison.
// Everything here is derived from the policy record; wording flags patterns to investigate, not verdicts.
import { APPROACHES, approachesOf, approachLabel, approachProfile } from "./policy-analysis.js?v=pi-20261018";
import { CURRENCY, countryPriceSummary, dietSummary, formatLocal, perMonth } from "./food-analysis.js?v=pi-20261018";
import { loadFoodIndicators } from "./data-service.js?v=pi-20261018";

// ---------- policy instruments ----------
// What kind of government action a measure is. Checked in priority order; the first match is the primary instrument.
export const INSTRUMENTS = [
  { key: "legislation", label: "Laws and regulations", short: "Law / regulation", pattern: /\b(laws?|decrees?|royal (order|decree)|by-?laws?|legislat\w*|ministerial (decision|resolution|order)|cabinet (decision|resolution|approved|approves)|resolution no|new regulations?|regulations? (on|for|governing|regulating)|issued regulations?|bann?(ed|ing)?|prohibit\w*)\b/i },
  { key: "strategy", label: "Strategies and plans", short: "Strategy / plan", pattern: /\b(strategy|action plan|road ?map|master plan|national plan|development plan|five-year plan)\b/i },
  { key: "investment", label: "Investments and financing", short: "Investment", pattern: /\b(invest\w*|financing|loans?|grants?)\b|(\$|US\$|USD|SAR|SR|AED|Dhs?|QR|QAR|KD|KWD|BD|BHD|RO|OMR|YER)\s?[\d.,]+\s?(million|billion|bn)\b|[\d.,]+\s?(million|billion)\s?(US )?(dollars|riyals?|dirhams?|dinars?|rials?)/i },
  { key: "agreement", label: "Agreements and partnerships", short: "Agreement", pattern: /\b(agreements?|agreed|memorand\w*|MoUs?|signed|signing)\b/i },
  { key: "enforcement", label: "Inspection and enforcement", short: "Enforcement", pattern: /\b(inspection|inspected|violations?|seized|seizure|confiscat\w*|closure of|penalt(y|ies)|fined|fines)\b/i },
  { key: "event", label: "Events and dialogue", short: "Event", pattern: /\b(symposium|conference|workshop|forum|exhibition|summit|seminar|festival|webinar|roundtable|expo)\b/i },
  { key: "programme", label: "Programmes and initiatives", short: "Programme", pattern: /\b(programmes?|programs?|initiatives?|launch\w*|schemes?|campaigns?|projects?)\b/i },
];
const NOUNS = { legislation: ["law or regulation", "laws or regulations"], strategy: ["strategy or plan", "strategies or plans"], investment: ["investment or financing announcement", "investment or financing announcements"], agreement: ["agreement", "agreements"], programme: ["programme or initiative", "programmes or initiatives"] };
const OTHER = { key: "other", label: "Other decisions", short: "Decision" };
const BY_INSTRUMENT = Object.fromEntries([...INSTRUMENTS, OTHER].map((item) => [item.key, item]));
const MONEY = /(\$|US\$|USD|SAR|SR|AED|Dhs?|QR|QAR|KD|KWD|BD|BHD|RO|OMR|YER)\s?[\d.,]+\s?(million|billion|bn)\b|[\d.,]+\s?(million|billion)\s?(US )?(dollars|riyals?|dirhams?|dinars?|rials?)/i;
const RESTRICTION = /\b(bann?(ed|ing|s)?|prohibit\w*|suspend\w*|halt\w*|restrict(s|ed|ing|ions?)?|stop(ped)? (the )?(import|export)\w*)\b/i;
const TRADE_FLOW = /\b(imports?|imported|importing|exports?|exported|exporting|shipments?|entry of|re-export\w*|trade in)\b/i;
// The sentence of a measure that restricts trade flows (bans, suspensions or restrictions on imports or exports), if any.
export function restrictionOf(record) {
  return String(record.description || "").split(/(?<=[.!?])\s+/).slice(0, 3).find((part) => RESTRICTION.test(part) && TRADE_FLOW.test(part)) || null;
}
const cache = new WeakMap();
const lead = (text) => String(text || "").split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");

export function instrumentsOf(record) {
  if (cache.has(record)) return cache.get(record);
  const text = lead(record.description || record.title);
  const keys = INSTRUMENTS.filter((item) => item.pattern.test(text)).map((item) => item.key);
  if (record.type === "framework" && !keys.length) keys.push("strategy");
  const result = { keys, primary: keys[0] || "other", amount: text.match(MONEY)?.[0] || null };
  cache.set(record, result);
  return result;
}
export const instrumentLabel = (key) => BY_INSTRUMENT[key]?.label || key;
export const instrumentShort = (key) => BY_INSTRUMENT[key]?.short || key;

// How much a measure matters for a briefing: binding or strategic instruments and large sums rank first, events last.
const WEIGHT = { legislation: 5, strategy: 5, investment: 3, agreement: 2, enforcement: 2, programme: 2, other: 1, event: 0 };
export function significance(record) {
  const { primary, keys, amount } = instrumentsOf(record);
  return WEIGHT[primary] + (record.type === "framework" ? 3 : 0) + (amount ? (/billion|bn/i.test(amount) ? 3 : 1) : 0) + Math.min(keys.length - 1, 2) * .5;
}

// ---------- small helpers ----------
const num = (value) => Number(value).toLocaleString("en-GB");
const pct = (value) => `${Math.round(value * 100)}%`;
const short = (country) => country === "United Arab Emirates" ? "the UAE" : country;
const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const lower = (text) => text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
const listJoin = (items) => items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
const monthName = (key) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const shiftMonth = (key, by) => { const [y, m] = key.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + by, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
const sentence = (text, limit = 240) => { const first = String(text || "").split(/(?<=[.!?])\s+/)[0] || ""; return first.length > limit ? `${first.slice(0, limit - 1).replace(/\s+\S*$/, "")}…` : first; };
const countBy = (rows, keyFn) => { const counts = new Map(); rows.forEach((row) => [].concat(keyFn(row)).forEach((key) => key && counts.set(key, (counts.get(key) || 0) + 1))); return [...counts.entries()].sort((a, b) => b[1] - a[1]); };
const change = (value, base) => base ? (value - base) / base : null;
const changeWords = (ratio) => ratio === null ? "" : Math.abs(ratio) < .1 ? "in line with" : `${Math.round(Math.abs(ratio) * 100)}% ${ratio > 0 ? "above" : "below"}`;
const $ = (selector) => document.querySelector(selector);

function pickSpread(rows, count, spread = true) {
  const ranked = [...rows].sort((a, b) => significance(b) - significance(a) || (b.date || "").localeCompare(a.date || ""));
  if (!spread) return ranked.slice(0, count);
  const picked = [], perCountry = new Map();
  for (const round of [1, 2, 99]) for (const row of ranked) {
    if (picked.length >= count) break;
    if (picked.includes(row) || (perCountry.get(row.country) || 0) >= round) continue;
    picked.push(row); perCountry.set(row.country, (perCountry.get(row.country) || 0) + 1);
  }
  return picked.sort((a, b) => significance(b) - significance(a));
}

// ---------- shared export ----------
function exportWord(ui, root, name) {
  const documentHtml = `<!doctype html><html><head><meta charset="utf-8"><title>${ui.escapeHtml(name)}</title><style>body{font:11pt Calibri,Arial,sans-serif;color:#263b4a;line-height:1.55}h2{color:#153f59;font-size:20pt}h3{color:#153f59;font-size:14pt;margin-top:18pt}table{border-collapse:collapse;width:100%;margin:8pt 0}th,td{border:1px solid #cfd9e0;padding:4pt 6pt;font-size:9.5pt;text-align:left;vertical-align:top}th{background:#eef3f6}a{color:#116aab}.eyebrow{color:#8a5f17;font-size:9pt;letter-spacing:1px}.brief-tag{font-weight:bold;color:#8a5f17}.report-kpis div{display:inline-block;margin-right:14pt}</style></head><body>${root.innerHTML}</body></html>`;
  ui.downloadBlob(new Blob([documentHtml], { type: "application/msword;charset=utf-8" }), `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.doc`);
}
function printDocument(html) {
  let holder = null;
  if (!$("#generated-report")) { holder = document.createElement("div"); holder.id = "generated-report"; holder.className = "generated-report print-holder"; holder.innerHTML = html; document.body.append(holder); }
  document.body.classList.add("printing-report");
  window.print();
  setTimeout(() => { document.body.classList.remove("printing-report"); holder?.remove(); }, 500);
}

// =====================================================================
// Monthly policy intelligence brief
// =====================================================================
function monthStats(records, month, country) {
  const scoped = country === "all" ? records : records.filter((record) => record.country === country);
  const inMonth = (key) => scoped.filter((record) => record.date?.startsWith(key));
  const rows = inMonth(month);
  const baselineMonths = [1, 2, 3, 4, 5, 6].map((i) => shiftMonth(month, -i));
  const baselineRows = baselineMonths.flatMap(inMonth);
  const available = baselineMonths.filter((key) => scoped.some((record) => record.date?.startsWith(key))).length || 1;
  return { scoped, rows, previous: inMonth(shiftMonth(month, -1)), baselineRows, baselineAvg: baselineRows.length / available, available };
}

function keyMessages(ui, s, month, country, records) {
  const items = [];
  const vs = change(s.rows.length, s.baselineAvg);
  items.push(`<strong>${num(s.rows.length)} policy measures</strong> were recorded ${country === "all" ? "across the GCC States and Yemen" : `for ${short(country)}`} in ${monthName(month)}, ${changeWords(vs)} the average of the previous six months (${num(Math.round(s.baselineAvg))} a month).`);
  if (country === "all") {
    const ranked = countBy(s.rows, (record) => record.country);
    if (ranked.length) {
      const [top, count] = ranked[0];
      const focus = approachProfile(s.rows.filter((record) => record.country === top)).filter((row) => row.count)[0];
      items.push(`<strong>${cap(short(top))} was the most active country</strong> with ${num(count)} measures (${pct(count / s.rows.length)} of the month)${focus ? `, focused mainly on ${lower(focus.label)}` : ""}.${ranked[1] ? ` ${cap(short(ranked[1][0]))} followed with ${num(ranked[1][1])}.` : ""}`);
    }
  }
  const inst = Object.fromEntries(countBy(s.rows, (record) => instrumentsOf(record).keys));
  const parts = [["legislation", "law or regulation", "laws or regulations"], ["strategy", "strategy or plan", "strategies or plans"], ["investment", "investment or financing announcement", "investment or financing announcements"], ["agreement", "agreement", "agreements"]].filter(([key]) => inst[key]).map(([key, one, many]) => `${num(inst[key])} ${inst[key] === 1 ? one : many}`);
  if (parts.length) {
    const biggest = s.rows.filter((record) => instrumentsOf(record).amount).sort((a, b) => significance(b) - significance(a))[0];
    items.push(`<strong>By instrument</strong>, the month brought ${listJoin(parts)}.${biggest ? ` The largest stated commitment: ${short(biggest.country)}, ${ui.escapeHtml(instrumentsOf(biggest).amount)} (${ui.escapeHtml(sentence(biggest.description, 140))}).` : ""}`);
  }
  // Themes that drew clearly more attention than usual
  const now = Object.fromEntries(approachProfile(s.rows).map((row) => [row.key, row.count]));
  const before = Object.fromEntries(approachProfile(s.baselineRows).map((row) => [row.key, row.count / s.available]));
  const rising = APPROACHES.map((item) => ({ key: item.key, now: now[item.key] || 0, avg: before[item.key] || 0 })).filter((row) => row.now >= 3 && row.now >= row.avg * 1.5 + 1).sort((a, b) => (b.now - b.avg) - (a.now - a.avg)).slice(0, 2);
  if (rising.length) items.push(`<strong>Rising attention</strong> to ${listJoin(rising.map((row) => `${lower(approachLabel(row.key))} (${num(row.now)} measures against a usual ${row.avg.toFixed(1)})`))}.`);
  const restrictions = s.rows.filter(restrictionOf);
  if (restrictions.length) items.push(`<strong>Trade restrictions:</strong> ${num(restrictions.length)} measure${restrictions.length === 1 ? "" : "s"} ban, suspend or restrict trade flows (${listJoin([...new Set(restrictions.map((record) => short(record.country)))])}). See watch points.`);
  if (country === "all") {
    const quiet = ui.COUNTRIES.filter((name) => !s.rows.some((record) => record.country === name));
    if (quiet.length) items.push(`<strong>No measures were recorded</strong> for ${listJoin(quiet.map(short))} this month. This more likely reflects public reporting coverage than an absence of policy activity.`);
  }
  return items;
}

function developmentItem(ui, record) {
  const info = instrumentsOf(record);
  const href = ui.safeUrl(record.source);
  return `<article class="brief-item"><div class="brief-item-head"><span class="brief-tag tag-${info.primary}">${instrumentShort(info.primary)}</span><strong>${ui.escapeHtml(record.country)}</strong><span>${ui.escapeHtml(ui.formatDate(record.date))}</span>${info.amount ? `<span class="brief-amount">${ui.escapeHtml(info.amount)}</span>` : ""}</div><p>${ui.escapeHtml(sentence(record.description, 320))}</p><div class="brief-item-foot"><span>${ui.escapeHtml(record.domain)}</span>${record.institution ? `<span>${ui.escapeHtml(record.institution)}</span>` : ""}${href ? `<a href="${ui.escapeHtml(href)}" target="_blank" rel="noopener noreferrer">Source</a>` : ""}</div></article>`;
}

function watchPoints(ui, s, country) {
  const items = [];
  const restrictions = s.rows.filter(restrictionOf);
  restrictions.slice(0, 3).forEach((record) => items.push(`<strong>Trade restriction, ${ui.escapeHtml(short(record.country))}:</strong> ${ui.escapeHtml(sentence(restrictionOf(record), 220))} Check the effect on regional supply and prices.`));
  const consumer = s.rows.filter((record) => approachesOf(record).some((key) => key === "markets" || key === "social"));
  const share = s.rows.length ? consumer.length / s.rows.length : 0;
  items.push(share < .12
    ? `<strong>Consumer affordability:</strong> only ${num(consumer.length)} of ${num(s.rows.length)} measures (${pct(share)}) act on prices, markets or support to vulnerable households. With healthy-diet costs rising across the region, this is worth tracking.`
    : `<strong>Consumer affordability:</strong> ${num(consumer.length)} measures (${pct(share)}) act on prices, markets or support to vulnerable households. Follow whether they are implemented and reach consumers.`);
  if (country === "all") {
    ui.COUNTRIES.forEach((name) => {
      const now = s.rows.filter((record) => record.country === name).length;
      const avg = s.baselineRows.filter((record) => record.country === name).length / s.available;
      if (avg >= 5 && now >= avg * 1.6) items.push(`<strong>${cap(short(name))} activity surge:</strong> ${num(now)} measures against a usual ${avg.toFixed(0)} a month. Look for a policy push or a triggering event.`);
      else if (avg >= 5 && now <= avg * .45) items.push(`<strong>${cap(short(name))} activity drop:</strong> ${num(now)} measures against a usual ${avg.toFixed(0)} a month. Check whether reporting coverage changed.`);
    });
  }
  const frameworks = s.rows.filter((record) => ["legislation", "strategy"].includes(instrumentsOf(record).primary));
  if (frameworks.length) items.push(`<strong>Implementation follow-up:</strong> ${num(frameworks.length)} new law${frameworks.length === 1 ? "" : "s"}, strategies or plans were recorded. Track the implementing decisions, budgets and results that should follow in the coming months.`);
  return items;
}

function briefDocument(ui, state) {
  const { month, country } = state.brief;
  const s = monthStats(state.records, month, country);
  const scopeName = country === "all" ? "GCC States & Yemen" : country;
  const inst = Object.fromEntries(countBy(s.rows, (record) => instrumentsOf(record).keys));
  const vs = change(s.rows.length, s.baselineAvg);
  const kpis = [
    ["Measures", num(s.rows.length)],
    ["vs 6-month average", vs === null ? "n/a" : `${vs > 0 ? "+" : ""}${Math.round(vs * 100)}%`],
    ["Laws, strategies & plans", num(s.rows.filter((record) => ["legislation", "strategy"].some((key) => instrumentsOf(record).keys.includes(key))).length)],
    ["Investments announced", num(inst.investment || 0)],
  ];
  const developments = pickSpread(s.rows, 6, country === "all");
  const instrumentSections = ["legislation", "strategy", "investment", "agreement", "enforcement", "programme"].map((key) => {
    const all = s.rows.filter((record) => instrumentsOf(record).primary === key);
    const rows = all.filter((record) => !developments.includes(record));
    if (!rows.length) return "";
    const top = pickSpread(rows, 4, country === "all");
    return `<h4>${instrumentLabel(key)} <span class="brief-count">${num(all.length)}</span></h4><ul class="narrative-list">${top.map((record) => `<li><strong>${ui.escapeHtml(cap(short(record.country)))}</strong> (${ui.escapeHtml(ui.formatDate(record.date))}): ${ui.escapeHtml(sentence(record.description, 200))}</li>`).join("")}</ul>${rows.length > top.length ? `<p class="report-note">Plus ${num(rows.length - top.length)} more in the Policy Records page.</p>` : ""}`;
  }).join("");
  const snapshot = country === "all" ? `<section><h3>4. Country snapshot</h3><div class="report-table-wrap"><table><thead><tr><th>Country</th><th>Measures</th><th>vs 6-month average</th><th>Main focus</th><th>Headline measure</th></tr></thead><tbody>${ui.COUNTRIES.map((name) => {
    const rows = s.rows.filter((record) => record.country === name);
    const avg = s.baselineRows.filter((record) => record.country === name).length / s.available;
    const ratio = change(rows.length, avg);
    const focus = approachProfile(rows).filter((row) => row.count)[0];
    const headline = pickSpread(rows, 1, false)[0];
    return `<tr><td><strong>${ui.escapeHtml(name)}</strong></td><td>${num(rows.length)}</td><td>${avg < 3 ? `low base (usually ${avg.toFixed(1)})` : `${ratio > 0 ? "+" : ""}${Math.round(ratio * 100)}%`}</td><td>${focus ? ui.escapeHtml(focus.label) : "–"}</td><td>${headline ? ui.escapeHtml(sentence(headline.description, 130)) : "No measures recorded"}</td></tr>`;
  }).join("")}</tbody></table></div></section>` : "";
  const n = country === "all" ? 5 : 4;
  return `<div class="report-document brief-document"><header class="report-cover"><div class="eyebrow">MONTHLY POLICY INTELLIGENCE BRIEF</div><h2>${monthName(month)}: ${ui.escapeHtml(scopeName)}</h2><p class="report-meta">Food and agriculture policy developments · ${num(s.rows.length)} measures · prepared ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p><div class="report-kpis">${kpis.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("")}</div></header>
  ${s.rows.length ? `<section><h3>1. Key messages</h3><ul class="narrative-list">${keyMessages(ui, s, month, country, state.records).map((item) => `<li>${item}</li>`).join("")}</ul></section>
  <section><h3>2. Key developments</h3><p>The most significant measures of the month, ranked by instrument (laws, strategies and large investments first)${country === "all" ? " and spread across countries" : ""}.</p><div class="brief-items">${developments.map((record) => developmentItem(ui, record)).join("")}</div></section>
  <section><h3>3. Other developments by instrument</h3><p class="report-note">Each measure is listed once, under its main instrument; measures shown above are not repeated.</p>${instrumentSections || "<p>No further measures this month.</p>"}</section>
  ${snapshot}
  <section><h3>${n}. Watch points</h3><ul class="narrative-list">${watchPoints(ui, s, country).map((item) => `<li>${item}</li>`).join("")}</ul></section>` : `<section><h3>No measures recorded</h3><p>No policy measures were recorded for this scope in ${monthName(month)}.</p></section>`}
  <section><h3>${n + 1}. About this brief</h3><p>Generated from the monitored policy record. Instruments (law, strategy, investment, agreement, programme, event) and policy approaches are identified from the wording of each measure, so they are indicative. Significance ranks binding and strategic instruments and large stated sums first. Comparisons use the average of the previous six months. Always check the original source before citing a measure.</p></section></div>`;
}

export function briefMonths(records) {
  return [...new Set(records.map((record) => record.date?.slice(0, 7)).filter(Boolean))].sort().reverse();
}

export function renderBriefPage(ui) {
  const { state, escapeHtml } = ui;
  const months = briefMonths(state.records);
  state.brief ||= { month: months[0], country: "all" };
  const b = state.brief;
  $("#page-content").innerHTML = `${ui.heading("Monthly policy brief", "What governments decided this month, the most significant measures, and what to watch next. Choose a month and scope; download it to share.", "POLICY INTELLIGENCE")}
  <div class="content-grid"><section class="card span-12 report-builder"><div class="card-body"><div class="report-form report-form-wide">
    <label>Month<select id="brief-month">${months.map((key) => `<option value="${key}" ${key === b.month ? "selected" : ""}>${monthName(key)}</option>`).join("")}</select></label>
    <label>Scope<select id="brief-country"><option value="all">All countries</option>${ui.COUNTRIES.map((name) => `<option ${name === b.country ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></label>
    <div class="report-actions brief-actions"><button class="button button-outline" id="brief-prev">${ui.icon("chevron-left")}Previous month</button><button class="button button-outline" id="brief-print">${ui.icon("printer")}Print / Save PDF</button><button class="button button-outline" id="brief-word">${ui.icon("file-text")}Word</button><button class="button button-outline" id="brief-copy">${ui.icon("copy")}Copy text</button></div>
  </div></div></section>
  <section class="card span-12"><div class="card-body"><article class="generated-report" id="generated-report" aria-live="polite">${briefDocument(ui, state)}</article></div></section></div>`;
  $("#brief-month").addEventListener("change", (event) => { b.month = event.target.value; renderBriefPage(ui); });
  $("#brief-country").addEventListener("change", (event) => { b.country = event.target.value; renderBriefPage(ui); });
  const index = months.indexOf(b.month);
  $("#brief-prev").disabled = index >= months.length - 1;
  $("#brief-prev").addEventListener("click", () => { b.month = months[index + 1]; renderBriefPage(ui); });
  $("#brief-print").addEventListener("click", () => printDocument());
  $("#brief-word").addEventListener("click", () => exportWord(ui, $("#generated-report"), `policy-brief-${b.month}-${b.country}`));
  $("#brief-copy").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("#generated-report").innerText); ui.showToast("Brief copied."); } catch { ui.showToast("Clipboard access is unavailable.", "error"); } });
  ui.refreshIcons();
}

// Compact pointer to the latest brief for the overview page.
export function briefTeaser(ui) {
  const month = briefMonths(ui.state.records)[0];
  if (!month) return "";
  const s = monthStats(ui.state.records, month, "all");
  const vs = change(s.rows.length, s.baselineAvg);
  const laws = s.rows.filter((record) => ["legislation", "strategy"].some((key) => instrumentsOf(record).keys.includes(key))).length;
  const investments = s.rows.filter((record) => instrumentsOf(record).keys.includes("investment")).length;
  const top = pickSpread(s.rows, 1, false)[0];
  return `<section class="brief-teaser"><div class="brief-teaser-main"><div class="eyebrow">LATEST BRIEF · ${monthName(month).toUpperCase()}</div><p><strong>${num(s.rows.length)} measures</strong>${vs === null ? "" : ` (${changeWords(vs)} the 6-month average)`} · <strong>${num(laws)}</strong> laws, strategies or plans · <strong>${num(investments)}</strong> investment announcements${top ? `. Headline: ${ui.escapeHtml(short(top.country))}, ${ui.escapeHtml(sentence(top.description, 150))}` : ""}</p></div><button class="button button-gold" type="button" data-nav-to="brief">${ui.icon("newspaper")}Read the brief</button></section>`;
}

// =====================================================================
// Country profile and benchmarking
// =====================================================================
export function benchmark(countryRows, peerRows) {
  const peers = Object.fromEntries(approachProfile(peerRows).map((row) => [row.key, row]));
  return approachProfile(countryRows).map((row) => {
    const peer = peers[row.key]?.share || 0;
    const ratio = peer ? row.share / peer : null;
    const status = row.count >= 4 && ratio >= 1.3 ? "strength" : peer >= .06 && row.share < peer * .6 ? "gap" : "par";
    return { ...row, peer, ratio, status };
  });
}

// For a theme the country under-represents, the peer that leads it and an example worth studying.
function learningFrom(peerRows, key) {
  const byCountry = countBy(peerRows, (record) => record.country).map(([country, total]) => {
    const rows = peerRows.filter((record) => record.country === country && approachesOf(record).includes(key));
    return { country, total, rows, share: rows.length / total };
  }).filter((row) => row.rows.length >= 5).sort((a, b) => b.share - a.share);
  const leader = byCountry[0];
  if (!leader) return null;
  return { ...leader, example: pickSpread(leader.rows, 1, false)[0] };
}

function profileNarrative(ui, country, rows, peers, bench) {
  const all = [...rows, ...peers];
  const frameworks = rows.filter((record) => record.type === "framework").length;
  const dated = rows.filter((record) => record.date).map((record) => record.date).sort();
  const end = dated.length ? new Date(`${dated.at(-1)}T00:00:00Z`).getTime() : 0;
  const t = (record) => new Date(`${record.date}T00:00:00Z`).getTime();
  const recent = rows.filter((record) => record.date && t(record) > end - 365 * 864e5).length;
  const previous = rows.filter((record) => record.date && t(record) <= end - 365 * 864e5 && t(record) > end - 730 * 864e5).length;
  const top = bench.filter((row) => row.count).slice(0, 3);
  const strengths = bench.filter((row) => row.status === "strength").sort((a, b) => b.ratio - a.ratio).slice(0, 3);
  const gaps = bench.filter((row) => row.status === "gap").sort((a, b) => b.peer - a.peer).slice(0, 3);
  const inst = countBy(rows, (record) => instrumentsOf(record).keys);
  const instText = listJoin(["legislation", "strategy", "investment", "agreement", "programme"].map((key) => [key, inst.find(([k]) => k === key)?.[1] || 0]).filter(([, count]) => count).map(([key, count]) => `${num(count)} ${NOUNS[key][count === 1 ? 0 : 1]}`));
  const trend = previous ? (recent > previous * 1.1 ? `rising (${num(recent)} measures in the latest 12 months against ${num(previous)} the year before)` : recent < previous * .9 ? `slowing (${num(recent)} measures in the latest 12 months against ${num(previous)} the year before)` : `steady (${num(recent)} measures in the latest 12 months)`) : "";
  return [
    `${cap(short(country))} has <strong>${num(rows.length)} recorded food and agriculture policy measures</strong> in the current selection, ${pct(rows.length / (all.length || 1))} of the regional record${dated.length ? `, from ${ui.formatDate(dated[0])} to ${ui.formatDate(dated.at(-1))}` : ""}. ${frameworks ? `${num(frameworks)} are long-term frameworks.` : "All are short-term decisions."}${trend ? ` Activity is ${trend}.` : ""}`,
    top.length ? `Its policy concentrates on ${listJoin(top.map((row) => `${lower(row.label)} (${pct(row.share)} of measures)`))}.${strengths.length ? ` Compared with its regional peers it stands out for ${listJoin(strengths.map((row) => `${lower(row.label)} (${row.ratio.toFixed(1)}× the peer share)`))}.` : ""}` : "",
    gaps.length ? `Areas that are comparatively thin and worth investigating: ${listJoin(gaps.map((row) => `${lower(row.label)} (${pct(row.share)} against ${pct(row.peer)} among peers)`))}. A low share can reflect a genuine policy gap, a different national priority, or limited public reporting.` : "No policy area is markedly under-represented compared with regional peers.",
    instText ? `By instrument, the record includes ${instText}.` : "",
  ].filter(Boolean);
}

function foodContext(ui, food, country) {
  const diet = dietSummary(food).rows.find((row) => row.country === country && row.latest !== undefined);
  const prices = countryPriceSummary(food).find((row) => row.country === country);
  const parts = [];
  if (diet) parts.push(`A healthy diet cost <strong>${formatLocal(perMonth(diet.lcuLatest), country, { digits: ["BHD", "KWD", "OMR"].includes(CURRENCY[country]) ? 1 : 0 })}</strong> per person per month in ${diet.latestYear}, ${diet.lcuChange >= 0 ? "up" : "down"} ${Math.abs(Math.round(diet.lcuChange))}% since ${diet.firstYear} in local currency.${diet.puaLatest ? ` ${Number(diet.puaLatest.value).toFixed(1)}% of people could not afford it (${diet.puaLatest.year}).` : ""}`);
  else parts.push("FAO and the World Bank do not publish a healthy diet cost estimate for this country.");
  if (prices?.medianChange !== null && prices?.medianChange !== undefined) parts.push(`Prices received by farmers rose by a median ${Math.round(prices.medianChange)}% across ${num(prices.assessed)} commodities between ${prices.firstYear} and ${prices.latestYear}.`);
  else parts.push("Producer prices are not reported to FAOSTAT for this country.");
  return parts;
}

export function profileCards(ui, country, rows, peers) {
  const bench = benchmark(rows, peers);
  const narrative = profileNarrative(ui, country, rows, peers, bench);
  const shown = bench.filter((row) => row.count || row.peer >= .04).slice(0, 12).sort((a, b) => Math.max(b.share, b.peer) - Math.max(a.share, a.peer));
  const max = Math.max(.01, ...shown.map((row) => Math.max(row.share, row.peer)));
  const chip = (status) => status === "strength" ? `<span class="bench-chip chip-strength">Distinctive</span>` : status === "gap" ? `<span class="bench-chip chip-gap">Worth investigating</span>` : "";
  const benchRows = shown.map((row) => `<div class="bench-row"><div class="bench-label"><span>${ui.escapeHtml(row.label)}</span>${chip(row.status)}</div><div class="bench-bars"><div class="bench-bar bench-own" style="width:${row.share / max * 100}%"><span>${pct(row.share)}</span></div><div class="bench-bar bench-peer" style="width:${row.peer / max * 100}%"><span>${pct(row.peer)}</span></div></div></div>`).join("");
  const gaps = bench.filter((row) => row.status === "gap").sort((a, b) => b.peer - a.peer).slice(0, 3);
  const lessons = gaps.map((row) => ({ row, from: learningFrom(peers, row.key) })).filter((item) => item.from);
  const inst = countBy(rows, (record) => instrumentsOf(record).primary);
  const marked = bench.filter((row) => row.status !== "par").sort((a, b) => (a.status === b.status ? 0 : a.status === "strength" ? -1 : 1) || Math.abs(Math.log(b.ratio || .01)) - Math.abs(Math.log(a.ratio || .01)));
  const sgHtml = `<h3 class="mini-head">Strengths and gaps against peers</h3>${marked.length ? `<ul class="sg-list">${marked.map((row) => `<li>${chip(row.status)}<span>${ui.escapeHtml(row.label)}</span><strong>${pct(row.share)} vs ${pct(row.peer)}</strong></li>`).join("")}</ul>` : `<p class="muted-note">In line with peers across all policy areas.</p>`}<p class="muted-note">Distinctive: at least 1.3× the peer share. Worth investigating: below 60% of a peer share of 6% or more.</p>`;
  const instMax = Math.max(1, ...inst.map(([, count]) => count));
  const lessonHtml = lessons.length ? lessons.map(({ row, from }) => `<article class="lesson"><div class="lesson-head"><span class="bench-chip chip-gap">${ui.escapeHtml(row.label)}</span><span>${ui.escapeHtml(short(country))} ${pct(row.share)} · ${ui.escapeHtml(short(from.country))} ${pct(from.share)}</span></div><p><strong>${cap(ui.escapeHtml(short(from.country)))}</strong> gives this area the most weight among peers (${num(from.rows.length)} measures).${from.example ? ` Example worth studying (${ui.escapeHtml(ui.formatDate(from.example.date))}): “${ui.escapeHtml(sentence(from.example.description, 220))}”` : ""}</p></article>`).join("") : `<p class="muted-note">No area is markedly under-represented, so no peer comparison is suggested.</p>`;
  return {
    html: `<section class="card span-12 profile-summary"><div class="card-header"><div><h2 class="card-title">Policy profile at a glance</h2><p class="card-subtitle">Generated from the policy record and compared with the other six countries under the same filters.</p></div><div class="card-actions"><button class="button button-outline" id="profile-print">${ui.icon("printer")}Print / PDF</button><button class="button button-outline" id="profile-word">${ui.icon("file-text")}Download profile</button></div></div><div class="card-body profile-text">${narrative.map((text) => `<p>${text}</p>`).join("")}<p id="profile-food" class="profile-food"></p></div></section>
    <section class="card span-7"><div class="card-header"><div><h2 class="card-title">Benchmark against regional peers</h2><p class="card-subtitle">Share of measures addressing each policy area: ${ui.escapeHtml(short(country))} against the other six countries.</p></div></div><div class="card-body"><div class="legend-row bench-legend"><span class="legend-item"><i class="bench-own"></i>${ui.escapeHtml(cap(short(country)))}</span><span class="legend-item"><i class="bench-peer"></i>Peer average</span></div><div class="bench-list">${benchRows || `<p class="muted-note">Not enough measures to benchmark.</p>`}</div><p class="report-note">One measure can address several areas, so shares do not add up to 100%.</p></div></section>
    <section class="card span-5"><div class="card-header"><div><h2 class="card-title">Policy instruments</h2><p class="card-subtitle">What kind of action the measures are, by primary instrument.</p></div></div><div class="card-body"><div class="inst-list">${inst.map(([key, count]) => `<div class="inst-row"><span class="brief-tag tag-${key}">${instrumentShort(key)}</span><div class="inst-track"><i style="width:${count / instMax * 100}%"></i></div><strong>${num(count)}</strong></div>`).join("")}</div>${sgHtml}</div></section>
    <section class="card span-12"><div class="card-header"><div><h2 class="card-title">Approaches worth studying elsewhere</h2><p class="card-subtitle">For each comparatively thin area, the peer country that gives it the most weight, with an example measure.</p></div></div><div class="card-body lessons">${lessonHtml}</div></section>`,
    bind() {
      const food = loadFoodIndicators().then((data) => { const target = $("#profile-food"); if (target) target.innerHTML = `<strong>Food context.</strong> ${foodContext(ui, data, country).join(" ")}`; return data; }).catch(() => null);
      const doc = async () => {
        const data = await food;
        const foodText = data ? foodContext(ui, data, country).join(" ") : "";
        return `<div class="report-document"><header class="report-cover"><div class="eyebrow">COUNTRY POLICY PROFILE</div><h2>${ui.escapeHtml(country)}</h2><p class="report-meta">Food and agriculture policy · ${num(rows.length)} measures · prepared ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p></header>
        <section><h3>1. Profile at a glance</h3>${narrative.map((text) => `<p>${text}</p>`).join("")}${foodText ? `<p><strong>Food context.</strong> ${foodText}</p>` : ""}</section>
        <section><h3>2. Benchmark against regional peers</h3><table><thead><tr><th>Policy area</th><th>${ui.escapeHtml(country)}</th><th>Peer average</th><th>Assessment</th></tr></thead><tbody>${shown.map((row) => `<tr><td>${ui.escapeHtml(row.label)}</td><td>${pct(row.share)} (${num(row.count)})</td><td>${pct(row.peer)}</td><td>${row.status === "strength" ? "Distinctive" : row.status === "gap" ? "Worth investigating" : "In line"}</td></tr>`).join("")}</tbody></table></section>
        <section><h3>3. Approaches worth studying elsewhere</h3>${lessons.length ? `<ul class="narrative-list">${lessons.map(({ row, from }) => `<li><strong>${ui.escapeHtml(row.label)}:</strong> ${ui.escapeHtml(cap(short(from.country)))} gives this area ${pct(from.share)} of its measures, against ${pct(row.share)} for ${ui.escapeHtml(short(country))}.${from.example ? ` Example: “${ui.escapeHtml(sentence(from.example.description, 220))}”` : ""}</li>`).join("")}</ul>` : "<p>No area is markedly under-represented.</p>"}</section>
        <section><h3>4. Most significant measures</h3><ul class="narrative-list">${pickSpread(rows, 8, false).map((record) => `<li><strong>${ui.escapeHtml(ui.formatDate(record.date))}</strong> · ${instrumentShort(instrumentsOf(record).primary)}: ${ui.escapeHtml(sentence(record.description, 220))}</li>`).join("")}</ul></section>
        <section><h3>5. About this profile</h3><p>Generated from the monitored policy record and FAOSTAT indicators. Policy areas and instruments are identified from the wording of each measure and are indicative. “Worth investigating” marks areas where the share of measures is well below the peer average; it is a prompt for further review, not an assessment of performance.</p></section></div>`;
      };
      $("#profile-word")?.addEventListener("click", async () => { const holder = document.createElement("div"); holder.innerHTML = await doc(); exportWord(ui, holder, `${country}-policy-profile`); });
      $("#profile-print")?.addEventListener("click", async () => printDocument(await doc()));
    },
  };
}

// =====================================================================
// Thematic comparison across all seven countries
// =====================================================================
export function themeCard(ui, records) {
  const key = ui.state.compareTheme ||= "water";
  const label = approachLabel(key);
  const regional = records.length ? records.filter((record) => approachesOf(record).includes(key)).length / records.length : 0;
  const rows = ui.COUNTRIES.map((country) => {
    const all = records.filter((record) => record.country === country);
    const theme = all.filter((record) => approachesOf(record).includes(key));
    const share = all.length ? theme.length / all.length : 0;
    const status = theme.length >= 4 && share >= regional * 1.3 ? "strength" : all.length >= 10 && share < regional * .6 ? "gap" : "par";
    return { country, total: all.length, theme, share, status, strategic: theme.filter((record) => ["legislation", "strategy"].includes(instrumentsOf(record).primary)).length, example: pickSpread(theme, 1, false)[0] };
  }).sort((a, b) => b.share - a.share);
  const leaders = rows.filter((row) => row.status === "strength").map((row) => cap(short(row.country)));
  const gaps = rows.filter((row) => row.status === "gap").map((row) => short(row.country));
  const summary = `${label} accounts for ${pct(regional)} of measures across the region. ${leaders.length ? `${listJoin(leaders)} ${leaders.length > 1 ? "give" : "gives"} it clearly more weight than average` : "No country gives it markedly more weight than average"}${gaps.length ? `, while it is comparatively thin in ${listJoin(gaps)}` : ""}.`;
  const status = (row) => row.status === "strength" ? `<span class="bench-chip chip-strength">Leading</span>` : row.status === "gap" ? `<span class="bench-chip chip-gap">Worth investigating</span>` : `<span class="bench-chip">In line</span>`;
  const body = `<div class="theme-head"><label>Policy area<select id="theme-select">${APPROACHES.map((item) => `<option value="${item.key}" ${item.key === key ? "selected" : ""}>${ui.escapeHtml(item.label)}</option>`).join("")}</select></label><p>${ui.escapeHtml(summary)}</p></div><div class="table-wrap"><table class="data-table theme-table"><thead><tr><th>Country</th><th>Measures on this area</th><th>Share of country's measures</th><th>Laws, strategies &amp; plans</th><th>Position</th><th>Most significant measure</th></tr></thead><tbody>${rows.map((row) => `<tr><td><strong>${ui.escapeHtml(row.country)}</strong></td><td>${num(row.theme.length)}</td><td>${pct(row.share)}</td><td>${num(row.strategic)}</td><td>${status(row)}</td><td class="theme-example">${row.example ? `${ui.escapeHtml(sentence(row.example.description, 150))} <span class="muted-note">(${ui.escapeHtml(ui.formatDate(row.example.date))})</span>` : "–"}</td></tr>`).join("")}</tbody></table></div>`;
  return {
    html: ui.card("Thematic benchmark", "Compare how all seven countries address one policy area, under the current filters.", `<div id="theme-body">${body}</div>`, "span-12"),
    bind(rerender) { $("#theme-select")?.addEventListener("change", (event) => { ui.state.compareTheme = event.target.value; rerender(); }); },
  };
}
