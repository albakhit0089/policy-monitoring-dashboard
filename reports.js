import { countryPriceSummary, dietComponents, dietSummary, groupPriceSummary, priceChanges } from "./food-analysis.js";
import { COUNTRY_COLORS } from "./prices.js";

const REPORT_TYPES = {
  regional: "Regional policy and food security analysis",
  country: "Country policy brief",
  food: "Food prices and affordability brief",
  domain: "Policy domain report",
  monthly: "Monthly monitoring update",
};
const AUDIENCES = ["Senior government officials", "FAO management", "Technical specialists", "General policy audience"];
const DAY = 86400000;
const $ = (selector) => document.querySelector(selector);
const pct = (value, digits = 0) => value === null || value === undefined || !Number.isFinite(value) ? "n/a" : `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
// Direction words for prose: "up 23%" / "down 23%" rather than "+23%".
const moved = (value, digits = 0) => value === null || value === undefined || !Number.isFinite(value) ? "not comparable" : `${value >= 0 ? "up" : "down"} ${Math.abs(value).toFixed(digits)}%`;
const share = (part, whole) => whole ? `${(part / whole * 100).toFixed(0)}%` : "0%";
const listJoin = (items) => items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

// ---------- analysis over policy records ----------
function analyse(ui, records) {
  const dated = records.filter((record) => record.date);
  const latest = dated.map((record) => record.date).sort().at(-1);
  const first = dated.map((record) => record.date).sort()[0];
  const end = latest ? new Date(`${latest}T00:00:00Z`).getTime() : Date.now();
  const time = (record) => new Date(`${record.date}T00:00:00Z`).getTime();
  const recentOf = (rows) => rows.filter((record) => record.date && time(record) > end - 365 * DAY).length;
  const previousOf = (rows) => rows.filter((record) => record.date && time(record) > end - 730 * DAY && time(record) <= end - 365 * DAY).length;
  const growth = (rows) => { const r = recentOf(rows), p = previousOf(rows); return { recent: r, previous: p, change: p ? (r - p) / p * 100 : null }; };
  const countries = ui.COUNTRIES.map((country) => {
    const rows = records.filter((record) => record.country === country);
    return { country, count: rows.length, growth: growth(rows), decision: ui.totalCount(rows, "decision"), framework: ui.totalCount(rows, "framework"), topDomain: ui.groupCount(rows, (record) => record.domain)[0], latest: ui.latestDate(rows), consumer: rows.filter((record) => record.family === "Consumer oriented").length };
  }).sort((a, b) => b.count - a.count);
  const domains = ui.groupCount(records, (record) => record.domain).map(([domain, count]) => ({ domain, count, growth: growth(records.filter((record) => record.domain === domain)), countries: new Set(records.filter((record) => record.domain === domain).map((record) => record.country)).size }));
  const emerging = domains.filter((domain) => domain.growth.recent >= 5 && domain.growth.change !== null).sort((a, b) => b.growth.change - a.growth.change).slice(0, 5);
  const monthly = ui.aggregateMonthly(records);
  const peak = monthly.slice().sort((a, b) => b[1].total - a[1].total)[0];
  return { total: records.length, first, latest, growth: growth(records), countries, domains, emerging, families: ui.groupCount(records, (record) => record.family), institutions: ui.groupCount(records, (record) => record.institution).slice(0, 8), monthly, peak, decision: ui.totalCount(records, "decision"), framework: ui.totalCount(records, "framework") };
}

// ---------- inline SVG charts (string based so they print and export cleanly) ----------
function svgMonthlyBars(monthly, months = 24) {
  const data = monthly.slice(-months);
  if (!data.length) return "";
  const width = 680, height = 170, left = 34, bottom = 24, top = 8, gap = 3;
  const max = Math.max(...data.map(([, value]) => value.total));
  const bar = (width - left - gap * (data.length - 1)) / data.length;
  const y = (value) => top + (height - top - bottom) * (1 - value / max);
  const ticks = [0, Math.round(max / 2), max];
  return `<figure class="report-figure"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Monthly policy measures">${ticks.map((tick) => `<line x1="${left}" x2="${width}" y1="${y(tick)}" y2="${y(tick)}" stroke="#e3eaef"/><text x="${left - 6}" y="${y(tick) + 4}" text-anchor="end" font-size="10" fill="#6b7f8c">${tick}</text>`).join("")}${data.map(([key, value], i) => `<rect x="${(left + i * (bar + gap)).toFixed(1)}" y="${y(value.total).toFixed(1)}" width="${bar.toFixed(1)}" height="${(height - bottom - y(value.total)).toFixed(1)}" rx="2" fill="#116aab"><title>${key}: ${value.total}</title></rect>${i % 3 === 0 ? `<text x="${(left + i * (bar + gap) + bar / 2).toFixed(1)}" y="${height - 8}" text-anchor="middle" font-size="10" fill="#6b7f8c">${key.slice(2).replace("-", "/")}</text>` : ""}`).join("")}</svg><figcaption>Monthly policy measures, last ${data.length} months in the selection.</figcaption></figure>`;
}
function svgHBars(rows, { caption, color = "#116aab", format = (value) => value.toLocaleString() }) {
  if (!rows.length) return "";
  const width = 680, rowHeight = 24, left = 190, height = rows.length * rowHeight + 8;
  const max = Math.max(...rows.map((row) => row.value)) || 1;
  return `<figure class="report-figure"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${caption}">${rows.map((row, i) => `<text x="${left - 8}" y="${i * rowHeight + 17}" text-anchor="end" font-size="11" fill="#33505f">${row.label.length > 30 ? `${row.label.slice(0, 29)}…` : row.label}</text><rect x="${left}" y="${i * rowHeight + 5}" width="${((width - left - 70) * row.value / max).toFixed(1)}" height="15" rx="3" fill="${row.color || color}"/><text x="${(left + (width - left - 70) * row.value / max + 6).toFixed(1)}" y="${i * rowHeight + 17}" font-size="11" fill="#33505f">${format(row.value)}</text>`).join("")}</svg><figcaption>${caption}</figcaption></figure>`;
}
function svgDietLines(diet) {
  const width = 680, height = 220, left = 40, right = 120, top = 10, bottom = 24;
  const years = diet.regional.map(([year]) => year);
  const values = diet.rows.flatMap((row) => row.points.map(([, value]) => value));
  const min = Math.floor(Math.min(...values) * 2) / 2, max = Math.ceil(Math.max(...values) * 2) / 2;
  const x = (year) => left + (width - left - right) * (years.indexOf(year) / Math.max(1, years.length - 1));
  const y = (value) => top + (height - top - bottom) * (1 - (value - min) / (max - min || 1));
  const grid = [min, (min + max) / 2, max].map((tick) => `<line x1="${left}" x2="${width - right}" y1="${y(tick)}" y2="${y(tick)}" stroke="#e3eaef"/><text x="${left - 6}" y="${y(tick) + 4}" text-anchor="end" font-size="10" fill="#6b7f8c">$${tick.toFixed(1)}</text>`).join("");
  // End labels: sort by position and push apart so close values stay readable.
  const labelY = new Map();
  diet.rows.map((row) => [row.country, y(row.latest)]).sort((p, q) => p[1] - q[1]).reduce((last, [country, pos]) => { const placed = Math.max(pos, last + 12); labelY.set(country, placed); return placed; }, -Infinity);
  const lines = diet.rows.map((row) => `<polyline fill="none" stroke="${COUNTRY_COLORS[row.country]}" stroke-width="2.2" points="${row.points.map(([year, value]) => `${x(year).toFixed(1)},${y(value).toFixed(1)}`).join(" ")}"/><text x="${(x(row.latestYear) + 6).toFixed(1)}" y="${(labelY.get(row.country) + 4).toFixed(1)}" font-size="10" fill="${COUNTRY_COLORS[row.country]}">${row.country === "United Arab Emirates" ? "UAE" : row.country} $${row.latest.toFixed(2)}</text>`).join("");
  return `<figure class="report-figure"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Cost of a healthy diet">${grid}${lines}${years.map((year) => `<text x="${x(year)}" y="${height - 6}" text-anchor="middle" font-size="10" fill="#6b7f8c">${year}</text>`).join("")}</svg><figcaption>Cost of a healthy diet, PPP $ per person per day (FAOSTAT). Label collisions are possible where values are close.</figcaption></figure>`;
}

// ---------- shared section builders ----------
function table(headers, rows) {
  return `<table class="report-table"><thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
function foodFindings(food, focus = null) {
  const diet = dietSummary(food);
  const prices = countryPriceSummary(food);
  const findings = [];
  const focusDiet = focus && diet.rows.find((row) => row.country === focus);
  if (focus && focusDiet) findings.push(`The cost of a healthy diet in ${focus} was $${focusDiet.latest.toFixed(2)} per person per day in ${focusDiet.latestYear} (PPP), ${pct(focusDiet.change, 1)} since ${focusDiet.firstYear}, against a six-country average of $${diet.regional.at(-1)[1].toFixed(2)} (${pct(diet.regionalChange, 1)}).`);
  else if (!focus) {
    const fastest = diet.rows.slice().sort((a, b) => b.change - a.change)[0];
    findings.push(`The average cost of a healthy diet across the six GCC countries rose ${Math.abs(diet.regionalChange).toFixed(1)}% between ${diet.firstYear} and ${diet.latestYear}, to $${diet.regional.at(-1)[1].toFixed(2)} per person per day (PPP). ${fastest.country} recorded the steepest increase (${pct(fastest.change, 1)}); ${diet.highest.country} remains the most expensive ($${diet.highest.latest.toFixed(2)}) and ${diet.lowest.country} the least ($${diet.lowest.latest.toFixed(2)}).`);
  } else findings.push(`FAOSTAT does not publish healthy diet cost estimates for ${focus}.`);
  const priceRow = focus && prices.find((row) => row.country === focus);
  if (focus) {
    if (!priceRow) findings.push(`No FAOSTAT producer price data is available for ${focus} in this dataset.`);
    else if (priceRow.medianChange === null) findings.push(`${focus}'s producer price series repeat the same value every year (${priceRow.flatSeries} of ${priceRow.series}), so price change cannot be assessed from this source.`);
    else findings.push(`Across ${priceRow.assessed} assessable commodities, ${focus}'s median producer price changed ${pct(priceRow.medianChange)} in local currency (${priceRow.firstYear}–${priceRow.latestYear}); ${priceRow.increased} rose.${focus === "Yemen" ? ` In USD the median change was ${pct(priceRow.medianUsdChange)}; currency depreciation explains much of the rial increase.` : ""}`);
  } else {
    const gcc = prices.filter((row) => row.country !== "Yemen" && row.medianChange !== null).map((row) => `${row.country} ${pct(row.medianChange)}${row.assessed < 5 ? ` (only ${row.assessed} series)` : ""}`);
    const yemen = prices.find((row) => row.country === "Yemen");
    const flat = prices.filter((row) => row.medianChange === null || row.flatSeries / row.series > .5).map((row) => row.country);
    findings.push(`Median producer price changes in local currency, ${food.prices.years[0]}–${food.prices.years.at(-1)}: ${gcc.join("; ")}.${yemen ? ` Yemen's median rose ${pct(yemen.medianChange)} in rial (${pct(yemen.medianUsdChange)} in USD), reflecting currency depreciation.` : ""}${flat.length ? ` Most ${listJoin(flat)} series repeat one value every year and cannot be assessed.` : ""}`);
  }
  return { diet, prices, findings };
}
function dataNotes(food) {
  return `<ul>${food.notes.map((note) => `<li>${note}</li>`).join("")}<li>Policy measures are short summaries compiled from public sources for monitoring; they are not legal texts. Counts reflect what was recorded, not the full universe of policy activity.</li><li>Trend comparisons use the latest 12 months against the preceding 12 months, anchored on the most recent dated record in the selection.</li></ul>`;
}
function recentList(ui, records, limit) {
  return `<ol class="report-records">${records.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, limit).map((record) => `<li><strong>${ui.escapeHtml(record.country)} · ${ui.escapeHtml(ui.formatDate(record.date))}.</strong> ${ui.escapeHtml(record.title)} <em>(${ui.escapeHtml(record.domain)})</em>${ui.safeUrl(record.source) ? ` <a href="${ui.escapeHtml(record.source)}">Source</a>` : ""}</li>`).join("")}</ol>`;
}
function countryTable(ui, a) {
  return table(["Country", "Measures", "Share", "Last 12 months", "Change vs prior 12 months", "Short-term / long-term", "Leading domain", "Latest record"], a.countries.map((row) => [`<strong>${ui.escapeHtml(row.country)}</strong>`, row.count.toLocaleString(), share(row.count, a.total), row.growth.recent, pct(row.growth.change), `${row.decision} / ${row.framework}`, ui.escapeHtml(row.topDomain?.[0] || "–"), ui.escapeHtml(ui.formatDate(row.latest))]));
}
function domainTable(ui, a, limit = 10) {
  return table(["Policy domain", "Measures", "Share", "Countries", "Last 12 months", "Change"], a.domains.slice(0, limit).map((row) => [ui.escapeHtml(row.domain), row.count, share(row.count, a.total), row.countries, row.growth.recent, pct(row.growth.change)]));
}
function foodSection(ui, food, focus) {
  const { diet, prices, findings } = foodFindings(food, focus);
  const components = dietComponents(food);
  const groups = groupPriceSummary(food);
  const dietRows = diet.rows.map((row) => [`<strong>${row.country}</strong>`, `$${row.first.toFixed(2)}`, `$${row.latest.toFixed(2)}`, pct(row.change, 1), row.puaLatest ? `${row.puaLatest.value}% (${row.puaLatest.year})` : "Not reported"]);
  const priceRows = prices.map((row) => [`<strong>${row.country}</strong>`, `${row.assessed} / ${row.series}`, row.medianChange === null ? "Not assessable" : pct(row.medianChange), row.medianUsdChange === null ? "–" : pct(row.medianUsdChange), `${row.firstYear}–${row.latestYear}`]);
  const topIncreases = priceChanges(food, "lcu").filter((row) => !row.flat && row.country !== "Yemen" && (!focus || row.country === focus)).sort((a, b) => b.change - a.change).slice(0, 8);
  const componentLine = components.rows.length ? (() => { const avg = components.groups.map((group) => [group, components.rows.reduce((sum, row) => sum + (row.parts[group] || 0), 0) / components.rows.length]).sort((a, b) => b[1] - a[1]); const total = avg.reduce((sum, [, value]) => sum + value, 0); return `<p>In ${components.year}, ${avg[0][0].toLowerCase()} made up the largest part of the healthy diet cost (${share(avg[0][1], total)} on average), followed by ${avg[1][0].toLowerCase()} (${share(avg[1][1], total)}).</p>`; })() : "";
  return `${findings.map((finding) => `<p>${finding}</p>`).join("")}${!focus ? svgDietLines(diet) : ""}${table(["Country", `Diet cost ${diet.firstYear}`, `Diet cost ${diet.latestYear}`, "Change", "Unable to afford"], focus ? dietRows.filter((row) => row[0].includes(focus)) : dietRows)}${componentLine}<h4>Producer prices</h4>${table(["Country", "Series assessable", "Median change (local currency)", "Median change (USD)", "Period"], focus ? priceRows.filter((row) => row[0].includes(focus)) : priceRows)}${groups.length && !focus ? `<p>By food group (GCC, changing series only): ${groups.map((group) => `${group.group.toLowerCase()} ${pct(group.medianChange)}`).join(", ")}.</p>` : ""}${topIncreases.length ? `<h4>Largest producer price increases${focus ? "" : " (GCC)"}</h4>${table(["Country", "Commodity", "Period", "Change"], topIncreases.map((row) => [row.country, `${row.item}${row.swing ? " <sup>!</sup>" : ""}`, `${row.firstYear}–${row.latestYear}`, pct(row.change)]))}<p class="report-note"><sup>!</sup> includes a year-on-year swing above 60%; verify against national sources.</p>` : ""}`;
}

// ---------- report types ----------
function regionalReport(ui, food, records, length) {
  const a = analyse(ui, records);
  const [first, second] = a.countries;
  const smallest = a.countries.filter((row) => row.count).at(-1);
  const topFamily = a.families[0];
  const food1 = foodFindings(food);
  const falling = a.countries.filter((row) => row.growth.change !== null && row.growth.change < -20);
  const rising = a.countries.filter((row) => row.growth.change !== null && row.growth.change > 20);
  const steepestDiet = food1.diet.rows.slice().sort((x, y) => y.change - x.change)[0];
  const steepestDietCountry = a.countries.find((row) => row.country === steepestDiet?.country);
  const findings = [
    `${a.total.toLocaleString()} policy measures were recorded between ${ui.formatDate(a.first)} and ${ui.formatDate(a.latest)}. Activity in the latest 12 months (${a.growth.recent.toLocaleString()} measures) was ${moved(a.growth.change)} on the previous 12 months (${a.growth.previous.toLocaleString()}).`,
    `${first.country} (${share(first.count, a.total)}) and ${second.country} (${share(second.count, a.total)}) account for ${share(first.count + second.count, a.total)} of recorded measures; ${smallest.country} has the fewest (${smallest.count}).`,
    `Short-term policy decisions make up ${share(a.decision, a.total)} of the record and long-term frameworks ${share(a.framework, a.total)}. ${topFamily ? `${topFamily[0]} measures are the largest family (${share(topFamily[1], a.total)}).` : ""}`,
    `The leading policy domains are ${listJoin(a.domains.slice(0, 3).map((row) => `${ui.escapeHtml(row.domain.toLowerCase())} (${row.count})`))}.${a.emerging.length ? ` The fastest-growing domains with at least five recent measures are ${listJoin(a.emerging.slice(0, 3).map((row) => `${ui.escapeHtml(row.domain.toLowerCase())} (${pct(row.growth.change)})`))}.` : ""}`,
    ...food1.findings,
  ];
  const attention = [
    ...rising.map((row) => `${row.country}: policy activity up ${pct(row.growth.change)} in the latest 12 months (${row.growth.recent} measures); review what is driving the increase.`),
    ...falling.map((row) => `${row.country}: policy activity down ${pct(row.growth.change)} in the latest 12 months; check whether this reflects reduced activity or reduced monitoring coverage.`),
    steepestDiet && steepestDietCountry ? `${steepestDiet.country}: the steepest rise in healthy diet cost (${pct(steepestDiet.change, 1)}), while consumer-oriented measures are ${share(steepestDietCountry.consumer, steepestDietCountry.count)} of its recorded measures.` : "",
    `Data gaps: no healthy diet cost estimates for Yemen, no producer prices for the United Arab Emirates, and unaffordability is reported only for Qatar and the UAE.`,
  ].filter(Boolean);
  const sections = [
    ["Key findings", `<ul class="finding-list">${findings.map((finding) => `<li>${finding}</li>`).join("")}</ul>`],
    ["Policy activity over time", `${svgMonthlyBars(a.monthly)}<p>The most active month in the selection was ${a.peak ? `${a.peak[0]} with ${a.peak[1].total} measures` : "not available"}. ${a.growth.change !== null ? `Momentum over the last year is ${a.growth.change >= 0 ? "positive" : "negative"} (${pct(a.growth.change)}).` : ""}</p>`],
    ["Country comparison", `${svgHBars(a.countries.map((row) => ({ label: row.country, value: row.count, color: COUNTRY_COLORS[row.country] })), { caption: "Policy measures by country in the selection." })}${countryTable(ui, a)}`],
    ["Thematic focus", `${domainTable(ui, a, length === "short" ? 6 : 10)}${a.emerging.length ? `<p>Emerging themes (latest 12 months vs previous, at least five recent measures): ${a.emerging.map((row) => `${ui.escapeHtml(row.domain)} ${pct(row.growth.change)}`).join("; ")}.</p>` : ""}`],
    ["Instruments and institutions", `${table(["Policy family", "Measures", "Share"], a.families.map(([family, count]) => [ui.escapeHtml(family), count, share(count, a.total)]))}<p>Most frequently named institutions: ${a.institutions.slice(0, 6).map(([name, count]) => `${ui.escapeHtml(name)} (${count})`).join("; ")}.</p>`],
    ["Food prices and affordability", foodSection(ui, food, null)],
    ["Points for attention", `<ul>${attention.map((item) => `<li>${item}</li>`).join("")}</ul><p class="report-note">These points are derived from the recorded data; they indicate where to look, not policy conclusions.</p>`],
    ["Data coverage and methodology", dataNotes(food)],
  ];
  if (length === "extended") sections.push(["Annex: recent developments", recentList(ui, records, 20)]);
  const kept = length === "short" ? sections.filter(([title]) => ["Key findings", "Policy activity over time", "Country comparison", "Points for attention"].includes(title)) : sections;
  return { title: REPORT_TYPES.regional, subtitle: "GCC States & Yemen", kpis: [["Policy measures", a.total.toLocaleString()], ["Last 12 months", `${a.growth.recent.toLocaleString()} (${pct(a.growth.change)})`], ["Avg. healthy diet cost", `$${food1.diet.regional.at(-1)[1].toFixed(2)}/day`], ["Diet cost change", pct(food1.diet.regionalChange, 1)]], sections: kept };
}

function countryReport(ui, food, records, length, country) {
  const rows = records.filter((record) => record.country === country);
  const a = analyse(ui, rows);
  const regional = analyse(ui, records);
  const food1 = foodFindings(food, country);
  const rank = regional.countries.findIndex((row) => row.country === country) + 1;
  const findings = [
    `${a.total.toLocaleString()} measures were recorded for ${country} between ${ui.formatDate(a.first)} and ${ui.formatDate(a.latest)}, ranking ${rank} of ${regional.countries.length} countries in the selection (${share(a.total, regional.total)} of regional measures).`,
    `Activity in the latest 12 months (${a.growth.recent}) was ${moved(a.growth.change)} on the previous 12 months, against ${moved(regional.growth.change)} regionally.`,
    `Leading domains: ${listJoin(a.domains.slice(0, 3).map((row) => `${ui.escapeHtml(row.domain.toLowerCase())} (${row.count})`))}. Short-term decisions are ${share(a.decision, a.total)} of measures.`,
    ...food1.findings,
  ];
  const sections = [
    ["Key findings", `<ul class="finding-list">${findings.map((finding) => `<li>${finding}</li>`).join("")}</ul>`],
    ["Policy activity", svgMonthlyBars(a.monthly)],
    ["Policy mix", `${svgHBars(a.domains.slice(0, 8).map((row) => ({ label: row.domain, value: row.count, color: COUNTRY_COLORS[country] })), { caption: `Top policy domains, ${country}.` })}${table(["Policy family", "Measures", "Share"], a.families.map(([family, count]) => [ui.escapeHtml(family), count, share(count, a.total)]))}`],
    ["Institutions", table(["Institution", "Measures"], a.institutions.map(([name, count]) => [ui.escapeHtml(name), count]))],
    ["Food prices and affordability", foodSection(ui, food, country)],
    ["Recent developments", recentList(ui, rows, length === "extended" ? 20 : 8)],
    ["Data coverage and methodology", dataNotes(food)],
  ];
  const kept = length === "short" ? sections.filter(([title]) => ["Key findings", "Policy activity", "Recent developments"].includes(title)) : sections;
  return { title: REPORT_TYPES.country, subtitle: country, kpis: [["Measures", a.total.toLocaleString()], ["Last 12 months", `${a.growth.recent} (${pct(a.growth.change)})`], ["Share of region", share(a.total, regional.total)], ["Domains", a.domains.length]], sections: kept };
}

function foodReport(ui, food, records, length) {
  const { diet, findings } = foodFindings(food);
  const a = analyse(ui, records);
  const linkRows = a.countries.map((row) => { const d = diet.rows.find((item) => item.country === row.country); return [`<strong>${row.country}</strong>`, d ? pct(d.change, 1) : "n/a", row.count, share(row.consumer, row.count), share(records.filter((record) => record.country === row.country && record.family === "Trade oriented").length, row.count)]; });
  const sections = [
    ["Key findings", `<ul class="finding-list">${findings.map((finding) => `<li>${finding}</li>`).join("")}</ul>`],
    ["Food prices and affordability", foodSection(ui, food, null)],
    ["Policy response alongside food costs", `${table(["Country", "Diet cost change", "Policy measures", "Consumer-oriented share", "Trade-oriented share"], linkRows)}<p class="report-note">Descriptive comparison only; it does not establish that measures caused or responded to price changes.</p>`],
    ["Data coverage and methodology", dataNotes(food)],
  ];
  return { title: REPORT_TYPES.food, subtitle: "GCC States & Yemen", kpis: [["Avg. diet cost", `$${diet.regional.at(-1)[1].toFixed(2)}/day`], ["Change since " + diet.firstYear, pct(diet.regionalChange, 1)], ["Price series", food.prices.series.length], ["Commodities", food.prices.items.length]], sections: length === "short" ? sections.slice(0, 2) : sections };
}

function domainReport(ui, food, records, length, domain) {
  const rows = records.filter((record) => record.domain === domain);
  const a = analyse(ui, rows);
  const findings = [
    `${a.total} measures on ${domain.toLowerCase()} were recorded between ${ui.formatDate(a.first)} and ${ui.formatDate(a.latest)}, across ${a.countries.filter((row) => row.count).length} countries.`,
    `Latest 12 months: ${a.growth.recent} measures (${pct(a.growth.change)} vs previous 12 months).`,
    `${a.countries[0].country} is the most active country (${a.countries[0].count} measures, ${share(a.countries[0].count, a.total)}).`,
  ];
  const sections = [
    ["Key findings", `<ul class="finding-list">${findings.map((finding) => `<li>${ui.escapeHtml(finding)}</li>`).join("")}</ul>`],
    ["Activity over time", svgMonthlyBars(a.monthly)],
    ["Countries", `${svgHBars(a.countries.filter((row) => row.count).map((row) => ({ label: row.country, value: row.count, color: COUNTRY_COLORS[row.country] })), { caption: `Measures on ${domain} by country.` })}${countryTable(ui, a)}`],
    ["Institutions", table(["Institution", "Measures"], a.institutions.map(([name, count]) => [ui.escapeHtml(name), count]))],
    ["Recent developments", recentList(ui, rows, length === "extended" ? 25 : 10)],
  ];
  return { title: REPORT_TYPES.domain, subtitle: domain, kpis: [["Measures", a.total], ["Last 12 months", `${a.growth.recent} (${pct(a.growth.change)})`], ["Countries", a.countries.filter((row) => row.count).length], ["Institutions", new Set(rows.map((record) => record.institution).filter(Boolean)).size]], sections: length === "short" ? sections.slice(0, 3) : sections };
}

function monthlyReport(ui, food, records, length) {
  const latest = ui.latestDate(records);
  if (!latest) return { title: REPORT_TYPES.monthly, subtitle: "No dated records", kpis: [], sections: [["No data", "<p>No dated records in the current selection.</p>"]] };
  const month = latest.slice(0, 7);
  const [year, mon] = month.split("-").map(Number);
  const key = (y, m) => { const d = new Date(Date.UTC(y, m - 1, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
  const prevMonth = key(year, mon - 1), lastYear = key(year - 1, mon);
  const inMonth = (m) => records.filter((record) => record.date?.startsWith(m));
  const rows = inMonth(month);
  const label = ui.formatDate(`${month}-01`, { day: undefined, month: "long", year: "numeric" });
  const byCountry = ui.COUNTRIES.map((country) => [country, rows.filter((record) => record.country === country).length]).sort((a, b) => b[1] - a[1]);
  const domains = ui.groupCount(rows, (record) => record.domain).slice(0, 6);
  const findings = [
    `${rows.length} measures were recorded in ${label}, compared with ${inMonth(prevMonth).length} the previous month and ${inMonth(lastYear).length} in the same month a year earlier.`,
    `Most active: ${listJoin(byCountry.filter(([, count]) => count).slice(0, 3).map(([country, count]) => `${country} (${count})`))}.`,
    domains.length ? `Leading domains this month: ${listJoin(domains.slice(0, 3).map(([domain, count]) => `${domain.toLowerCase()} (${count})`))}.` : "",
  ].filter(Boolean);
  const sections = [
    ["Key findings", `<ul class="finding-list">${findings.map((finding) => `<li>${ui.escapeHtml(finding)}</li>`).join("")}</ul>`],
    ["By country", table(["Country", "Measures", "Share"], byCountry.map(([country, count]) => [country, count, share(count, rows.length)]))],
    ["By policy domain", table(["Policy domain", "Measures"], domains.map(([domain, count]) => [ui.escapeHtml(domain), count]))],
    ["Measures recorded this month", recentList(ui, rows, length === "short" ? 10 : 40)],
  ];
  return { title: REPORT_TYPES.monthly, subtitle: label, kpis: [["Measures this month", rows.length], ["Previous month", inMonth(prevMonth).length], ["Same month last year", inMonth(lastYear).length], ["Countries active", byCountry.filter(([, count]) => count).length]], sections };
}

// ---------- page ----------
export function renderReportsPage(ui, food) {
  const { state, escapeHtml } = ui;
  const records = ui.filtered();
  state.report ||= { type: "regional", audience: AUDIENCES[0], length: "standard", country: "Saudi Arabia", domain: null };
  const r = state.report;
  if (state.country !== "all") r.country = state.country;
  const domains = ui.groupCount(records, (record) => record.domain).slice(0, 40).map(([domain]) => domain);
  if (!domains.includes(r.domain)) r.domain = domains[0] || null;
  const scope = ui.activeFilterEntries().map(([, label, value]) => `${escapeHtml(label)}: ${escapeHtml(value)}`).join(" · ") || "All records";
  $("#page-content").innerHTML = `${ui.heading("Reports", "Generate an evidence-based analysis report from the policy record and food price data. Figures are computed directly from the current selection.", "REPORTING & EXPORT")}
  <div class="content-grid">
    <section class="card span-12 report-builder"><div class="card-header"><div><h2 class="card-title">Report builder</h2><p class="card-subtitle">Scope: ${scope} · ${records.length.toLocaleString()} records</p></div></div><div class="card-body">
      <div class="report-form report-form-wide">
        <label>Report type<select id="report-type">${Object.entries(REPORT_TYPES).map(([key, label]) => `<option value="${key}" ${r.type === key ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        <label class="report-country" ${r.type === "country" ? "" : "hidden"}>Country<select id="report-country">${ui.COUNTRIES.map((country) => `<option ${r.country === country ? "selected" : ""}>${escapeHtml(country)}</option>`).join("")}</select></label>
        <label class="report-domain" ${r.type === "domain" ? "" : "hidden"}>Policy domain<select id="report-domain">${domains.map((domain) => `<option ${r.domain === domain ? "selected" : ""}>${escapeHtml(domain)}</option>`).join("")}</select></label>
        <label>Audience<select id="report-audience">${AUDIENCES.map((audience) => `<option ${r.audience === audience ? "selected" : ""}>${audience}</option>`).join("")}</select></label>
        <label>Length<select id="report-length"><option value="short" ${r.length === "short" ? "selected" : ""}>Brief</option><option value="standard" ${r.length === "standard" ? "selected" : ""}>Standard</option><option value="extended" ${r.length === "extended" ? "selected" : ""}>Detailed (with annex)</option></select></label>
      </div>
      <div class="report-actions"><button class="button button-primary" id="generate-report">${ui.icon("file-plus-2")}Generate report</button><button class="button button-outline" id="print-report">${ui.icon("printer")}Print / Save PDF</button><button class="button button-outline" id="word-brief">${ui.icon("file-text")}Word</button><button class="button button-outline" id="md-brief">${ui.icon("file-code")}Markdown</button><button class="button button-outline" id="copy-brief">${ui.icon("copy")}Copy text</button><button class="button button-outline" id="report-xlsx">${ui.icon("sheet")}Records (Excel)</button></div>
    </div></section>
    <section class="card span-12"><div class="card-body"><article class="generated-report" id="generated-report"></article></div></section>
  </div>`;
  const read = () => { r.type = $("#report-type").value; r.audience = $("#report-audience").value; r.length = $("#report-length").value; r.country = $("#report-country").value; r.domain = $("#report-domain")?.value || r.domain; };
  $("#report-type").addEventListener("change", () => { read(); document.querySelector(".report-country").hidden = r.type !== "country"; document.querySelector(".report-domain").hidden = r.type !== "domain"; });
  $("#generate-report").addEventListener("click", () => { read(); generate(ui, food); $("#generated-report").scrollIntoView({ behavior: "smooth", block: "start" }); });
  $("#print-report").addEventListener("click", () => { document.body.classList.add("printing-report"); window.print(); setTimeout(() => document.body.classList.remove("printing-report"), 500); });
  $("#word-brief").addEventListener("click", () => exportWord(ui));
  $("#md-brief").addEventListener("click", () => ui.downloadBlob(new Blob([toMarkdown($("#generated-report .report-document"))], { type: "text/markdown;charset=utf-8" }), `${slug()}.md`));
  $("#copy-brief").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("#generated-report").innerText); ui.showToast("Report copied."); } catch { ui.showToast("Clipboard access is unavailable.", "error"); } });
  $("#report-xlsx").addEventListener("click", () => ui.exportXlsx(ui.filtered()));
  generate(ui, food);
  ui.refreshIcons();
}

function generate(ui, food) {
  const r = ui.state.report;
  const records = ui.filtered();
  const target = $("#generated-report");
  if (!records.length) { target.innerHTML = ui.emptyMarkup(); ui.wireEmptyActions(); return; }
  const report = r.type === "country" ? countryReport(ui, food, records, r.length, r.country)
    : r.type === "food" ? foodReport(ui, food, records, r.length)
    : r.type === "domain" ? domainReport(ui, food, records, r.length, r.domain)
    : r.type === "monthly" ? monthlyReport(ui, food, records, r.length)
    : regionalReport(ui, food, records, r.length);
  const scope = ui.activeFilterEntries().map(([, label, value]) => `${label}: ${value}`).join(" · ") || "All records";
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  target.innerHTML = `<div class="report-document"><header class="report-cover"><div class="eyebrow">POLICY INTELLIGENCE · ${ui.escapeHtml(report.title.toUpperCase())}</div><h2>${ui.escapeHtml(report.title)}: ${ui.escapeHtml(report.subtitle)}</h2><p class="report-meta">Prepared for ${ui.escapeHtml(r.audience)} · ${today} · Evidence through ${ui.escapeHtml(ui.formatDate(ui.latestDate(records)))} · Scope: ${ui.escapeHtml(scope)}</p>${report.kpis.length ? `<div class="report-kpis">${report.kpis.map(([label, value]) => `<div><span>${ui.escapeHtml(label)}</span><strong>${ui.escapeHtml(String(value))}</strong></div>`).join("")}</div>` : ""}</header>${report.sections.map(([title, html], i) => `<section><h3>${i + 1}. ${ui.escapeHtml(title)}</h3>${html}</section>`).join("")}<p class="report-note">Generated by the Policy Intelligence dashboard from the monitored policy record and FAOSTAT indicators. This is a data summary, not a legal interpretation; consult each original source.</p></div>`;
}

function slug() {
  const title = $("#generated-report h2")?.textContent || "policy-report";
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}
function exportWord(ui) {
  const content = $("#generated-report")?.innerHTML;
  if (!content) return;
  const documentHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Policy report</title><style>body{font:11pt Calibri,Arial,sans-serif;color:#263b4a;line-height:1.5}h2{color:#153f59;font-size:20pt}h3{color:#153f59;font-size:14pt;margin-top:18pt}h4{color:#28536b}table{border-collapse:collapse;width:100%;margin:8pt 0}th,td{border:1px solid #cfd9e0;padding:4pt 6pt;font-size:9.5pt;text-align:left}th{background:#eef3f6}.report-kpis div{display:inline-block;margin-right:18pt}.report-kpis span{display:block;color:#6b7f8c;font-size:9pt}.report-kpis strong{font-size:14pt}a{color:#116aab}figure{display:none}</style></head><body>${content}</body></html>`;
  ui.downloadBlob(new Blob([documentHtml], { type: "application/msword;charset=utf-8" }), `${slug()}.doc`);
}
function toMarkdown(root) {
  if (!root) return "";
  const text = (node) => node.textContent.replace(/\s+/g, " ").trim();
  const out = [];
  root.querySelectorAll(":scope > header h2, :scope > header .report-meta, :scope > header .report-kpis, :scope > section, :scope > .report-note").forEach((node) => {
    if (node.matches("h2")) out.push(`# ${text(node)}`);
    else if (node.matches(".report-meta")) out.push(`_${text(node)}_`);
    else if (node.matches(".report-kpis")) out.push([...node.children].map((child) => `- **${text(child.querySelector("span"))}:** ${text(child.querySelector("strong"))}`).join("\n"));
    else if (node.matches(".report-note")) out.push(`> ${text(node)}`);
    else node.childNodes.forEach((child) => {
      if (child.nodeType !== 1) return;
      if (child.matches("h3")) out.push(`## ${text(child)}`);
      else if (child.matches("h4")) out.push(`### ${text(child)}`);
      else if (child.matches("p")) out.push(text(child));
      else if (child.matches("ul, ol")) out.push([...child.children].map((li, i) => `${child.matches("ol") ? `${i + 1}.` : "-"} ${text(li)}`).join("\n"));
      else if (child.matches("table")) {
        const rows = [...child.querySelectorAll("tr")].map((tr) => [...tr.children].map((cell) => text(cell).replace(/\|/g, "\\|")));
        if (rows.length) out.push([`| ${rows[0].join(" | ")} |`, `| ${rows[0].map(() => "---").join(" | ")} |`, ...rows.slice(1).map((row) => `| ${row.join(" | ")} |`)].join("\n"));
      } else if (child.matches("figure")) out.push(`_Figure: ${text(child.querySelector("figcaption") || child)}_`);
    });
  });
  return `${out.join("\n\n")}\n`;
}
