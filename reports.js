import { CURRENCY, countryPriceSummary, dietComponents, dietSummary, formatLocal, perMonth, priceChanges } from "./food-analysis.js?v=pi-20261004";

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
function activityNarrative(a, subject) {
  const firstYear = a.first?.slice(0, 4), lastYear = a.latest?.slice(0, 4);
  return paras(
    `Between ${longDate(a.first)} and ${longDate(a.latest)}, ${num(a.total)} policy measures were recorded for ${subject}, an average of about ${Math.round(a.perMonth)} a month. By calendar year, the record holds ${listJoin(a.years.map(([year, count]) => `${num(count)} in ${year}`))}${firstYear === lastYear ? "" : `; ${firstYear} and ${lastYear} are partial years in the monitoring series`}.`,
    a.peak ? `The busiest month was ${monthName(a.peak[0])}, with ${num(a.peak[1].total)} measures. In the most recent 12 months, ${compareCounts(a.growth.recent, a.growth.previous)}. Because the series depends on what is reported publicly, changes in volume can reflect shifts in reporting as well as in policy activity.` : "",
  );
}
function themesNarrative(ui, a) {
  const top = a.domains.slice(0, 4);
  const groups = a.groups.slice(0, 3);
  return paras(
    top.length ? `The record is led by ${listJoin(top.map((row) => `${lower(ui.escapeHtml(row.domain))} (${num(row.count)} measures, ${share(row.count, a.total)}%)`))}. Together these account for ${share(top.reduce((sum, row) => sum + row.count, 0), a.total)}% of all measures.` : "",
    groups.length ? `Grouped more broadly, most measures fall under ${listJoin(groups.map(([group, count]) => `${lower(ui.escapeHtml(group))} (${num(count)})`))}.` : "",
    a.emerging.length ? `Several themes have gained attention over the last year: ${listJoin(a.emerging.map((row) => `${lower(ui.escapeHtml(row.domain))} (${num(row.growth.recent)} measures in the last 12 months against ${num(row.growth.previous)} the year before)`))}.` : "No domain shows a marked rise in attention over the last year.",
  );
}
function instrumentsNarrative(ui, a) {
  const [family, familyCount] = a.families[0] || [];
  return paras(
    `Short-term policy decisions make up ${share(a.decision, a.total)}% of the record (${num(a.decision)} measures), while long-term frameworks such as strategies, plans and laws account for ${share(a.framework, a.total)}% (${num(a.framework)}).${family ? ` ${ui.escapeHtml(family)} measures are the largest family (${share(familyCount, a.total)}%), followed by ${listJoin(a.families.slice(1, 3).map(([name, count]) => `${lower(ui.escapeHtml(name))} measures (${share(count, a.total)}%)`))}.` : ""}`,
    a.institutions.length ? `The institutions named most often are ${listJoin(a.institutions.slice(0, 4).map(([name, count]) => `${ui.escapeHtml(name)} (${num(count)})`))}. In all, ${num(a.institutions.length)} institution names appear in the record, some of them variants of the same body.` : "",
  );
}
function countryParagraph(ui, row, total, extended) {
  if (!row.count) return `<p><strong>${row.country}.</strong> No measures were recorded for ${shortName(row.country)} in this selection.</p>`;
  const domains = row.domains.slice(0, 2).map(([domain, count]) => `${lower(ui.escapeHtml(domain))} (${num(count)})`);
  const latest = row.latestRecord;
  return `<p><strong>${row.country}.</strong> ${startName(row.country)} recorded ${num(row.count)} measures (${share(row.count, total)}% of the total), concentrated on ${listJoin(domains)}. ${row.framework ? `It adopted ${num(row.framework)} long-term framework${row.framework === 1 ? "" : "s"} alongside ${num(row.decision)} short-term decisions.` : "All of its measures are short-term decisions."} In the last 12 months, ${compareCounts(row.growth.recent, row.growth.previous)}.${latest ? ` Its most recent measure, on ${longDate(latest.date)}: “${ui.escapeHtml(firstSentence(latest.description))}”` : ""}${extended && row.institutions[0] ? ` The institution named most often is ${ui.escapeHtml(row.institutions[0][0])}.` : ""}</p>`;
}
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
      out.push(`In ${row.latestYear}, a healthy diet cost ${formatLocal(row.lcuLatest, country)} per person per day in ${shortName(country)}, or roughly ${monthlyLocal(row.lcuLatest, country)} a month. That is ${Math.abs(row.lcuChange).toFixed(0)}% ${row.lcuChange >= 0 ? "more" : "less"} than in ${row.firstYear} in local currency. Adjusted for price levels it equals $${row.latest.toFixed(2)} a day, ${rank === 1 ? "the highest" : rank === diet.rows.length ? "the lowest" : `ranking ${rank} of ${diet.rows.length}`} among the six GCC countries covered.${row.puaLatest ? ` FAOSTAT estimates that ${row.puaLatest.value}% of the population could not afford a healthy diet in ${row.puaLatest.year}.` : ""}`);
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

function considerations(a, food, country) {
  const items = [];
  const diet = dietSummary(food);
  if (country) {
    const row = a.countries.find((item) => item.country === country);
    if (row && row.growth.previous && row.growth.recent < row.growth.previous * .8) items.push(`Recorded activity in ${shortName(country)} has slowed over the last year. It is worth confirming whether this reflects fewer measures or gaps in monitoring coverage.`);
    const d = diet.rows.find((item) => item.country === country);
    if (d && row?.count) items.push(`With a healthy diet now costing ${formatLocal(d.lcuLatest, country)} a day, ${Math.round(d.lcuChange)}% more than in ${d.firstYear}, consumer-oriented measures make up ${share(row.consumer, row.count)}% of ${shortName(country)}'s recorded measures. The balance between producer support and consumer affordability merits review.`);
  } else {
    const slowing = a.countries.filter((row) => row.growth.previous >= 20 && row.growth.recent < row.growth.previous * .8).map((row) => shortName(row.country));
    if (slowing.length) items.push(`Recorded activity has slowed over the last year in ${listJoin(slowing)}. Monitoring teams should check whether this reflects fewer measures or reduced coverage of national sources.`);
    const fastest = diet.rows.slice().sort((x, y) => y.lcuChange - x.lcuChange)[0];
    const fastestRow = a.countries.find((row) => row.country === fastest?.country);
    if (fastestRow?.count) items.push(`${startName(fastest.country)} has seen the steepest rise in the cost of a healthy diet (${Math.round(fastest.lcuChange)}% in local currency since ${diet.firstYear}), while ${share(fastestRow.consumer, fastestRow.count)}% of its recorded measures are consumer-oriented.`);
    const producerShare = share(a.families.find(([name]) => name === "Producer oriented")?.[1] || 0, a.total);
    if (producerShare > 60) items.push(`Policy attention is heavily weighted towards producers (${producerShare}% of measures), consistent with the region's focus on domestic production and self-sufficiency. Measures that address consumer affordability and nutrition are comparatively rare.`);
  }
  items.push("Data gaps limit the analysis. There are no healthy diet cost estimates for Yemen and no producer prices for the UAE, and unaffordability is reported only for Qatar and the UAE. Several countries' producer price series repeat the same value each year. National statistics would strengthen future monitoring.");
  return `<ul class="narrative-list">${items.map((item) => `<li>${item}</li>`).join("")}</ul><p class="report-note">These points follow from the recorded data and indicate where to look more closely; they are not policy conclusions.</p>`;
}
function methodNarrative(food, r) {
  return paras(
    `This report was generated from the Policy Intelligence monitoring record for the GCC States and Yemen: short summaries of food and agriculture policy measures compiled from public sources and classified by instrument, family, group and domain. The scope was ${scopeLabel(r)}. Counts reflect what was recorded, not the full universe of policy activity. Comparisons of the latest 12 months with the 12 months before are anchored on the most recent dated record in the selection.`,
    `Food cost figures come from FAOSTAT: the cost and affordability of a healthy diet (2020–2025) and annual producer prices (${food.prices.years[0]}–${food.prices.years.at(-1)}). Producer prices are the prices received by farmers, not retail prices. Live-weight meat duplicates and non-food items were removed, USD values inconsistent with official currency pegs were recalculated, and series that repeat one value every year were excluded from trend statistics.`,
    "Policy measures are summaries, not legal texts. Consult each original source before relying on a specific finding.",
  );
}

// ---------- report types ----------
function analysisReport(ui, food, r) {
  const records = scopeRecords(ui, r);
  const country = r.country !== "all" ? r.country : null;
  const a = analyse(ui, records);
  const region = analyse(ui, scopeRecords(ui, r, { ignoreCountry: true }));
  const subject = `${country ? shortName(country) : "the GCC States and Yemen"}${r.domain !== "all" ? ` in the domain of ${lower(ui.escapeHtml(r.domain))}` : ""}`;
  const extended = r.length === "extended";
  const [first, second] = a.countries;
  const foodText = foodNarrative(food, country);
  const rank = country ? region.countries.findIndex((row) => row.country === country) + 1 : 0;

  const summary = paras(
    `This report reviews ${num(a.total)} food and agriculture policy measures recorded for ${subject} between ${longDate(a.first)} and ${longDate(a.latest)}. ${country ? `${startName(country)} accounts for ${share(a.total, region.total)}% of the measures recorded across the region in the same scope, ranking ${rank} of ${region.countries.filter((row) => row.count).length} countries.` : `${first.country} and ${second.country} account for ${share(first.count + second.count, a.total)}% of them, reflecting both the size of their policy programmes and the depth of public reporting.`}`,
    `Policy action is dominated by short-term decisions (${share(a.decision, a.total)}%), and attention centres on ${listJoin(a.domains.slice(0, 3).map((row) => lower(ui.escapeHtml(row.domain))))}. In the most recent 12 months, ${compareCounts(a.growth.recent, a.growth.previous)}.`,
    foodText[0],
  );
  const sections = [["Executive summary", summary, ""], ["Policy activity and momentum", activityNarrative(a, subject), svgMonthlyBars(a.monthly)]];
  if (!country) {
    sections.push(["Country picture", `<p>The seven countries differ markedly in how much policy activity is recorded and where it is directed.</p>${a.countries.map((row) => countryParagraph(ui, row, a.total, extended)).join("")}`, table(["Country", "Measures", "Share", "Last 12 months", "12 months before", "Leading domain"], a.countries.map((row) => [row.country, num(row.count), `${share(row.count, a.total)}%`, num(row.growth.recent), num(row.growth.previous), ui.escapeHtml(row.domains[0]?.[0] || "–")]), "Table: measures by country.")]);
  } else {
    const expected = share(a.total, region.total) / 100;
    const standout = region.domains.slice(0, 10).map((row) => ({ ...row, own: a.domains.find((item) => item.domain === row.domain)?.count || 0 })).filter((row) => row.own / row.count > expected * 1.4).slice(0, 3);
    sections.push(["Position in the region", paras(`${startName(country)} recorded ${num(a.total)} of the ${num(region.total)} measures in the region (${share(a.total, region.total)}%). ${standout.length ? `Relative to its overall share, it is especially active in ${listJoin(standout.map((row) => `${lower(ui.escapeHtml(row.domain))} (${num(row.own)} of ${num(row.count)} regional measures)`))}.` : "Its thematic profile broadly mirrors the regional pattern."} Across the region in the last 12 months, ${compareCounts(region.growth.recent, region.growth.previous)}.`), ""]);
  }
  sections.push(["Policy themes", themesNarrative(ui, a), table(["Policy domain", "Measures", "Share", "Countries", "Last 12 months"], a.domains.slice(0, 10).map((row) => [ui.escapeHtml(row.domain), num(row.count), `${share(row.count, a.total)}%`, row.countries, num(row.growth.recent)]), "Table: leading policy domains.")]);
  sections.push(["Instruments and institutions", instrumentsNarrative(ui, a), ""]);
  sections.push(["Food prices and affordability", paras(foodText), foodVisuals(food, country)]);
  sections.push(["Recent developments", recentNarrative(ui, records, extended ? 10 : 5), ""]);
  sections.push(["Points for attention", considerations(a, food, country), ""]);
  sections.push(["About this report", methodNarrative(food, r), ""]);
  const kept = r.length === "short" ? sections.filter(([title]) => ["Executive summary", "Policy activity and momentum", "Recent developments", "Points for attention"].includes(title)) : sections;
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
    ["Policy response", paras(policyText), ""],
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
    ["Overview", paras(`${num(rows.length)} policy measures were recorded ${country ? `for ${shortName(country)} ` : ""}in ${monthName(month)}, compared with ${num(inMonth(prevMonth).length)} in ${monthName(prevMonth)} and ${num(inMonth(lastYear).length)} in ${monthName(lastYear)}.${domains.length ? ` The month's activity focused on ${listJoin(domains.map(([domain, count]) => `${lower(ui.escapeHtml(domain))} (${count})`))}.` : ""}`), ""],
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
