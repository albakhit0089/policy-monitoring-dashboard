import { approachesOf, approachLabel, approachPhrase, approachProfile, approachShifts, distinctiveApproaches, examples } from "./policy-analysis.js?v=pi-20261007";
import { CURRENCY, countryPriceSummary, dietComponents, dietSummary, formatLocal, perMonth, priceChanges } from "./food-analysis.js?v=pi-20261007";

const REPORT_TYPES = {
  analysis: "Policy and food security analysis",
  food: "Food prices and affordability brief",
  monthly: "Monthly monitoring update",
};
const AUDIENCES = ["Senior government officials", "FAO management", "Technical specialists", "General policy audience"];
const MARKET_PATTERN = /price|market|subsid|reserve|stock|import|export|trade/i;
const DAY = 86400000;
const $ = (selector) => document.querySelector(selector);
const num = (value) => Number(value).toLocaleString("en-GB");
const share = (part, whole) => whole ? Math.round(part / whole * 100) : 0;
const listJoin = (items) => items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
const shortName = (country) => country === "United Arab Emirates" ? "the UAE" : country;
const startName = (country) => shortName(country).replace(/^the /, "The ");
const lower = (text) => text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
const time = (record) => new Date(`${record.date}T00:00:00Z`).getTime();
const longDate = (date) => date ? new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "an undated day";
const monthName = (key) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const monthlyLocal = (daily, country) => formatLocal(perMonth(daily), country, { digits: ["BHD", "KWD", "OMR"].includes(CURRENCY[country]) ? 1 : 0 });
const paras = (...items) => items.flat().filter(Boolean).map((text) => `<p>${text}</p>`).join("");

// Words for a comparison between two counts, e.g. "312, down from 416 in the 12 months before (25% fewer)".
function compareCounts(recent, previous, period = "in the 12 months before") {
  const counted = `${num(recent)} measure${recent === 1 ? " was" : "s were"} recorded`;
  if (!previous && !recent) return "no measures were recorded, and none in the 12 months before";
  if (!previous) return `${counted}, with none ${period}`;
  const change = Math.round((recent - previous) / previous * 100);
  if (Math.abs(change) < 5) return `${counted}, broadly unchanged from ${num(previous)} ${period}`;
  return `${counted}, ${recent > previous ? "up" : "down"} from ${num(previous)} ${period} (${Math.abs(change)}% ${recent > previous ? "more" : "fewer"})`;
}
function firstSentence(text, limit = 280) {
  const sentence = String(text || "").split(/(?<=[.!?])\s+/)[0].trim();
  if (sentence.length <= limit) return sentence;
  const cut = sentence.slice(0, limit);
  return `${cut.slice(0, cut.lastIndexOf(" ") > limit * .6 ? cut.lastIndexOf(" ") : limit).replace(/[,;:s]+$/, "")}…`;
}

// ---------- scope ----------
function periodOptions(ui) {
  const years = [...new Set(ui.state.records.map((record) => record.year).filter(Boolean))].sort((a, b) => b - a);
  return [["all", "All periods"], ["last12", "Last 12 months"], ...years.map((year) => [String(year), String(year)])];
}
function scopeRecords(ui, r, { ignoreCountry = false } = {}) {
  const latest = ui.latestDate(ui.state.records);
  const end = latest ? new Date(`${latest}T00:00:00Z`).getTime() : Date.now();
  return ui.state.records.filter((record) => {
    if (!ignoreCountry && r.country !== "all" && record.country !== r.country) return false;
    if (r.domain !== "all" && record.domain !== r.domain) return false;
    if (r.instrument !== "all" && record.type !== r.instrument) return false;
    if (r.period === "last12") return record.date && time(record) > end - 365 * DAY;
    if (r.period !== "all") return String(record.year) === r.period;
    return true;
  });
}
function scopeLabel(r) {
  const parts = [r.country === "all" ? "GCC States & Yemen" : r.country];
  if (r.domain !== "all") parts.push(r.domain);
  if (r.instrument !== "all") parts.push(r.instrument === "decision" ? "Short-term decisions" : "Long-term frameworks");
  parts.push(r.period === "all" ? "All periods" : r.period === "last12" ? "Last 12 months" : r.period);
  return parts.join(" · ");
}

// ---------- analysis over policy records ----------
function analyse(ui, records) {
  const dated = records.filter((record) => record.date).sort((a, b) => a.date.localeCompare(b.date));
  const first = dated[0]?.date, latest = dated.at(-1)?.date;
  const end = latest ? time({ date: latest }) : Date.now();
  const growth = (rows) => ({ recent: rows.filter((record) => record.date && time(record) > end - 365 * DAY).length, previous: rows.filter((record) => record.date && time(record) > end - 730 * DAY && time(record) <= end - 365 * DAY).length });
  const countries = ui.COUNTRIES.map((country) => {
    const rows = records.filter((record) => record.country === country);
    const recent = rows.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return { country, rows, count: rows.length, growth: growth(rows), decision: ui.totalCount(rows, "decision"), framework: ui.totalCount(rows, "framework"), domains: ui.groupCount(rows, (record) => record.domain), institutions: ui.groupCount(rows, (record) => record.institution), latestRecord: recent[0], consumer: rows.filter((record) => record.family === "Consumer oriented").length };
  }).sort((a, b) => b.count - a.count);
  const domains = ui.groupCount(records, (record) => record.domain).map(([domain, count]) => ({ domain, count, growth: growth(records.filter((record) => record.domain === domain)), countries: new Set(records.filter((record) => record.domain === domain).map((record) => record.country)).size }));
  const emerging = domains.filter((row) => row.growth.recent >= 5 && row.growth.recent > row.growth.previous * 1.5).sort((a, b) => (b.growth.recent - b.growth.previous) - (a.growth.recent - a.growth.previous)).slice(0, 4);
  const monthly = ui.aggregateMonthly(records);
  return { records, total: records.length, first, latest, growth: growth(records), countries, domains, emerging, groups: ui.groupCount(records, (record) => record.group), families: ui.groupCount(records, (record) => record.family), institutions: ui.groupCount(records, (record) => record.institution), monthly, years: ui.groupCount(records, (record) => record.year).sort((a, b) => a[0] - b[0]), perMonth: records.length / (monthly.length || 1), peak: monthly.slice().sort((a, b) => b[1].total - a[1].total)[0], decision: ui.totalCount(records, "decision"), framework: ui.totalCount(records, "framework") };
}

// ---------- supporting visuals (string SVG so they print and export cleanly) ----------
function svgMonthlyBars(monthly, months = 24) {
  const data = monthly.slice(-months);
  if (data.length < 2) return "";
  const width = 680, height = 170, left = 34, bottom = 24, top = 8, gap = 3;
  const max = Math.max(...data.map(([, value]) => value.total));
  const bar = (width - left - gap * (data.length - 1)) / data.length;
  const y = (value) => top + (height - top - bottom) * (1 - value / max);
  return `<figure class="report-figure"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Monthly policy measures">${[0, Math.round(max / 2), max].map((tick) => `<line x1="${left}" x2="${width}" y1="${y(tick)}" y2="${y(tick)}" stroke="#e3eaef"/><text x="${left - 6}" y="${y(tick) + 4}" text-anchor="end" font-size="10" fill="#6b7f8c">${tick}</text>`).join("")}${data.map(([key, value], i) => `<rect x="${(left + i * (bar + gap)).toFixed(1)}" y="${y(value.total).toFixed(1)}" width="${bar.toFixed(1)}" height="${(height - bottom - y(value.total)).toFixed(1)}" rx="2" fill="#116aab"><title>${key}: ${value.total}</title></rect>${i % 3 === 0 ? `<text x="${(left + i * (bar + gap) + bar / 2).toFixed(1)}" y="${height - 8}" text-anchor="middle" font-size="10" fill="#6b7f8c">${key.slice(2).replace("-", "/")}</text>` : ""}`).join("")}</svg><figcaption>Figure: policy measures recorded per month, last ${data.length} months.</figcaption></figure>`;
}
function table(headers, rows, caption) {
  return `<div class="report-table-wrap">${caption ? `<p class="report-table-caption">${caption}</p>` : ""}<table class="report-table"><thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

// ---------- narrative sections ----------
function recentNarrative(ui, records, limit) {
  const rows = records.filter((record) => record.date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
  if (!rows.length) return "<p>No dated measures are available in this selection.</p>";
  return `<p>The most recent measures in the selection show the current direction of policy:</p><ul class="narrative-list">${rows.map((record) => `<li><strong>${startName(record.country)}, ${longDate(record.date)}.</strong> ${ui.escapeHtml(firstSentence(record.description, 300))}${ui.safeUrl(record.source) ? ` <a href="${ui.escapeHtml(record.source)}">Source</a>` : ""}</li>`).join("")}</ul>`;
}

// Food narrative: diet paragraphs first, the producer-price paragraph always last.
function foodNarrative(food, country) {
  const diet = dietSummary(food);
  const prices = countryPriceSummary(food);
  const components = dietComponents(food);
  const out = [];
  if (country) {
    const row = diet.rows.find((item) => item.country === country);
    if (row) {
      const rank = diet.rows.slice().sort((a, b) => b.latest - a.latest).findIndex((item) => item.country === country) + 1;
      out.push(`In ${row.latestYear}, a healthy diet cost ${formatLocal(row.lcuLatest, country)} per person per day in ${shortName(country)}, or roughly ${monthlyLocal(row.lcuLatest, country)} a month. That is ${Math.abs(row.lcuChange).toFixed(0)}% ${row.lcuChange >= 0 ? "more" : "less"} than in ${row.firstYear} in local currency. Adjusted for price levels it equals $${row.latest.toFixed(2)} a day, ${rank === 1 ? "the highest" : rank === diet.rows.length ? "the lowest" : `the ${ORDINALS[rank - 1]} highest`} of the ${diet.rows.length} GCC countries covered.${row.puaLatest ? ` FAOSTAT estimates that ${row.puaLatest.value}% of the population could not afford a healthy diet in ${row.puaLatest.year}.` : ""}`);
      const parts = components.rows.find((item) => item.country === country);
      if (parts) { const sorted = Object.entries(parts.parts).sort((a, b) => b[1] - a[1]); out.push(`In ${components.year}, ${lower(sorted[0][0])} were the largest single cost in the diet (${share(sorted[0][1], parts.total)}%), followed by ${lower(sorted[1][0])} (${share(sorted[1][1], parts.total)}%).`); }
    } else out.push(`FAOSTAT does not publish cost of a healthy diet estimates for ${shortName(country)}, so affordability cannot be assessed from this source.`);
    const priceRow = prices.find((item) => item.country === country);
    if (!priceRow) out.push(`No FAOSTAT producer price data is available for ${shortName(country)}.`);
    else if (priceRow.medianChange === null) out.push(`FAOSTAT reports the same producer price for each of ${shortName(country)}'s ${priceRow.series} commodities in every year, which points to carried-forward estimates rather than observed prices; no price trend can be drawn from it.`);
    else if (country === "Yemen") out.push(`Prices received by Yemeni farmers rose sharply: the median increase across ${priceRow.assessed} commodities was ${Math.round(priceRow.medianUsdChange)}% in US dollars and ${Math.round(priceRow.medianChange)}% in rial between ${priceRow.firstYear} and ${priceRow.latestYear}. Much of the rial increase reflects currency depreciation, which also erodes household purchasing power.`);
    else {
      const top = priceChanges(food, "lcu").filter((item) => item.country === country && !item.flat).sort((a, b) => b.change - a.change).slice(0, 3);
      out.push(`Across ${priceRow.assessed} commodities with measurable change, the median farm-gate price ${priceRow.medianChange >= 0 ? "rose" : "fell"} ${Math.abs(priceRow.medianChange).toFixed(0)}% between ${priceRow.firstYear} and ${priceRow.latestYear}${priceRow.assessed < 5 ? ", although this rests on very few series" : ""}.${top.length ? ` The largest increases were for ${listJoin(top.map((item) => `${lower(item.item)} (${Math.round(item.change)}%)`))}.` : ""}`);
    }
    return out;
  }
  const sorted = diet.rows.slice().sort((a, b) => b.latest - a.latest);
  const local = diet.rows.slice().sort((a, b) => b.lcuChange - a.lcuChange);
  out.push(`A healthy diet cost between $${diet.lowest.latest.toFixed(2)} (${shortName(diet.lowest.country)}) and $${diet.highest.latest.toFixed(2)} (${shortName(diet.highest.country)}) per person per day in ${diet.latestYear}, in dollars adjusted for price levels. In local money this means, for example, ${listJoin(sorted.slice(0, 3).map((row) => `${formatLocal(row.lcuLatest, row.country)} a day in ${shortName(row.country)}`))}. Since ${diet.firstYear} the cost has risen in every country covered, from ${Math.round(local.at(-1).lcuChange)}% in ${shortName(local.at(-1).country)} to ${Math.round(local[0].lcuChange)}% in ${shortName(local[0].country)} in local-currency terms.`);
  const pua = diet.rows.filter((row) => row.puaLatest);
  if (pua.length) out.push(`Where it is measured, unaffordability is low: ${listJoin(pua.map((row) => `${row.puaLatest.value}% of the population in ${shortName(row.country)}`))} could not afford a healthy diet in ${pua[0].puaLatest.year}. FAOSTAT does not report this indicator for the other GCC countries and does not cover Yemen, where affordability is the most pressing concern.`);
  if (components.rows.length) {
    const avg = components.groups.map((group) => [group, components.rows.reduce((sum, row) => sum + (row.parts[group] || 0), 0) / components.rows.length]).sort((a, b) => b[1] - a[1]);
    const total = avg.reduce((sum, [, value]) => sum + value, 0);
    const staples = avg.find(([group]) => group === "Starchy staples");
    out.push(`In ${components.year}, ${lower(avg[0][0])} accounted for ${share(avg[0][1], total)}% of the average healthy diet cost and ${lower(avg[1][0])} for ${share(avg[1][1], total)}%${staples ? `, while starchy staples made up ${share(staples[1], total)}%` : ""}. The cost of a nutritious diet therefore depends much more on these food groups than on cereals.`);
  }
  const gcc = prices.filter((row) => row.country !== "Yemen" && row.medianChange !== null && row.assessed >= 5);
  const yemen = prices.find((row) => row.country === "Yemen");
  const flat = prices.filter((row) => row.medianChange === null || row.flatSeries / row.series > .5).map((row) => row.country);
  out.push(`Prices received by farmers moved unevenly.${gcc.length ? ` The median farm-gate price ${listJoin(gcc.map((row) => `${row.medianChange > 0.5 ? `rose ${Math.round(row.medianChange)}%` : row.medianChange < -0.5 ? `fell ${Math.abs(Math.round(row.medianChange))}%` : "was unchanged"} in ${shortName(row.country)}`))} between ${food.prices.years[0]} and the latest year available.` : ""}${yemen && yemen.medianUsdChange !== null ? ` In Yemen, farm-gate prices ${yemen.medianUsdChange > 90 ? "roughly doubled" : `rose ${Math.round(yemen.medianUsdChange)}%`} in US dollar terms, and rose far more in rial as the currency depreciated.` : ""}${flat.length ? ` Figures for ${listJoin(flat.map(shortName))} repeat the same value every year and cannot be used to judge price trends.` : ""} The UAE does not report producer prices to FAOSTAT.`);
  return out;
}
function foodVisuals(food, country) {
  const diet = dietSummary(food);
  const rows = diet.rows.filter((row) => !country || row.country === country);
  const prices = countryPriceSummary(food).filter((row) => !country || row.country === country);
  return `${rows.length ? table(["Country", "Per person per day", "Per month", `Change since ${diet.firstYear}`, "PPP $ per day"], rows.map((row) => [row.country, formatLocal(row.lcuLatest, row.country), monthlyLocal(row.lcuLatest, row.country), `${row.lcuChange >= 0 ? "+" : ""}${row.lcuChange.toFixed(1)}%`, `$${row.latest.toFixed(2)}`]), "Table: cost of a healthy diet (FAOSTAT), local currency.") : ""}${prices.length ? table(["Country", "Commodities assessable", "Median farm-gate price change", "Period"], prices.map((row) => [row.country, `${row.assessed} of ${row.series}`, row.medianChange === null ? "Not assessable (repeated values)" : row.country === "Yemen" ? `${Math.round(row.medianUsdChange)}% in USD` : `${row.medianChange >= 0 ? "+" : ""}${row.medianChange.toFixed(0)}%`, `${row.firstYear}–${row.latestYear}`]), "Table: farm-gate (producer) prices, FAOSTAT.") : ""}`;
}

function methodNarrative(food, r) {
  return paras(
    `This report was generated from the Policy Intelligence monitoring record for the GCC States and Yemen: short summaries of food and agriculture policy measures compiled from public sources and classified by instrument, family, group and domain. The scope was ${scopeLabel(r)}. Counts reflect what was recorded, not the full universe of policy activity. Comparisons of the latest 12 months with the 12 months before are anchored on the most recent dated record in the selection.`,
    `Food cost figures come from FAOSTAT: the cost and affordability of a healthy diet (2020–2025) and annual producer prices (${food.prices.years[0]}–${food.prices.years.at(-1)}). Producer prices are the prices received by farmers, not retail prices. Live-weight meat duplicates and non-food items were removed, USD values inconsistent with official currency pegs were recalculated, and series that repeat one value every year were excluded from trend statistics.`,
    "Policy measures are summaries, not legal texts. Consult each original source before relying on a specific finding.",
  );
}

// ---------- content-based policy narrative ----------
// Context sentences are general background on each approach; every figure and example comes from the record.
const APPROACH_CONTEXT = {
  production: "Growing more food at home is a long-standing objective in a region that imports most of what it eats.",
  technology: "Technology is presented as the main route to higher yields under extreme heat and scarce water.",
  water: "Water is the binding constraint on agriculture across the Arabian Peninsula, where groundwater is being depleted and desalinated water is costly.",
  cooperation: "Agreements extend food security beyond national borders through supply arrangements, investment abroad and technical partnerships.",
  supply: "Reserves, storage and logistics are meant to cushion import disruptions and price shocks.",
  trade: "As net food importers, these countries use trade policy both to keep supplies flowing and to support domestic producers.",
  markets: "Measures in this area act directly on what consumers pay.",
  finance: "Financial support lowers the cost of production and investment for farmers and agribusinesses.",
  climate: "These measures address the natural resource base on which future production depends.",
  safety: "Food safety controls carry particular weight where most food is imported.",
  livestock: "Livestock measures focus on herd health, feed supply and local meat and dairy output.",
  fisheries: "Fisheries provide protein and livelihoods for coastal communities and are a growing focus for aquaculture investment.",
  capacity: "Training and extension determine whether new technologies and practices are actually adopted by producers.",
  social: "These measures address whether vulnerable households can access food, rather than whether food is available.",
  governance: "Laws, strategies and new institutions set the long-term framework within which shorter-term measures operate.",
};
const SUPPLY_SIDE = ["production", "technology", "water", "supply", "finance", "livestock", "fisheries", "trade", "cooperation"];
const DEMAND_SIDE = ["markets", "social", "safety"];
const pctOf = (value) => `${Math.round(value * 100)}%`;
const oneIn = (raw) => { const share = Math.round(raw * 100) / 100; return share >= .45 ? `almost half of all measures (${pctOf(share)})` : share >= .37 ? `about two in five measures (${pctOf(share)})` : share >= .3 ? `about one in three measures (${pctOf(share)})` : share >= .23 ? `about one in four measures (${pctOf(share)})` : share >= .1 ? `about one in ${Math.round(1 / share)} measures (${pctOf(share)})` : `a small minority of measures (${pctOf(share)})`; };
const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh"];
const ratioWords = (ratio) => ratio >= 3.5 ? `${Math.round(ratio)} times the rate elsewhere in the region` : ratio >= 1.8 ? "about twice the rate elsewhere in the region" : "noticeably more than elsewhere in the region";

// Quoted excerpt; the sentence's own full stop is dropped so the surrounding sentence can close it.
function quote(ui, record, limit = 220, { withCountry = true } = {}) {
  const excerpt = firstSentence(record.description, limit).replace(/[.!?]$/, "");
  return `${withCountry ? `${shortName(record.country)} (${longDate(record.date)})` : `a measure of ${longDate(record.date)}`}: “${ui.escapeHtml(excerpt)}”`;
}
function leadingCountries(rows) {
  return countBy(rows, (record) => record.country).slice(0, 2);
}
function countBy(rows, keyFn) {
  const counts = new Map();
  rows.forEach((row) => { const key = keyFn(row); if (key) counts.set(key, (counts.get(key) || 0) + 1); });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function directionSummary(profile) {
  const top = profile.slice(0, 3);
  const supply = profile.filter((row) => SUPPLY_SIDE.includes(row.key)).reduce((sum, row) => sum + row.count, 0);
  const demand = profile.filter((row) => DEMAND_SIDE.includes(row.key)).reduce((sum, row) => sum + row.count, 0);
  const lead = `policy has been shaped above all by ${listJoin(top.map((row) => lower(row.label)))}`;
  const balance = supply > demand * 4
    ? "The overall orientation is towards securing and expanding food supply; measures that act on what consumers pay or on access to food for vulnerable households are far less common."
    : supply > demand * 2
      ? "Supply-side measures clearly outweigh measures aimed at consumers and vulnerable households, although the latter are present."
      : "Supply-side and consumer-facing measures are relatively balanced.";
  return { lead, balance };
}

function executiveSummary(ui, ctx) {
  const { a, profile, subject, country, region, shifts, food } = ctx;
  const { lead, balance } = directionSummary(profile);
  const p1 = `Between ${longDate(a.first)} and ${longDate(a.latest)}, food and agriculture ${lead} in ${subject}. ${balance}`;
  let p2;
  if (country) {
    const own = distinctiveApproaches(a.records, region.records.filter((record) => record.country !== country), { minRatio: 1.2, minCount: 4 }).slice(0, 2);
    const under = approachProfile(a.records).filter((row) => row.count >= 0).map((row) => ({ ...row, base: approachProfile(region.records.filter((record) => record.country !== country)).find((item) => item.key === row.key)?.share || 0 })).filter((row) => row.base > .08 && row.share < row.base * .6).slice(0, 1);
    p2 = own.length
      ? `Compared with the rest of the region, ${shortName(country)} places particular weight on ${listJoin(own.map((row) => `${lower(row.label)} (${pctOf(row.share)} of its measures, ${ratioWords(row.ratio)})`))}${under.length ? `, and comparatively little on ${lower(under[0].label)}` : ""}. ${startName(country)} accounts for ${share(a.total, region.total)}% of the region's recorded measures in this scope.`
      : `${startName(country)}'s policy mix broadly mirrors the regional pattern, and it accounts for ${share(a.total, region.total)}% of the region's recorded measures in this scope.`;
  } else {
    const profiles = a.countries.filter((row) => row.count >= 15).map((row) => ({ country: row.country, top: distinctiveApproaches(row.rows, a.records.filter((record) => record.country !== row.country), { minRatio: 1.25, minCount: 4 })[0] })).filter((row) => row.top);
    const grouped = new Map(); profiles.forEach((row) => grouped.set(row.top.key, [...(grouped.get(row.top.key) || []), row.country]));
    p2 = profiles.length ? `Within this shared direction, countries pursue distinct emphases: ${listJoin([...grouped.entries()].map(([key, names], i) => `${i === 0 ? listJoin(names.map(startName)) : listJoin(names.map(shortName))} ${i === 0 ? (names.length > 1 ? "stand out for" : "stands out for") : "for"} ${lower(approachLabel(key))}`))}, each relative to the rest of the region. ${startName(a.countries[0].country)} and ${shortName(a.countries[1].country)} together account for ${share(a.countries[0].count + a.countries[1].count, a.total)}% of the record, so regional patterns largely reflect their priorities.` : "";
  }
  const rising = shifts.filter((row) => row.points >= 1).slice(0, 2);
  const falling = shifts.filter((row) => row.points <= -1).slice(-2).reverse();
  const p3 = `${rising.length ? `Over the past year, attention has moved towards ${listJoin(rising.map((row) => lower(row.label)))}` : "Policy attention has been broadly stable over the past year"}${falling.length ? `${rising.length ? "," : ""} while ${listJoin(falling.map((row) => lower(row.label)))} ${falling.length > 1 ? "have" : "has"} received less` : ""}. In the most recent 12 months, ${compareCounts(a.growth.recent, a.growth.previous)}. ${food[0] || ""}`;
  return paras(p1, p2, p3);
}

function directionsSection(ui, ctx, limit) {
  const { profile, country } = ctx;
  return profile.filter((row) => row.count >= 3).slice(0, limit).map((row) => {
    const leaders = leadingCountries(row.rows);
    const picks = examples(row.rows, row.key, 2);
    const frameworks = row.rows.filter((record) => record.type === "framework").length;
    return `<p><strong>${row.label}.</strong> ${APPROACH_CONTEXT[row.key]} In this record, ${oneIn(row.share)} concern ${approachPhrase(row.key)}${row.countries > 1 ? `, across ${row.countries} countries, led by ${listJoin(leaders.map(([name, count]) => `${shortName(name)} (${num(count)})`))}` : ""}${frameworks ? `; ${num(frameworks)} of them are long-term frameworks such as strategies, plans or laws` : ""}. ${picks.length ? `Examples include ${picks.map((record) => quote(ui, record, 220, { withCountry: !country })).join("; and ")}.` : ""}</p>`;
  }).join("") + `<p class="report-note">Approaches are identified from the text of each measure; one measure can address several approaches, so shares do not add up to 100%.</p>`;
}

function countryProfile(ui, row, a, extended) {
  if (!row.count) return `<p><strong>${row.country}.</strong> No measures were recorded for ${shortName(row.country)} in this selection.</p>`;
  const others = a.records.filter((record) => record.country !== row.country);
  const distinct = distinctiveApproaches(row.rows, others, { minRatio: 1.2, minCount: Math.min(4, Math.max(2, Math.round(row.count / 15))) }).slice(0, 2);
  const main = approachProfile(row.rows).slice(0, 2);
  const focus = distinct.length ? distinct : main;
  const picks = examples(row.rows.filter((record) => approachesOf(record).includes(focus[0]?.key)), focus[0]?.key, extended ? 2 : 1);
  const growth = row.growth.previous ? (row.growth.recent > row.growth.previous * 1.1 ? "Activity has picked up over the past year" : row.growth.recent < row.growth.previous * .9 ? "Activity has slowed over the past year" : "Activity has been steady over the past year") : "";
  const emphasis = distinct.length
    ? `is distinguished by its focus on ${listJoin(distinct.map((item) => `${lower(item.label)} (${pctOf(item.share)} of its measures, ${ratioWords(item.ratio)})`))}`
    : `concentrates on ${listJoin(main.map((item) => `${lower(item.label)} (${pctOf(item.share)} of its measures)`))}`;
  return `<p><strong>${row.country}.</strong> ${startName(row.country)}'s record of ${num(row.count)} measures ${emphasis}. ${picks.length ? `Typical of this focus is ${picks.map((record) => quote(ui, record, 200, { withCountry: false })).join("; and ")}.` : ""} ${row.framework ? `It has adopted ${num(row.framework)} long-term framework${row.framework === 1 ? "" : "s"}, ` : "Its measures are all short-term decisions, "}and the domains it addresses most are ${listJoin(row.domains.slice(0, 2).map(([domain]) => lower(ui.escapeHtml(domain))))}. ${growth ? `${growth} (${num(row.growth.recent)} measures in the latest 12 months against ${num(row.growth.previous)} the year before).` : ""}</p>`;
}

function shiftsSection(ui, ctx) {
  const { shifts, a } = ctx;
  if (!shifts.length) return paras("The selection does not cover two full years of records, so shifts in policy attention cannot be assessed.");
  const rising = shifts.filter((row) => row.points >= .8).slice(0, 3);
  const falling = shifts.filter((row) => row.points <= -.8).slice(-3).reverse();
  const end = Math.max(...a.records.filter((record) => record.date).map(time));
  const recentRows = a.records.filter((record) => record.date && time(record) > end - 365 * DAY);
  const risingExamples = rising.slice(0, 2).map((row) => examples(recentRows.filter((record) => approachesOf(record).includes(row.key)), row.key, 1)[0]).filter(Boolean);
  return paras(
    rising.length ? `Comparing the latest 12 months with the year before, the clearest gains in policy attention were in ${listJoin(rising.map((row) => `${lower(row.label)} (from ${pctOf(row.previousShare)} to ${pctOf(row.recentShare)} of attention)`))}.` : "No approach gained markedly in policy attention over the past year.",
    risingExamples.length ? `Recent examples: ${risingExamples.map((record) => quote(ui, record, 200)).join("; and ")}.` : "",
    falling.length ? `Attention declined for ${listJoin(falling.map((row) => `${lower(row.label)} (from ${pctOf(row.previousShare)} to ${pctOf(row.recentShare)})`))}. A lower share does not necessarily mean less effort: it can also reflect other priorities growing faster.` : "",
    `"Attention" here is each approach's share of all approach mentions across measures, which keeps the comparison fair as descriptions become more detailed over time.`,
  );
}

function responseSection(ui, ctx) {
  const { a, profile, country, foodCtx } = ctx;
  const find = (key) => profile.find((row) => row.key === key) || { count: 0, share: 0 };
  const markets = find("markets"), social = find("social"), supply = find("supply"), trade = find("trade");
  const sentences = [...foodCtx];
  sentences.push(`Against this cost picture, measures acting on prices and markets make up ${pctOf(markets.share)} of the ${country ? `${shortName(country)} ` : ""}record and measures addressing nutrition or assistance to vulnerable households ${pctOf(social.share)}, compared with ${pctOf(supply.share)} for supply security and reserves and ${pctOf(trade.share)} for trade measures. ${markets.share + social.share < .15 ? "Rising diet costs have therefore been met mainly through supply-side policy rather than direct support to consumers." : "Consumer-facing measures form a visible part of the response."}`);
  const consumerExample = examples(a.records.filter((record) => approachesOf(record).some((key) => key === "markets" || key === "social")), null, 1)[0];
  if (consumerExample) sentences.push(`An example of a consumer-facing measure comes from ${quote(ui, consumerExample, 220)}.`);
  return paras(sentences);
}

function attentionPoints(ui, ctx) {
  const { a, profile, country, food } = ctx;
  const items = [];
  const find = (key) => profile.find((row) => row.key === key) || { share: 0 };
  const diet = dietSummary(food);
  if (find("markets").share + find("social").share < .15) items.push(`Consumer affordability is a thin strand of policy. With healthy-diet costs up ${country && diet.rows.find((row) => row.country === country) ? `${Math.round(diet.rows.find((row) => row.country === country).lcuChange)}%` : `${Math.round(Math.min(...diet.rows.map((row) => row.lcuChange)))}–${Math.round(Math.max(...diet.rows.map((row) => row.lcuChange)))}%`} since ${diet.firstYear}, measures on prices, nutrition and assistance to vulnerable groups merit more attention, and monitoring should track whether such measures are under-reported.`);
  if (find("water").share > .25 && find("production").share > .25) items.push("Production expansion and water policy advance side by side. Assessing whether new production capacity is consistent with water conservation targets would strengthen policy coherence.");
  if (a.framework / a.total < .08) items.push(`Long-term frameworks are rare (${share(a.framework, a.total)}% of measures). Most action consists of one-off decisions, which makes it harder to judge strategic direction and continuity.`);
  if (find("cooperation").share > .2) items.push("International agreements are a growing instrument of food security. Their implementation, including actual supply volumes and investment flows, is rarely visible in public reporting and deserves follow-up.");
  if (!country) { const quiet = a.countries.filter((row) => row.count > 0 && row.count < a.total * .03).map((row) => shortName(row.country)); if (quiet.length) items.push(`${listJoin(quiet)} ${quiet.length > 1 ? "have" : "has"} very few recorded measures. This more likely reflects limited public reporting than limited policy activity, and source coverage should be reviewed.`); }
  items.push("Data gaps remain: no healthy-diet cost estimates for Yemen, no producer prices for the UAE, unaffordability reported only for Qatar and the UAE, and repeated values in several producer price series.");
  return `<ul class="narrative-list">${items.map((item) => `<li>${item}</li>`).join("")}</ul><p class="report-note">These points follow from the recorded data and indicate where to look more closely; they are not policy recommendations.</p>`;
}

function latestSection(ui, records, limit) {
  const dated = records.filter((record) => record.date);
  if (!dated.length) return "<p>No dated measures are available in this selection.</p>";
  const end = Math.max(...dated.map(time));
  const quarter = dated.filter((record) => time(record) > end - 92 * DAY);
  const top = approachProfile(quarter).slice(0, 3).filter((row) => row.count);
  return `${top.length ? `<p>In the last three months of the record (${num(quarter.length)} measures), policy centred on ${listJoin(top.map((row) => lower(row.label)))}. The most recent measures:</p>` : ""}${recentNarrative(ui, records, limit).replace(/^<p>[^<]*<\/p>/, "")}`;
}

function analysisReport(ui, food, r) {
  const records = scopeRecords(ui, r);
  const country = r.country !== "all" ? r.country : null;
  const a = analyse(ui, records);
  const region = analyse(ui, scopeRecords(ui, r, { ignoreCountry: true }));
  const subject = `${country ? shortName(country) : "the GCC States and Yemen"}${r.domain !== "all" ? ` (${lower(ui.escapeHtml(r.domain))})` : ""}`;
  const extended = r.length === "extended";
  const profile = approachProfile(records);
  const foodText = foodNarrative(food, country);
  const ctx = { a, region, profile, subject, country, shifts: approachShifts(records), food: foodText, foodCtx: foodText };
  const sections = [
    ["Executive summary", executiveSummary(ui, { ...ctx, food: [foodText[0]] }), ""],
    ["Main policy directions", directionsSection(ui, ctx, extended ? 7 : 5), table(["Approach", "Measures", "Share of measures", "Countries"], profile.slice(0, 10).map((row) => [row.label, num(row.count), pctOf(row.share), row.countries]), "Table: policy approaches identified in the measures.")],
  ];
  if (!country) sections.push(["Country profiles", `<p>Each country's profile below highlights where its policy mix differs from the rest of the region.</p>${a.countries.map((row) => countryProfile(ui, row, a, extended)).join("")}`, table(["Country", "Measures", "Share", "Last 12 months", "12 months before"], a.countries.map((row) => [row.country, num(row.count), `${share(row.count, a.total)}%`, num(row.growth.recent), num(row.growth.previous)]), "Table: measures by country.")]);
  sections.push(["Shifts in policy attention", shiftsSection(ui, ctx), svgMonthlyBars(a.monthly)]);
  sections.push(["Food costs and the policy response", responseSection(ui, ctx), foodVisuals(food, country)]);
  sections.push(["Latest developments", latestSection(ui, records, extended ? 10 : 5), ""]);
  sections.push(["Points for attention", attentionPoints(ui, { a, profile, country, food }), ""]);
  sections.push(["About this report", methodNarrative(food, r) + paras("Policy approaches are identified by matching the text of each measure against a fixed set of themes (for example water, trade, research, social protection). The classification is indicative and can miss or over-count measures whose wording is unusual."), ""]);
  const kept = r.length === "short" ? sections.filter(([title]) => ["Executive summary", "Main policy directions", "Latest developments", "Points for attention"].includes(title)) : sections;
  return { title: REPORT_TYPES.analysis, subtitle: country || "GCC States & Yemen", sections: kept };
}

function foodReport(ui, food, r) {
  const country = r.country !== "all" ? r.country : null;
  const records = scopeRecords(ui, r);
  const a = analyse(ui, records);
  const text = foodNarrative(food, country);
  const dietText = text.slice(0, -1), priceText = text.at(-1);
  const row = country && a.countries.find((item) => item.country === country);
  const policyText = country
    ? (row?.count ? `In the policy record, ${shortName(country)} has ${num(row.count)} measures in this scope. ${num(row.consumer)} (${share(row.consumer, row.count)}%) are consumer-oriented and ${num(row.rows.filter((record) => record.family === "Trade oriented").length)} trade-oriented, and ${num(row.rows.filter((record) => MARKET_PATTERN.test(`${record.domain} ${record.group}`)).length)} touch markets, prices, reserves or trade.` : `No policy measures for ${shortName(country)} match this scope.`)
    : `Across the region, ${num(a.families.find(([name]) => name === "Consumer oriented")?.[1] || 0)} of the ${num(a.total)} recorded measures in this scope are consumer-oriented and ${num(a.families.find(([name]) => name === "Trade oriented")?.[1] || 0)} trade-oriented; ${num(records.filter((record) => MARKET_PATTERN.test(`${record.domain} ${record.group}`)).length)} touch markets, prices, reserves or trade. The countries with the fastest-rising diet costs are not necessarily those with the most consumer-oriented measures. This comparison is descriptive and does not establish cause or response.`;
  const top = priceChanges(food, "lcu").filter((item) => !item.flat && item.country !== "Yemen" && (!country || item.country === country)).sort((x, y) => y.change - x.change).slice(0, 5);
  const sections = [
    ["Summary", paras(text[0], priceText), ""],
    ["The cost of a healthy diet", paras(dietText), foodVisuals(food, country)],
    ["Prices received by farmers", paras(priceText, top.length ? `Among individual commodities, the largest increases were ${listJoin(top.map((item) => `${lower(item.item)} in ${shortName(item.country)} (${Math.round(item.change)}%, ${item.firstYear}–${item.latestYear}${item.swing ? ", including a large one-year swing that should be verified" : ""})`))}.` : ""), ""],
    ["Policy response", paras(policyText) + responseSection(ui, { a, profile: approachProfile(records), country, foodCtx: [] }), ""],
    ["About this report", methodNarrative(food, r), ""],
  ];
  return { title: REPORT_TYPES.food, subtitle: country || "GCC States & Yemen", sections: r.length === "short" ? sections.slice(0, 3) : sections };
}

function monthlyReport(ui, food, r) {
  const records = scopeRecords(ui, { ...r, period: "all" });
  const latest = ui.latestDate(scopeRecords(ui, r));
  if (!latest) return { title: REPORT_TYPES.monthly, subtitle: "No dated records", sections: [["No data", "<p>No dated records match this selection.</p>", ""]] };
  const month = latest.slice(0, 7);
  const [year, mon] = month.split("-").map(Number);
  const key = (y, m) => { const d = new Date(Date.UTC(y, m - 1, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
  const prevMonth = key(year, mon - 1), lastYear = key(year - 1, mon);
  const inMonth = (m) => records.filter((record) => record.date?.startsWith(m));
  const rows = inMonth(month);
  const country = r.country !== "all" ? r.country : null;
  const byCountry = ui.COUNTRIES.map((name) => [name, rows.filter((record) => record.country === name)]).filter(([, list]) => list.length).sort((a, b) => b[1].length - a[1].length);
  const domains = ui.groupCount(rows, (record) => record.domain).slice(0, 4);
  const sections = [
    ["Overview", paras(`${num(rows.length)} policy measures were recorded ${country ? `for ${shortName(country)} ` : ""}in ${monthName(month)}, compared with ${num(inMonth(prevMonth).length)} in ${monthName(prevMonth)} and ${num(inMonth(lastYear).length)} in ${monthName(lastYear)}.${domains.length ? ` The month's activity focused on ${listJoin(domains.map(([domain, count]) => `${lower(ui.escapeHtml(domain))} (${count})`))}.` : ""}${approachProfile(rows).filter((row) => row.count).length ? ` In terms of policy approach, measures mostly concerned ${listJoin(approachProfile(rows).filter((row) => row.count).slice(0, 3).map((row) => approachPhrase(row.key)))}.` : ""}`), ""],
    ...(!country ? [["By country", byCountry.map(([name, list]) => `<p><strong>${name}.</strong> ${num(list.length)} measure${list.length === 1 ? "" : "s"}, mainly on ${listJoin(ui.groupCount(list, (record) => record.domain).slice(0, 2).map(([domain]) => lower(ui.escapeHtml(domain))))}. For example: “${ui.escapeHtml(firstSentence(list[0].description, 220))}”</p>`).join("") || "<p>No measures were recorded this month.</p>", ""]] : []),
    ["Highlights", recentNarrative(ui, rows, r.length === "short" ? 5 : r.length === "extended" ? 20 : 10), ""],
    ["About this report", methodNarrative(food, r), ""],
  ];
  return { title: REPORT_TYPES.monthly, subtitle: `${country || "GCC States & Yemen"} · ${monthName(month)}`, sections };
}

// ---------- page ----------
export function renderReportsPage(ui, food) {
  const { state, escapeHtml } = ui;
  // The builder owns the report scope; it starts from the dashboard filters the first time.
  state.report ||= { type: "analysis", country: state.country, period: state.year !== "all" ? String(state.year) : "all", domain: state.domain, instrument: state.type, audience: AUDIENCES[0], length: "standard", visuals: true };
  const r = state.report;
  const domains = ui.groupCount(state.records, (record) => record.domain).map(([domain]) => domain);
  $("#page-content").innerHTML = `${ui.heading("Reports", "Build a narrative analysis report from the policy record and FAOSTAT food data. Choose the scope below; the report updates as you change it.", "REPORTING & EXPORT")}
  <div class="content-grid">
    <section class="card span-12 report-builder"><div class="card-header"><div><h2 class="card-title">Report builder</h2><p class="card-subtitle" id="report-scope-label"></p></div></div><div class="card-body">
      <div class="report-form report-form-wide">
        <label>Report type<select id="report-type">${Object.entries(REPORT_TYPES).map(([key, label]) => `<option value="${key}" ${r.type === key ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        <label>Country<select id="report-country"><option value="all">All countries (GCC States &amp; Yemen)</option>${ui.COUNTRIES.map((country) => `<option value="${escapeHtml(country)}" ${r.country === country ? "selected" : ""}>${escapeHtml(country)}</option>`).join("")}</select></label>
        <label>Period<select id="report-period">${periodOptions(ui).map(([value, label]) => `<option value="${value}" ${r.period === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        <label>Policy domain<select id="report-domain"><option value="all">All policy domains</option>${domains.map((domain) => `<option value="${escapeHtml(domain)}" ${r.domain === domain ? "selected" : ""}>${escapeHtml(domain)}</option>`).join("")}</select></label>
        <label>Instrument<select id="report-instrument"><option value="all">All instruments</option><option value="decision" ${r.instrument === "decision" ? "selected" : ""}>Short-term decisions</option><option value="framework" ${r.instrument === "framework" ? "selected" : ""}>Long-term frameworks</option></select></label>
        <label>Audience<select id="report-audience">${AUDIENCES.map((audience) => `<option ${r.audience === audience ? "selected" : ""}>${audience}</option>`).join("")}</select></label>
        <label>Length<select id="report-length"><option value="short" ${r.length === "short" ? "selected" : ""}>Brief</option><option value="standard" ${r.length === "standard" ? "selected" : ""}>Standard</option><option value="extended" ${r.length === "extended" ? "selected" : ""}>Detailed</option></select></label>
        <label class="report-check"><input type="checkbox" id="report-visuals" ${r.visuals ? "checked" : ""}>Include supporting charts and tables</label>
      </div>
      <div class="report-actions"><button class="button button-outline" id="report-reset">${ui.icon("rotate-ccw")}Reset scope</button><button class="button button-outline" id="print-report">${ui.icon("printer")}Print / Save PDF</button><button class="button button-outline" id="word-brief">${ui.icon("file-text")}Word</button><button class="button button-outline" id="md-brief">${ui.icon("file-code")}Markdown</button><button class="button button-outline" id="copy-brief">${ui.icon("copy")}Copy text</button></div>
    </div></section>
    <section class="card span-12"><div class="card-body"><article class="generated-report" id="generated-report" aria-live="polite"></article></div></section>
  </div>`;
  const read = () => { r.type = $("#report-type").value; r.country = $("#report-country").value; r.period = $("#report-period").value; r.domain = $("#report-domain").value; r.instrument = $("#report-instrument").value; r.audience = $("#report-audience").value; r.length = $("#report-length").value; r.visuals = $("#report-visuals").checked; };
  document.querySelectorAll(".report-form select, .report-form input").forEach((control) => control.addEventListener("change", () => { read(); generate(ui, food); }));
  $("#report-reset").addEventListener("click", () => { Object.assign(r, { country: "all", period: "all", domain: "all", instrument: "all" }); renderReportsPage(ui, food); });
  $("#print-report").addEventListener("click", () => { document.body.classList.add("printing-report"); window.print(); setTimeout(() => document.body.classList.remove("printing-report"), 500); });
  $("#word-brief").addEventListener("click", () => exportWord(ui));
  $("#md-brief").addEventListener("click", () => ui.downloadBlob(new Blob([toMarkdown($("#generated-report .report-document"))], { type: "text/markdown;charset=utf-8" }), `${slug()}.md`));
  $("#copy-brief").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("#generated-report").innerText); ui.showToast("Report copied."); } catch { ui.showToast("Clipboard access is unavailable.", "error"); } });
  generate(ui, food);
  ui.refreshIcons();
}

function generate(ui, food) {
  const r = ui.state.report;
  const records = scopeRecords(ui, r);
  $("#report-scope-label").textContent = `Scope: ${scopeLabel(r)} · ${num(records.length)} measures`;
  const target = $("#generated-report");
  if (!records.length && r.type !== "food") { target.innerHTML = `<div class="empty-state"><h2>No measures match this scope</h2><p>Widen the country, period, domain or instrument selection.</p></div>`; return; }
  const report = r.type === "food" ? foodReport(ui, food, r) : r.type === "monthly" ? monthlyReport(ui, food, r) : analysisReport(ui, food, r);
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  target.innerHTML = `<div class="report-document"><header class="report-cover"><div class="eyebrow">POLICY INTELLIGENCE · ${ui.escapeHtml(report.title.toUpperCase())}</div><h2>${ui.escapeHtml(report.title)}: ${ui.escapeHtml(report.subtitle)}</h2><p class="report-meta">Prepared for ${ui.escapeHtml(r.audience)} · ${today} · Scope: ${ui.escapeHtml(scopeLabel(r))} · ${num(records.length)} measures${records.length ? `, evidence through ${longDate(ui.latestDate(records))}` : ""}</p></header>${report.sections.map(([title, narrative, visual], i) => `<section><h3>${i + 1}. ${ui.escapeHtml(title)}</h3>${narrative}${r.visuals && visual ? `<div class="report-visual">${visual}</div>` : ""}</section>`).join("")}<p class="report-note">Generated by the Policy Intelligence dashboard from the monitored policy record and FAOSTAT indicators. This is an analytical summary, not a legal interpretation; consult each original source.</p></div>`;
}

function slug() {
  const title = $("#generated-report h2")?.textContent || "policy-report";
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}
function exportWord(ui) {
  const content = $("#generated-report")?.innerHTML;
  if (!content) return;
  const documentHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Policy report</title><style>body{font:11pt Calibri,Arial,sans-serif;color:#263b4a;line-height:1.55}h2{color:#153f59;font-size:20pt}h3{color:#153f59;font-size:14pt;margin-top:18pt}table{border-collapse:collapse;width:100%;margin:8pt 0}th,td{border:1px solid #cfd9e0;padding:4pt 6pt;font-size:9.5pt;text-align:left}th{background:#eef3f6}a{color:#116aab}figure{display:none}.eyebrow{color:#8a5f17;font-size:9pt;letter-spacing:1px}</style></head><body>${content}</body></html>`;
  ui.downloadBlob(new Blob([documentHtml], { type: "application/msword;charset=utf-8" }), `${slug()}.doc`);
}
function toMarkdown(root) {
  if (!root) return "";
  const text = (node) => node.textContent.replace(/\s+/g, " ").trim();
  const out = [`# ${text(root.querySelector(".report-cover h2"))}`, `_${text(root.querySelector(".report-meta"))}_`];
  const walk = (parent) => parent.childNodes.forEach((child) => {
    if (child.nodeType !== 1) return;
    if (child.matches("h3")) out.push(`## ${text(child)}`);
    else if (child.matches("p.report-table-caption")) out.push(`**${text(child)}**`);
    else if (child.matches("p")) out.push(text(child));
    else if (child.matches("ul, ol")) out.push([...child.children].map((li, i) => `${child.matches("ol") ? `${i + 1}.` : "-"} ${text(li)}`).join("\n"));
    else if (child.matches("table")) {
      const rows = [...child.querySelectorAll("tr")].map((tr) => [...tr.children].map((cell) => text(cell).replace(/\|/g, "\\|")));
      if (rows.length) out.push([`| ${rows[0].join(" | ")} |`, `| ${rows[0].map(() => "---").join(" | ")} |`, ...rows.slice(1).map((row) => `| ${row.join(" | ")} |`)].join("\n"));
    } else if (child.matches("figure")) out.push(`_${text(child.querySelector("figcaption") || child)}_`);
    else if (child.matches("div")) walk(child);
  });
  root.querySelectorAll(":scope > section").forEach(walk);
  out.push(`> ${text(root.querySelector(":scope > .report-note"))}`);
  return `${out.join("\n\n")}\n`;
}
