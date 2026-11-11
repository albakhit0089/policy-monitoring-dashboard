// Policy intelligence: narrative monthly briefs, country and thematic reports, the Themes page and the Home story.
// Everything here is derived from the policy record; wording flags patterns to investigate, not verdicts.
import { APPROACHES, approachesOf, approachLabel, approachPhrase, approachProfile, examples } from "./policy-analysis.js?v=pi-20261018";
import { CURRENCY, countryPriceSummary, dietSummary, formatLocal, perMonth } from "./food-analysis.js?v=pi-20261018";

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
const pct = (value) => `${Math.round(value * 100)}%`;
const short = (country) => country === "United Arab Emirates" ? "the UAE" : country;
const cap = (text) => text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
const lower = (text) => text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
const listJoin = (items) => items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
export const monthName = (key) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const shiftMonth = (key, by) => { const [y, m] = key.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + by, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
const sentence = (text, limit = 240) => { const first = String(text || "").split(/(?<=[.!?])\s+/)[0] || ""; return first.length > limit ? `${first.slice(0, limit - 1).replace(/\s+\S*$/, "")}…` : first; };
const countBy = (rows, keyFn) => { const counts = new Map(); rows.forEach((row) => [].concat(keyFn(row)).forEach((key) => key && counts.set(key, (counts.get(key) || 0) + 1))); return [...counts.entries()].sort((a, b) => b[1] - a[1]); };
const time = (record) => new Date(`${record.date}T00:00:00Z`).getTime();
const YEAR = 365 * 864e5;
const $ = (selector) => document.querySelector(selector);
const paras = (...items) => items.flat().filter(Boolean).map((text) => `<p>${text}</p>`).join("");
const bullets = (items) => items.length ? `<ul class="narrative-list">${items.map((item) => `<li>${item}</li>`).join("")}</ul>` : "";

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

// Measures that best illustrate a policy area: strongest wording match, long-term frameworks, food relevance.
function fit(rows, key, count, used = null) {
  const pool = used ? rows.filter((record) => !used.has(record)) : rows;
  const picks = examples(pool.length ? pool : rows, key, count);
  const result = picks.length ? picks : pickSpread(pool.length ? pool : rows, count, false);
  if (used) result.forEach((record) => used.add(record));
  return result;
}
const onePerCountry = (rows) => rows.filter((record, i) => rows.findIndex((other) => other.country === record.country) === i);

// ---------- narrative vocabulary ----------
// Why each policy area matters for food security in the region, and what to follow up.
const THEME_TEXT = {
  production: { why: "Domestic production reduces exposure to import disruptions, but in water-scarce countries it has to be weighed against groundwater depletion and the cost of desalinated water.", watch: "whether new capacity suits local water limits, and whether announced projects reach operation" },
  technology: { why: "Controlled-environment farming, improved varieties and smart irrigation are the region's main route to higher output under heat and water stress.", watch: "uptake by ordinary producers beyond pilot projects, and the cost of the technology compared with imports" },
  water: { why: "Water is the binding constraint on agriculture across the Arabian Peninsula and in Yemen; how it is priced, allocated and saved decides which farming is viable.", watch: "enforcement of efficiency standards, controls on groundwater abstraction and the use of treated wastewater in agriculture" },
  cooperation: { why: "Agreements extend food security beyond national borders through supply contracts, investment in farmland abroad and technical partnerships.", watch: "the volumes actually delivered and the investment actually made, which public reporting rarely follows up" },
  supply: { why: "Strategic reserves, storage and logistics cushion the region against shipping disruptions and price shocks on world markets.", watch: "stock levels against targets, and how reserves are drawn on when shipping routes are disrupted" },
  trade: { why: "As net food importers, these countries rely on trade for most of their food; trade measures shape both supply security and the incentives facing domestic producers.", watch: "import and export bans and their effect on prices at home and in neighbouring markets" },
  markets: { why: "Measures on prices and markets act directly on what households pay for food.", watch: "whether price monitoring leads to enforcement, and how price controls affect supply" },
  finance: { why: "Subsidies, credit and insurance lower the cost of producing and investing, and decide who can take part in new agricultural programmes.", watch: "who benefits, large agribusiness or smallholders, and the fiscal cost over time" },
  climate: { why: "Soils, rangelands, mangroves and biodiversity determine whether production can be sustained as temperatures rise.", watch: "measurable targets such as restored land area, and coherence with plans to expand production" },
  safety: { why: "Food safety controls carry particular weight where most food is imported, protecting consumers and access to export markets.", watch: "inspection results and recalls, and the consistency of standards across the region" },
  livestock: { why: "Livestock and animal health shape local meat and dairy supply, which depends heavily on imported feed.", watch: "disease outbreaks, dependence on imported feed and restrictions on the live animal trade" },
  fisheries: { why: "Fisheries and aquaculture provide protein and coastal livelihoods, and aquaculture is a growing area of investment.", watch: "stock protection such as seasonal fishing bans, and whether aquaculture expansion meets its targets" },
  capacity: { why: "Training and extension decide whether new technologies and practices actually reach producers.", watch: "reach to smallholders and women farmers, and whether training is linked to programme uptake" },
  social: { why: "These measures decide whether vulnerable households can afford and access food, not only whether food is available.", watch: "the coverage of food assistance in Yemen and the targeting of support as healthy-diet costs rise" },
  governance: { why: "Laws, strategies and institutions set the long-term direction within which day-to-day decisions are taken.", watch: "the implementing regulations, budgets and progress reports that show a strategy is being carried out" },
};
const weightWords = (share) => share >= .35 ? "the dominant strand" : share >= .22 ? "a major strand" : share >= .12 ? "a significant strand" : share >= .05 ? "a secondary strand" : "a marginal strand";
const activityWords = (ratio) => ratio >= 1.35 ? "an unusually busy month" : ratio >= 1.1 ? "a busier month than usual" : ratio > .9 ? "a typical month" : ratio > .7 ? "a quieter month than usual" : "an unusually quiet month";
const activityShort = (ratio) => ratio >= 1.35 ? "Unusually busy" : ratio >= 1.1 ? "Busier than usual" : ratio > .9 ? "Typical" : ratio > .7 ? "Quieter than usual" : "Unusually quiet";
const ratioWords = (ratio) => ratio >= 2 ? "far more intensively than" : "noticeably more than";
const COUNTRY_TERMS = { "Saudi Arabia": /saudi|riyadh|jeddah|neom|kingdom|mewa/i, "United Arab Emirates": /emirat|\bUAE\b|abu dhabi|dubai|sharjah/i, Oman: /oman|muscat|dhofar|salalah|sohar/i, Qatar: /qatar|doha/i, Kuwait: /kuwait/i, Bahrain: /bahrain|manama/i, Yemen: /yemen|aden|sana|hodeidah|hadramout|taiz|marib/i };

// One measure as a readable sentence that always names its country.
function prose(ui, record, { limit = 240, date = true } = {}) {
  let text = sentence(record.description, limit);
  if (!COUNTRY_TERMS[record.country]?.test(text.slice(0, 110))) text = /^In\s/.test(text) ? `${cap(short(record.country))}: ${text}` : `In ${short(record.country)}, ${/^(The|A|An|According|As|Under|With|Following|After|During|Through|To)\s/.test(text) ? lower(text) : text}`;
  return `${ui.escapeHtml(text)}${date ? ` <span class="report-date">(${ui.escapeHtml(ui.formatDate(record.date))})</span>` : ""}`;
}
// Recent and previous 12-month share of an area, to say whether it is gaining or losing attention.
function trendOf(rows, key) {
  const dated = rows.filter((record) => record.date);
  if (dated.length < 30) return null;
  const end = Math.max(...dated.map(time));
  const recent = dated.filter((record) => time(record) > end - YEAR), previous = dated.filter((record) => time(record) <= end - YEAR && time(record) > end - 2 * YEAR);
  if (recent.length < 12 || previous.length < 12) return null;
  const share = (list) => list.filter((record) => approachesOf(record).includes(key)).length / list.length;
  const ratio = share(previous) ? share(recent) / share(previous) : null;
  return ratio === null ? null : ratio >= 1.25 ? "rising" : ratio <= .8 ? "falling" : "stable";
}
const trendWords = (trend) => trend === "rising" ? "and it has been gaining attention over the past year" : trend === "falling" ? "although it has received less attention over the past year" : trend === "stable" ? "and attention to it has been broadly stable over the past year" : "";
const about = (text) => paras(text, "Policy areas and instruments are identified from the wording of each measure, so the analysis is indicative. Measures are short summaries of public reporting, not legal texts; check the original source before citing a decision.");

// =====================================================================
// Monthly brief (narrative)
// =====================================================================
function monthStats(records, month, country) {
  const scoped = country === "all" ? records : records.filter((record) => record.country === country);
  const inMonth = (key) => scoped.filter((record) => record.date?.startsWith(key));
  const rows = inMonth(month);
  const baselineMonths = [1, 2, 3, 4, 5, 6].map((i) => shiftMonth(month, -i));
  const baselineRows = baselineMonths.flatMap(inMonth);
  const available = baselineMonths.filter((key) => scoped.some((record) => record.date?.startsWith(key))).length || 1;
  return { rows, baselineRows, baselineAvg: baselineRows.length / available, available };
}
export function briefMonths(records) {
  return [...new Set(records.map((record) => record.date?.slice(0, 7)).filter(Boolean))].sort().reverse();
}

function monthSummary(ui, records, month, country) {
  const s = monthStats(records, month, country);
  const region = country === "all";
  const scope = region ? "the GCC States and Yemen" : short(country);
  if (!s.rows.length) return { s, empty: true, scope };
  const profile = approachProfile(s.rows).filter((row) => row.count);
  const base = Object.fromEntries(approachProfile(s.baselineRows).map((row) => [row.key, row.count / s.available]));
  const rising = profile.filter((row) => row.count >= 3 && row.count >= (base[row.key] || 0) * 1.5 + 1).sort((a, b) => (b.count - (base[b.key] || 0)) - (a.count - (base[a.key] || 0)));
  const ratio = s.baselineAvg ? s.rows.length / s.baselineAvg : 1;
  const leaders = countBy(s.rows, (record) => record.country);
  const top = profile.slice(0, 2);
  const risingNew = rising.find((row) => !top.some((item) => item.key === row.key));
  let lead = `${monthName(month)} was ${activityWords(ratio)} for food and agriculture policy in ${scope}. Policy centred on ${lower(top[0].label)}${top[1] ? `, followed by ${lower(top[1].label)}` : ""}${risingNew ? `, with clearly growing attention to ${lower(risingNew.label)}` : ""}.`;
  if (region && leaders.length > 1) lead += leaders[0][1] / s.rows.length >= .4 ? ` ${cap(short(leaders[0][0]))} accounted for much of the activity, followed by ${short(leaders[1][0])}.` : ` ${cap(short(leaders[0][0]))} and ${short(leaders[1][0])} were the most active.`;
  return { s, scope, region, profile, rising, ratio, leaders, lead, key: pickSpread(s.rows, 3, region) };
}

export function monthlyReport(ui, records, { month, country = "all" }) {
  const m = monthSummary(ui, records, month, country);
  const subtitle = `${country === "all" ? "GCC States & Yemen" : country} · ${monthName(month)}`;
  if (m.empty) return { title: "Monthly policy brief", subtitle, sections: [["Summary", paras(`No food and agriculture policy developments were recorded for ${m.scope} in ${monthName(month)}. This most likely reflects gaps in public reporting rather than an absence of policy activity.`), ""]] };
  const { s, region, profile, rising, ratio, leaders } = m;
  const used = new Set(m.key);
  const developments = profile.filter((row) => row.count >= 2).slice(0, 3).map((row, i) => {
    const pool = row.rows.filter((record) => !used.has(record));
    const picks = fit(row.rows, row.key, 2, used);
    const actors = [...new Set(row.rows.map((record) => record.country))];
    const role = i === 0 ? "was the leading theme of the month" : rising.some((item) => item.key === row.key) ? "drew more attention than usual" : "was also prominent";
    return `<h4>${ui.escapeHtml(row.label)}</h4>${paras(`${cap(approachPhrase(row.key))} ${role}${region && actors.length > 1 ? `, with action in ${listJoin(actors.map(short))}` : ""}. ${picks.map((record) => prose(ui, record)).join(" ")}`)}<p class="report-why"><strong>Why it matters.</strong> ${THEME_TEXT[row.key].why}</p>`;
  }).join("");
  const countryNotes = region ? (() => {
    const active = ui.COUNTRIES.filter((name) => s.rows.some((record) => record.country === name));
    const quiet = ui.COUNTRIES.filter((name) => !active.includes(name));
    const notes = active.map((name) => {
      const rows = s.rows.filter((record) => record.country === name);
      const focus = approachProfile(rows).filter((row) => row.count)[0];
      const avg = s.baselineRows.filter((record) => record.country === name).length / s.available;
      const pace = avg >= 4 ? (rows.length >= avg * 1.5 ? " Activity was well above its usual level." : rows.length <= avg * .5 ? " Activity was well below its usual level." : "") : "";
      const headline = pickSpread(rows.filter((record) => !m.key.includes(record)), 1, false)[0] || rows[0];
      return `<p><strong>${ui.escapeHtml(name)}.</strong> ${focus ? `Activity centred on ${lower(focus.label)}.` : ""}${pace} ${prose(ui, headline)}</p>`;
    }).join("");
    return notes + (quiet.length ? paras(`No developments were recorded for ${listJoin(quiet.map(short))} this month, which most likely reflects reporting coverage rather than an absence of policy.`) : "");
  })() : (() => {
    const regionRows = monthStats(records, month, "all").rows.filter((record) => record.country !== country);
    const own = approachProfile(s.rows), others = Object.fromEntries(approachProfile(regionRows).map((row) => [row.key, row.share]));
    const distinct = own.filter((row) => row.count >= 2 && others[row.key] !== undefined && row.share >= (others[row.key] || .01) * 1.5).slice(0, 2);
    return paras(distinct.length ? `Compared with the rest of the region this month, ${short(country)} put more emphasis on ${listJoin(distinct.map((row) => lower(row.label)))}.` : `${cap(short(country))}'s priorities this month broadly followed the regional pattern.`);
  })();
  const watch = [];
  onePerCountry(s.rows.filter(restrictionOf)).slice(0, 2).forEach((record) => watch.push(`<strong>Trade restriction in ${ui.escapeHtml(short(record.country))}.</strong> ${ui.escapeHtml(sentence(restrictionOf(record), 220))} Its effect on prices and on supply to neighbouring markets is worth following.`));
  s.rows.filter((record) => ["legislation", "strategy"].includes(instrumentsOf(record).primary)).slice(0, 2).forEach((record) => watch.push(`<strong>Implementation.</strong> ${prose(ui, record, { limit: 180 })} The implementing decisions, budget and first results will show whether it changes practice.`));
  const consumer = s.rows.filter((record) => approachesOf(record).some((key) => key === "markets" || key === "social")).length / s.rows.length;
  if (consumer < .12) watch.push(`<strong>Affordability.</strong> Few of the month's measures act on food prices or on support to vulnerable households, while the cost of a healthy diet keeps rising across the region. This remains the thinnest strand of policy.`);
  if (rising[0]) watch.push(`<strong>${ui.escapeHtml(rising[0].label)}.</strong> Attention to this area rose this month. Follow ${THEME_TEXT[rising[0].key].watch}.`);
  if (region) leaders.filter(([name, count]) => { const avg = s.baselineRows.filter((record) => record.country === name).length / s.available; return avg >= 5 && count >= avg * 1.6; }).slice(0, 1).forEach(([name]) => watch.push(`<strong>${ui.escapeHtml(cap(short(name)))}.</strong> Policy activity was well above its usual level. It is worth checking whether a policy push or a specific event lies behind it.`));
  return {
    title: "Monthly policy brief", subtitle,
    highlights: [["Activity", activityShort(ratio)], ["Leading theme", profile[0].label], [region ? "Most active" : "Second theme", region ? leaders[0][0] : profile[1]?.label || "–"], ["Rising", rising[0]?.label || "No marked shift"]],
    sections: [
      ["Summary", `${paras(m.lead, "Three decisions stand out:")}${bullets(m.key.map((record) => prose(ui, record, { limit: 260 })))}`, ""],
      ["Main developments", developments, ""],
      [region ? "Country notes" : "In regional context", countryNotes, ""],
      ["What to watch", bullets(watch), ""],
      ["About this brief", about(`This brief covers measures dated ${monthName(month)}, compared with the previous six months. Decisions are ranked by their instrument, with laws, strategies and large stated investments first.`), ""],
    ],
  };
}

// =====================================================================
// Country report (narrative) and profile cards
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
// For an area a country under-represents, the peer that gives it most weight and an example worth studying.
function learningFrom(peerRows, key) {
  const leader = countBy(peerRows, (record) => record.country).map(([country, total]) => {
    const rows = peerRows.filter((record) => record.country === country && approachesOf(record).includes(key));
    return { country, total, rows, share: rows.length / total };
  }).filter((row) => row.rows.length >= 5).sort((a, b) => b.share - a.share)[0];
  return leader ? { ...leader, example: fit(leader.rows, key, 1)[0] } : null;
}
function foodContext(food, country) {
  const diet = dietSummary(food).rows.find((row) => row.country === country && row.latest !== undefined);
  const prices = countryPriceSummary(food).find((row) => row.country === country);
  const parts = [];
  if (diet) parts.push(`A healthy diet cost about ${formatLocal(perMonth(diet.lcuLatest), country, { digits: ["BHD", "KWD", "OMR"].includes(CURRENCY[country]) ? 1 : 0 })} per person per month in ${diet.latestYear}, ${diet.lcuChange >= 0 ? "up" : "down"} ${Math.abs(Math.round(diet.lcuChange))}% since ${diet.firstYear} in local currency.${diet.puaLatest ? ` ${Number(diet.puaLatest.value).toFixed(1)}% of people could not afford it in ${diet.puaLatest.year}.` : ""}`);
  else parts.push("FAO and the World Bank do not publish an estimate of the cost of a healthy diet for this country, so affordability cannot be tracked from these sources.");
  if (prices?.medianChange !== null && prices?.medianChange !== undefined) parts.push(`Prices received by farmers ${prices.medianChange >= 0 ? "rose" : "fell"} by a median ${Math.abs(Math.round(prices.medianChange))}% between ${prices.firstYear} and ${prices.latestYear}.`);
  else parts.push("Producer prices are not reported to FAOSTAT for this country.");
  return parts.join(" ");
}

function countryAnalysis(rows, peers) {
  const bench = benchmark(rows, peers);
  const dated = rows.filter((record) => record.date);
  const end = dated.length ? Math.max(...dated.map(time)) : 0;
  const recent = dated.filter((record) => time(record) > end - YEAR).length, previous = dated.filter((record) => time(record) <= end - YEAR && time(record) > end - 2 * YEAR).length;
  return {
    bench, end,
    top: bench.filter((row) => row.count).slice(0, 3),
    strengths: bench.filter((row) => row.status === "strength").sort((a, b) => b.ratio - a.ratio).slice(0, 2),
    gaps: bench.filter((row) => row.status === "gap").sort((a, b) => b.peer - a.peer).slice(0, 3),
    pace: previous >= 10 ? (recent > previous * 1.15 ? "picked up" : recent < previous * .85 ? "slowed" : "held steady") : null,
    rising: bench.filter((row) => row.count >= 6 && trendOf(rows, row.key) === "rising").slice(0, 1),
  };
}
function countrySummaryText(country, a) {
  const name = cap(short(country));
  if (!a.top.length) return [`No measures are recorded for ${short(country)} in the current selection.`];
  return [
    `${name}'s food and agriculture policy is oriented above all towards ${listJoin(a.top.slice(0, 2).map((row) => approachPhrase(row.key)))}.${a.strengths.length ? ` It stands out in the region for ${listJoin(a.strengths.map((row) => lower(row.label)))}, which it pursues ${ratioWords(a.strengths[0].ratio)} its neighbours.` : ""}${a.gaps.length ? ` By contrast, ${listJoin(a.gaps.map((row) => lower(row.label)))} ${a.gaps.length > 1 ? "receive" : "receives"} comparatively little attention.` : ""}`,
    a.pace ? `Policy activity has ${a.pace} over the past year${a.rising.length ? `, with attention moving towards ${lower(a.rising[0].label)}` : ""}.` : "",
  ].filter(Boolean);
}

export function countryReport(ui, records, country, food) {
  const rows = records.filter((record) => record.country === country), peers = records.filter((record) => record.country !== country);
  const a = countryAnalysis(rows, peers);
  if (!rows.length) return { title: "Country policy report", subtitle: country, sections: [["Summary", paras(`No measures are recorded for ${short(country)} in this scope.`), ""]] };
  const used = new Set();
  const direction = a.top.map((row) => {
    const picks = fit(row.rows, row.key, 2, used);
    return `<h4>${ui.escapeHtml(row.label)}</h4>${paras(`This is ${weightWords(row.share)} of ${short(country)}'s policy${row.status === "strength" ? ", and one in which it leads the region" : ""}. ${picks.map((record) => prose(ui, record)).join(" ")}`)}<p class="report-why"><strong>Why it matters.</strong> ${THEME_TEXT[row.key].why}</p>`;
  }).join("");
  const lessons = a.gaps.map((row) => ({ row, from: learningFrom(peers, row.key) })).filter((item) => item.from?.example);
  const compare = paras(
    a.strengths.length ? `${cap(short(country))}'s most distinctive commitments are to ${listJoin(a.strengths.map((row) => lower(row.label)))}. ${THEME_TEXT[a.strengths[0].key].why}` : `${cap(short(country))}'s policy mix broadly follows the regional pattern, without an area it pursues markedly more than its neighbours.`,
    a.gaps.length ? `Areas that receive comparatively little attention are ${listJoin(a.gaps.map((row) => lower(row.label)))}. A thin area can reflect a genuine gap, a different national priority or limited public reporting, so each deserves a closer look rather than a conclusion.` : "",
    ...lessons.map(({ row, from }) => `On ${lower(row.label)}, ${short(from.country)} offers the clearest regional reference. ${prose(ui, from.example)}`),
  );
  const recentRows = rows.filter((record) => record.date && time(record) > a.end - YEAR);
  const decisions = pickSpread(recentRows.length ? recentRows : rows, 5, false);
  const watch = [
    ...recentRows.filter((record) => ["legislation", "strategy"].includes(instrumentsOf(record).primary)).sort((x, y) => y.date.localeCompare(x.date)).slice(0, 2).map((record) => `<strong>Implementation.</strong> ${prose(ui, record, { limit: 180 })} Watch for the implementing decisions, budget and results.`),
    ...recentRows.filter(restrictionOf).slice(0, 1).map((record) => `<strong>Trade restriction.</strong> ${ui.escapeHtml(sentence(restrictionOf(record), 200))} Its effect on prices and supply is worth following.`),
    ...a.top.slice(0, 1).map((row) => `<strong>${ui.escapeHtml(row.label)}.</strong> As the main strand of policy, follow ${THEME_TEXT[row.key].watch}.`),
    ...a.gaps.slice(0, 1).map((row) => `<strong>${ui.escapeHtml(row.label)}.</strong> Check whether the limited attention reflects policy or reporting, and follow ${THEME_TEXT[row.key].watch}.`),
  ];
  return {
    title: "Country policy report", subtitle: country,
    highlights: [["Main focus", a.top[0]?.label || "–"], ["Distinctive in region", a.strengths[0]?.label || "None marked"], ["Thin area", a.gaps[0]?.label || "None marked"], ["Activity trend", a.pace ? cap(a.pace) : "–"]],
    sections: [
      ["Summary", paras(countrySummaryText(country, a)), ""],
      ["Policy direction", direction, ""],
      ["How it compares with the region", compare, ""],
      ["Food security context", paras(food ? foodContext(food, country) : "Food indicators are loading."), ""],
      ["Recent significant decisions", bullets(decisions.map((record) => prose(ui, record, { limit: 240 }))), ""],
      ["What to watch", bullets(watch), ""],
      ["About this report", about("The country is compared with the other six countries under the same scope. An area is described as distinctive when its share of measures is at least 1.3 times the peer share, and as comparatively thin when it is below 60% of a peer share of 6% or more."), ""],
    ],
  };
}

export function profileCards(ui, country, rows, peers) {
  const a = countryAnalysis(rows, peers);
  const shown = a.bench.filter((row) => row.count || row.peer >= .04).slice(0, 12).sort((x, y) => Math.max(y.share, y.peer) - Math.max(x.share, x.peer));
  const max = Math.max(.01, ...shown.map((row) => Math.max(row.share, row.peer)));
  const chip = (status) => status === "strength" ? `<span class="bench-chip chip-strength">Distinctive</span>` : status === "gap" ? `<span class="bench-chip chip-gap">Worth a closer look</span>` : "";
  const lessons = a.gaps.map((row) => ({ row, from: learningFrom(peers, row.key) })).filter((item) => item.from?.example);
  const benchRows = shown.map((row) => `<div class="bench-row"><div class="bench-label"><span>${ui.escapeHtml(row.label)}</span>${chip(row.status)}</div><div class="bench-bars"><div class="bench-bar bench-own" style="width:${row.share / max * 100}%"><span>${pct(row.share)}</span></div><div class="bench-bar bench-peer" style="width:${row.peer / max * 100}%"><span>${pct(row.peer)}</span></div></div></div>`).join("");
  return {
    html: `<section class="card span-12 profile-summary"><div class="card-body"><div class="story-head"><div><div class="eyebrow">IN SHORT</div>${countrySummaryText(country, a).map((text) => `<p class="story-lead">${text}</p>`).join("")}</div><button class="button button-gold" type="button" id="open-country-report">${ui.icon("file-text")}Read the full country report</button></div>
      <div class="insight-row">${[["Main focus", a.top[0]?.label], ["Distinctive in the region", a.strengths[0]?.label], ["Worth a closer look", a.gaps[0]?.label]].map(([label, value]) => `<div class="insight"><span>${label}</span><strong>${ui.escapeHtml(value || "Nothing marked")}</strong></div>`).join("")}</div></div></section>
    <section class="card span-7"><div class="card-header"><div><h2 class="card-title">How ${ui.escapeHtml(short(country))} compares with its neighbours</h2><p class="card-subtitle">Share of measures addressing each policy area, against the average of the other six countries.</p></div></div><div class="card-body"><div class="legend-row bench-legend"><span class="legend-item"><i class="bench-own"></i>${ui.escapeHtml(cap(short(country)))}</span><span class="legend-item"><i class="bench-peer"></i>Peer average</span></div><div class="bench-list">${benchRows || `<p class="muted-note">Not enough measures to compare.</p>`}</div></div></section>
    <section class="card span-5"><div class="card-header"><div><h2 class="card-title">Ideas from neighbours</h2><p class="card-subtitle">For each area that gets little attention, the peer that does most, with an example.</p></div></div><div class="card-body lessons-stack">${lessons.length ? lessons.map(({ row, from }) => `<article class="lesson"><div class="lesson-head"><span class="bench-chip chip-gap">${ui.escapeHtml(row.label)}</span><strong>${ui.escapeHtml(cap(short(from.country)))}</strong></div><p>${prose(ui, from.example, { limit: 220 })}</p></article>`).join("") : `<p class="muted-note">No area stands out as thin compared with the neighbours.</p>`}</div></section>`,
    bind(openReport) { $("#open-country-report")?.addEventListener("click", () => openReport({ type: "country", country })); },
  };
}

// =====================================================================
// Thematic review (narrative), Themes page and Home story
// =====================================================================
function themeAnalysis(records, key) {
  const regional = records.length ? records.filter((record) => approachesOf(record).includes(key)).length / records.length : 0;
  const countries = COUNTRY_LIST.map((country) => {
    const all = records.filter((record) => record.country === country);
    const theme = all.filter((record) => approachesOf(record).includes(key));
    const share = all.length ? theme.length / all.length : 0;
    const status = theme.length >= 4 && share >= regional * 1.3 ? "strength" : all.length >= 10 && share < regional * .6 ? "gap" : "par";
    return { country, total: all.length, theme, share, status };
  }).sort((a, b) => b.share - a.share);
  return { regional, countries, trend: trendOf(records, key), leaders: countries.filter((row) => row.status === "strength"), thin: countries.filter((row) => row.status === "gap"), rows: records.filter((record) => approachesOf(record).includes(key)) };
}
const COUNTRY_LIST = ["Bahrain", "Kuwait", "Oman", "Qatar", "Saudi Arabia", "United Arab Emirates", "Yemen"];
function themeSummaryText(key, t) {
  const label = approachLabel(key);
  return `${label} is ${weightWords(t.regional)} of food and agriculture policy across the GCC States and Yemen${t.trend ? `, ${trendWords(t.trend)}` : ""}. ${t.leaders.length ? `${listJoin(t.leaders.map((row) => cap(short(row.country))))} ${t.leaders.length > 1 ? "give" : "gives"} it the most weight` : "No country gives it markedly more weight than the others"}${t.thin.length ? `, while it receives comparatively little attention in ${listJoin(t.thin.map((row) => short(row.country)))}` : ""}.`;
}

export function themeReport(ui, records, key) {
  const t = themeAnalysis(records, key);
  const label = approachLabel(key);
  const doing = t.countries.filter((row) => row.theme.length >= 2).map((row) => {
    const role = row.status === "strength" ? "A leading priority" : row.share >= t.regional * .6 ? "A regular part of policy" : "A minor part of policy";
    return `<p><strong>${ui.escapeHtml(row.country)}.</strong> ${role}. ${fit(row.theme, key, row.status === "strength" ? 2 : 1).map((record) => prose(ui, record)).join(" ")}</p>`;
  }).join("");
  const leader = t.leaders[0] || t.countries.find((row) => row.theme.length >= 5);
  const reference = leader && fit(leader.theme, key, 1)[0];
  const end = Math.max(0, ...t.rows.filter((record) => record.date).map(time));
  const recent = pickSpread(t.rows.filter((record) => record.date && time(record) > end - YEAR / 4), 3, true);
  return {
    title: "Thematic policy review", subtitle: label,
    highlights: [["Weight in regional policy", cap(weightWords(t.regional).replace(/^the |^a /, ""))], ["Trend", t.trend ? cap(t.trend) : "–"], ["Leads", t.leaders.map((row) => row.country).join(", ") || "No clear leader"], ["Thin in", t.thin.map((row) => row.country).join(", ") || "None marked"]],
    sections: [
      ["Summary", paras(themeSummaryText(key, t), THEME_TEXT[key].why), ""],
      ["What governments are doing", doing || paras("Too few measures address this area to describe country approaches."), ""],
      ["Gaps and opportunities", paras(t.thin.length ? `In ${listJoin(t.thin.map((row) => short(row.country)))}, ${lower(label)} receives comparatively little attention. This can reflect a genuine gap, a different national priority or limited public reporting.` : "No country stands out as markedly behind its neighbours in this area.", reference && t.thin.length ? `${cap(short(leader.country))}'s experience offers a regional reference: ${prose(ui, reference)}` : ""), ""],
      ["Latest developments", recent.length ? bullets(recent.map((record) => prose(ui, record))) : paras("No developments in the latest three months."), ""],
      ["What to watch", paras(`Follow ${THEME_TEXT[key].watch}.`), ""],
      ["About this review", about("A country leads an area when its share of measures on it is at least 1.3 times the regional share, and is comparatively thin below 60% of it."), ""],
    ],
  };
}

export function renderThemesPage(ui, openReport) {
  const records = ui.filtered();
  const key = ui.state.compareTheme ||= "water";
  const cards = APPROACHES.map((item) => {
    const share = records.length ? records.filter((record) => approachesOf(record).includes(item.key)).length / records.length : 0;
    const trend = trendOf(records, item.key);
    return { item, share, trend };
  }).sort((a, b) => b.share - a.share);
  const t = themeAnalysis(records, key);
  const max = Math.max(...cards.map((entry) => entry.share), .01);
  const status = (row) => row.status === "strength" ? `<span class="bench-chip chip-strength">Leads</span>` : row.status === "gap" ? `<span class="bench-chip chip-gap">Little attention</span>` : `<span class="bench-chip">Regular</span>`;
  $("#page-content").innerHTML = `${ui.heading("Policy themes", "How the GCC States and Yemen approach each area of food and agriculture policy: who leads, what they are doing and where the gaps are.", "THEMES")}
  <div class="content-grid themes-layout">
    <section class="card span-4 theme-picker-card"><div class="card-header"><div><h2 class="card-title">Policy areas</h2><p class="card-subtitle">Ordered by weight in regional policy, with the trend over the past year.</p></div></div><div class="card-body"><div class="theme-picker" role="list">${cards.map(({ item, share, trend }) => `<button type="button" class="theme-pick${item.key === key ? " active" : ""}" data-theme-key="${item.key}" aria-pressed="${item.key === key}"><span class="theme-pick-label">${ui.escapeHtml(item.label)}</span><span class="theme-pick-meta"><i style="width:${share / max * 100}%"></i></span><span class="theme-pick-trend trend-${trend || "none"}">${trend === "rising" ? "▲ Rising" : trend === "falling" ? "▼ Falling" : trend === "stable" ? "Stable" : ""}</span></button>`).join("")}</div></div></section>
    <div class="span-8 theme-detail"><section class="card profile-summary"><div class="card-body"><div class="story-head"><div><div class="eyebrow">${ui.escapeHtml(approachLabel(key).toUpperCase())}</div><p class="story-lead">${themeSummaryText(key, t)}</p><p class="story-sub">${THEME_TEXT[key].why}</p></div><button class="button button-gold" type="button" id="open-theme-report">${ui.icon("file-text")}Read the full thematic review</button></div></div></section>
    ${ui.card("Country by country", "How each country addresses this area, with a representative measure.", `<div class="theme-countries">${t.countries.map((row) => { const example = fit(row.theme, key, 1)[0]; return `<article class="theme-country"><div class="theme-country-head"><strong>${ui.escapeHtml(row.country)}</strong>${status(row)}</div><div class="inst-track"><i style="width:${Math.min(100, row.share / Math.max(.01, t.countries[0].share) * 100)}%"></i></div><p>${example ? prose(ui, example, { limit: 200 }) : `<span class="muted-note">No measures on this area in the current selection.</span>`}</p></article>`; }).join("")}</div>`, "")}</div>
  </div>`;
  document.querySelectorAll("[data-theme-key]").forEach((button) => button.addEventListener("click", () => { ui.state.compareTheme = button.dataset.themeKey; renderThemesPage(ui, openReport); ui.renderTabs?.(); }));
  $("#open-theme-report").addEventListener("click", () => openReport({ type: "theme", theme: key }));
  // On narrow screens the picker scrolls sideways; keep the chosen area in view.
  const picker = $(".theme-picker"), active = $(".theme-pick.active");
  if (picker && active && picker.scrollWidth > picker.clientWidth) picker.scrollLeft = active.offsetLeft - picker.offsetLeft - 8;
  ui.refreshIcons();
}

// The Home page story: this month in a few sentences, the decisions that stand out, and where to go next.
export function homeStory(ui) {
  const month = briefMonths(ui.state.records)[0];
  if (!month) return "";
  const m = monthSummary(ui, ui.state.records, month, "all");
  if (m.empty) return "";
  return `<section class="home-story"><div class="home-story-text"><div class="eyebrow">THIS MONTH · ${monthName(month).toUpperCase()}</div><p class="story-lead">${m.lead}</p><div class="story-decisions">${m.key.map((record) => `<article class="story-decision"><span class="brief-tag tag-${instrumentsOf(record).primary}">${instrumentShort(instrumentsOf(record).primary)}</span><p>${prose(ui, record, { limit: 170 })}</p></article>`).join("")}</div></div><div class="home-story-actions"><button class="button button-gold" type="button" data-open-report="monthly">${ui.icon("newspaper")}Read this month's brief</button><button class="button button-outline" type="button" data-nav-to="country">${ui.icon("map-pinned")}Explore a country</button><button class="button button-outline" type="button" data-nav-to="themes">${ui.icon("shapes")}Compare by theme</button></div></section>`;
}
