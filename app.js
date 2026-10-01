import { COUNTRIES, filterRecords, getOptions, groupCount, loadFoodIndicators, loadRegionalData, monthKey } from "./data-service.js?v=pi-20261004";
import { renderNetworkPage } from "./network.js?v=pi-20261004";
import { renderPricesPage } from "./prices.js?v=pi-20261004";
import { renderReportsPage } from "./reports.js?v=pi-20261004";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const FAMILY_COLORS = { "Consumer oriented": "#287bb0", "Producer oriented": "#b7852f", "Trade oriented": "#776bb0", "Long-term frameworks": "#40836d", "Other decision family": "#71828e" };
const COUNTRY_CODES = { Bahrain: "048", Kuwait: "414", Oman: "512", Qatar: "634", "Saudi Arabia": "682", "United Arab Emirates": "784", Yemen: "887" };
const PAGE_SIZE = 25;
const state = {
  records: [], page: "overview", keyword: "", country: "all", year: "all", month: "all", from: "", to: "", type: "all", family: "all", domain: "all", group: "all", institution: "all", pageNumber: 1, sortKey: "date", sortDirection: "desc", activityMode: "all", activityRange: "all", networkMode: "country-domain", compareCountries: ["Saudi Arabia", "United Arab Emirates", "Oman"], columns: new Set(["date", "country", "type", "family", "domain", "institution", "source"]), currentChartData: [], currentGroupKey: null,
};
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const normalizeText = (value) => String(value ?? "").toLocaleLowerCase();
const safeUrl = (value) => { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } };
const formatDate = (date, options = {}) => date ? new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC", ...options }) : "Date not stated";
const filtered = () => filterRecords(state.records, { country: state.country, year: state.year, month: state.month, from: state.from, to: state.to, type: state.type, family: state.family, domain: state.domain, group: state.group, institution: state.institution, keyword: state.keyword });
const totalCount = (items, type = null) => type ? items.filter((record) => record.type === type).length : items.length;
const percentage = (part, whole) => whole ? `${(part / whole * 100).toFixed(1)}%` : "0%";
const latestDate = (records) => records.map((record) => record.date).filter(Boolean).sort().at(-1);
const appShell = $("#app-shell");
let worldTopologyPromise = null;
let mapRenderGeneration = 0;

function icon(name, size = 16) { return `<i data-lucide="${name}" width="${size}" height="${size}" aria-hidden="true"></i>`; }
function refreshIcons() { window.lucide?.createIcons?.({ attrs: { "stroke-width": 1.8 } }); }
function showToast(message, kind = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${kind}`;
  toast.textContent = message;
  $("#toast-region").append(toast);
  setTimeout(() => toast.remove(), 4400);
}
function activeFilterEntries() {
  const labels = { country: "Country", year: "Year", month: "Month", type: "Type", family: "Family", domain: "Domain", group: "Group", institution: "Institution", from: "From", to: "To", keyword: "Search" };
  return Object.entries(labels).filter(([key]) => state[key] && state[key] !== "all").map(([key, label]) => [key, label, key === "month" ? MONTHS[Number(state.month) - 1] : key === "type" ? state.type === "decision" ? "Short-term" : "Long-term" : state[key]]);
}
function setFiltersCollapsed(collapsed) {
  $(".global-filters").classList.toggle("collapsed", collapsed);
  $("#toggle-filters").setAttribute("aria-expanded", String(!collapsed));
  try { localStorage.setItem("filtersCollapsed", collapsed ? "1" : "0"); } catch { /* Storage may be unavailable. */ }
}
function renderActiveFilters() {
  const count = activeFilterEntries().length;
  $("#filter-count").hidden = !count;
  $("#filter-count").textContent = `${count} active`;
  $("#active-filters").innerHTML = activeFilterEntries().map(([key, label, value]) => `<span class="filter-chip">${escapeHtml(label)}: ${escapeHtml(value)}<button type="button" data-remove-filter="${key}" aria-label="Remove ${escapeHtml(label)} filter" title="Remove filter">${icon("x", 12)}</button></span>`).join("");
  $$("[data-remove-filter]").forEach((button) => button.addEventListener("click", () => { clearFilter(button.dataset.removeFilter); render(); }));
  refreshIcons();
}
function clearFilter(key) {
  state[key] = ["country", "year", "month", "type", "family", "domain", "group", "institution"].includes(key) ? "all" : "";
  syncFilters();
}
function syncFilters() {
  const mapping = { country: "#filter-country", year: "#filter-year", month: "#filter-month", type: "#filter-type", family: "#filter-family", domain: "#filter-domain", group: "#filter-group", institution: "#filter-institution", from: "#filter-from", to: "#filter-to" };
  Object.entries(mapping).forEach(([key, selector]) => { const element = $(selector); if (element) element.value = state[key]; });
  $("#global-search").value = state.keyword;
  renderActiveFilters();
}
function setOptions(select, label, values, value = "all") {
  select.innerHTML = `<option value="all">${label}</option>${values.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("")}`;
  select.value = values.includes(value) ? value : "all";
}
function initializeFilters(records) {
  const options = getOptions(records);
  setOptions($("#filter-country"), "All countries", COUNTRIES, state.country);
  setOptions($("#filter-year"), "All years", options.years, state.year);
  $("#filter-month").innerHTML = `<option value="all">All months</option>${MONTHS.map((month, i) => `<option value="${String(i + 1).padStart(2, "0")}">${month}</option>`).join("")}`;
  setOptions($("#filter-family"), "All families", options.families, state.family);
  setOptions($("#filter-domain"), "All domains", options.domains, state.domain);
  setOptions($("#filter-group"), "All groups", options.groups, state.group);
  setOptions($("#filter-institution"), "All institutions", options.institutions, state.institution);
  syncFilters();
}

function heading(title, subtitle, eyebrow = "REGIONAL POLICY MONITORING", actions = "") {
  return `<div class="page-heading"><div><div class="eyebrow">${escapeHtml(eyebrow)}</div><h1 class="page-title">${escapeHtml(title)}</h1><p class="page-subtitle">${escapeHtml(subtitle)}</p></div><div class="heading-actions">${actions}</div></div>`;
}
function card(title, subtitle, body, className = "span-6", actions = "") {
  return `<section class="card ${className}"><div class="card-header"><div><h2 class="card-title">${title}</h2>${subtitle ? `<p class="card-subtitle">${subtitle}</p>` : ""}</div>${actions}</div><div class="card-body">${body}</div></section>`;
}
function chartExplainButton(chartName) { return `<button class="text-button" type="button" data-explain="${escapeHtml(chartName)}">${icon("sparkles", 14)}Explain</button>`; }
function familyColor(family) { return FAMILY_COLORS[family] || FAMILY_COLORS["Other decision family"]; }
function aggregateMonthly(records) {
  const grouped = d3.rollups(records.filter((record) => record.date), (values) => ({ total: values.length, decision: totalCount(values, "decision"), framework: totalCount(values, "framework") }), monthKey).sort((a, b) => a[0].localeCompare(b[0]));
  return grouped;
}
function periodCompare(records) {
  const monthly = aggregateMonthly(records);
  if (!monthly.length) return null;
  const latestKey = monthly.at(-1)[0];
  const previousKey = monthly.length > 1 ? monthly.at(-2)[0] : null;
  const latestCount = monthly.at(-1)[1].total;
  const previousCount = previousKey ? monthly.at(-2)[1].total : 0;
  return { latestKey, latestCount, previousKey, previousCount, change: previousCount ? (latestCount - previousCount) / previousCount * 100 : null };
}
function kpi(label, value, meta, iconName, tone = "") {
  return `<article class="kpi-card ${tone}"><div class="kpi-label"><span>${escapeHtml(label)}</span>${icon(iconName, 17)}</div><div class="kpi-value${/^[\d,.%\s]+$/.test(value) || value.length <= 12 ? "" : " kpi-value-text"}" title="${escapeHtml(value)}">${escapeHtml(value)}</div><div class="kpi-meta">${meta}</div></article>`;
}
function renderOverview() {
  const items = filtered();
  const period = periodCompare(items);
  const latestLabel = period ? formatDate(`${period.latestKey}-01`, { month: "short", year: "numeric", day: undefined }) : "Not available";
  const lastDate = latestDate(items);
  const countryCount = new Set(items.map((record) => record.country)).size;
  const institutionCount = new Set(items.map((record) => record.institution).filter(Boolean)).size;
  const monthly = aggregateMonthly(items);
  const monthsInYear = items.filter((record) => record.year === (period ? Number(period.latestKey.slice(0, 4)) : null));
  const intro = `<div class="hero-strip"><div class="hero-copy"><div class="eyebrow">FOOD &amp; AGRICULTURE · GCC STATES &amp; YEMEN</div><h1 class="page-title">Policy Intelligence</h1><p class="page-subtitle">Monitor food, agriculture, trade, water and food security developments across the region, grounded in the policy record.</p></div><div class="hero-asof"><span>DATA THROUGH</span><strong>${escapeHtml(formatDate(lastDate, { day: "2-digit", month: "short", year: "numeric" }))}</strong></div></div>`;
  const kpis = `<div class="kpi-grid">${kpi("Policy measures", items.length.toLocaleString(), "In the current selection", "files", "kpi-primary")}${kpi("Countries covered", countryCount.toString(), "GCC States and Yemen", "map-pinned", "kpi-teal")}${kpi("Measures in latest month", period?.latestCount.toLocaleString() || "0", latestLabel, "calendar-days", "kpi-gold")}${kpi("Short-term decisions", totalCount(items, "decision").toLocaleString(), `${totalCount(items, "framework").toLocaleString()} long-term frameworks`, "scale")}${kpi("Long-term frameworks", totalCount(items, "framework").toLocaleString(), "Records classified as frameworks", "book-open")}${kpi("Institutions monitored", institutionCount.toLocaleString(), "Distinct names in source records", "building-2")}${kpi("Policy domains", new Set(items.map((record) => record.domain)).size.toLocaleString(), "Domains represented in selection", "shapes")}${kpi("Latest update", lastDate ? formatDate(lastDate, { day: "2-digit", month: "short", year: "numeric" }) : "Not available", "Latest dated policy measure", "clock-3")}</div>`;
  const activity = `<div class="chart-toolbar" id="activity-mode"><button type="button" data-activity="all" aria-pressed="true">Total</button><button type="button" data-activity="decision" aria-pressed="false">Short-term</button><button type="button" data-activity="framework" aria-pressed="false">Long-term</button></div><div class="chart-wrap chart-tall" id="activity-chart"></div><div class="legend-row"><span class="legend-item"><i style="background:#116aab"></i>Total measures</span><span class="legend-item"><i style="background:#49806a"></i>Short-term decisions</span><span class="legend-item"><i style="background:#b7852f"></i>Long-term frameworks</span></div>`;
  const countryBars = `<div class="rank-list" id="country-rank"></div>`;
  const typeBars = `<div class="chart-wrap" id="type-by-country-chart"></div>`;
  const families = `<div class="chart-wrap" id="family-chart"></div><div class="legend-row family-legend" id="family-legend"></div>`;
  const heatmap = `<div class="table-wrap heatmap-wrap" id="heatmap-wrap"></div>`;
  const map = `<div class="map-wrap" id="regional-map"></div>`;
  const latestItems = items.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 5);
  const latest = latestItems.length ? `<div class="record-list">${latestItems.map((record) => recordCard(record)).join("")}</div>` : emptyMarkup();
  const themes = renderEmerging(items);
  return `${intro}${kpis}<div class="content-grid">${card("Policy activity over time", "Monthly measure counts · click a month to filter the workspace", activity, "span-12", chartExplainButton("monthly activity"))}${card("Policy measures by country", "Ranked counts from the selected records", countryBars, "span-6")}${card("Short-term and long-term orientation", "Country totals by measure type", typeBars, "span-6")}${card("Policy family distribution", "Counts from recorded family classifications", families, "span-6", chartExplainButton("policy family mix"))}${card("Policy domains by country", "Top 12 domains · select a cell, domain or country to filter", heatmap, "span-6")}${card("Regional map", "Policy measure volume by country", map, "span-7")}${card("Emerging policy themes", "Recent 12 months compared with the preceding 12 months", themes, "span-5")}${card("Latest developments", "Most recently dated records in the current selection", latest, "span-12")}</div>`;
}

function drawActivityChart(selector, records, mode = state.activityMode, onMonth = true) {
  const target = d3.select(selector);
  target.selectAll("*").remove();
  const data = aggregateMonthly(records);
  state.currentChartData = data;
  if (!data.length) { target.html(`<div class="empty-state"><h2>No dated measures found</h2><p>Adjust the selected filters to view monthly activity.</p></div>`); return; }
  const width = Math.max(320, target.node().clientWidth || 800);
  const height = target.node().classList.contains("chart-tall") ? 310 : 250;
  const margin = { top: 14, right: 18, bottom: 46, left: 50 };
  const svg = target.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("aria-label", "Monthly policy measure counts");
  const x = d3.scalePoint().domain(data.map(([key]) => key)).range([margin.left, width - margin.right]).padding(.25);
  const maxValue = d3.max(data, ([, values]) => mode === "all" ? values.total : values[mode]) || 1;
  const y = d3.scaleLinear().domain([0, maxValue * 1.16]).nice().range([height - margin.bottom, margin.top]);
  svg.append("g").attr("class", "chart-grid").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(width - margin.left - margin.right)).tickFormat(d3.format("~s")));
  svg.append("g").attr("class", "chart-axis").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).tickValues(data.filter((_, i) => i % Math.max(1, Math.ceil(data.length / 10)) === 0).map(([key]) => key)).tickFormat((key) => { const [year, month] = key.split("-"); return `${MONTHS[Number(month) - 1].slice(0, 3)} '${year.slice(2)}`; }));
  const valueFor = ([, values]) => mode === "all" ? values.total : values[mode];
  const color = mode === "decision" ? "#49806a" : mode === "framework" ? "#b7852f" : "#116aab";
  const line = d3.line().x(([key]) => x(key)).y((entry) => y(valueFor(entry))).curve(d3.curveMonotoneX);
  const area = d3.area().x(([key]) => x(key)).y0(y(0)).y1((entry) => y(valueFor(entry))).curve(d3.curveMonotoneX);
  const gradientId = `activity-gradient-${Math.random().toString(36).slice(2, 8)}`;
  const gradient = svg.append("defs").append("linearGradient").attr("id", gradientId).attr("x1", "0").attr("x2", "0").attr("y1", "0").attr("y2", "1");
  gradient.append("stop").attr("offset", "0%").attr("stop-color", color).attr("stop-opacity", .18);
  gradient.append("stop").attr("offset", "100%").attr("stop-color", color).attr("stop-opacity", .015);
  svg.append("path").datum(data).attr("d", area).attr("fill", `url(#${gradientId})`);
  svg.append("path").datum(data).attr("d", line).attr("fill", "none").attr("stroke", color).attr("stroke-width", 2.6);
  const marks = svg.append("g").selectAll("g.chart-mark").data(data).join("g").attr("class", "chart-mark").attr("tabindex", 0).attr("role", onMonth ? "button" : null).attr("aria-label", (entry) => `${entry[0]}: ${valueFor(entry)} policy measures`);
  marks.append("circle").attr("cx", ([key]) => x(key)).attr("cy", (entry) => y(valueFor(entry))).attr("r", 3.5).attr("fill", "white").attr("stroke", color).attr("stroke-width", 2);
  marks.append("title").text(([key, values]) => `${key}: ${mode === "all" ? values.total : values[mode]} measures · ${values.decision} short-term · ${values.framework} long-term`);
  marks.on("click keydown", (event, [key]) => { if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return; if (event.type === "keydown") event.preventDefault(); if (onMonth) { const [year, month] = key.split("-"); state.year = year; state.month = month; state.pageNumber = 1; syncFilters(); render(); } });
}

function renderCountryRank(records, target = "#country-rank") {
  const counts = COUNTRIES.map((country) => [country, records.filter((record) => record.country === country).length]);
  renderRankEntries(counts, target, (country) => setFilter("country", country));
}
function renderRankEntries(counts, target, onSelect = null) {
  if (!counts.some(([, count]) => count > 0)) { $(target).innerHTML = emptyMarkup(); wireEmptyActions(); return; }
  const max = d3.max(counts, (entry) => entry[1]) || 1;
  $(target).innerHTML = counts.map(([label, count]) => `<div class="rank-row" role="${onSelect ? "button" : "img"}" tabindex="${onSelect ? 0 : -1}" data-rank-label="${escapeHtml(label)}" aria-label="${escapeHtml(label)}, ${count} measures"><span class="rank-country">${escapeHtml(label)}</span><span class="rank-track"><span style="width:${count / max * 100}%"></span></span><strong class="rank-count">${count.toLocaleString()}</strong></div>`).join("");
  $$(`[data-rank-label]`, $(target)).forEach((row) => {
    if (!onSelect) return;
    row.addEventListener("click", () => onSelect(row.dataset.rankLabel));
    row.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); onSelect(row.dataset.rankLabel); } });
  });
}
function drawTypeBars(records) {
  const target = d3.select("#type-by-country-chart");
  target.selectAll("*").remove();
  if (!records.length) { target.html(emptyMarkup()); wireEmptyActions(); return; }
  const data = COUNTRIES.map((country) => ({ country, decision: records.filter((record) => record.country === country && record.type === "decision").length, framework: records.filter((record) => record.country === country && record.type === "framework").length }));
  const width = Math.max(330, target.node().clientWidth || 500), height = 260, margin = { top: 8, right: 14, bottom: 43, left: 43 };
  const svg = target.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("aria-label", "Short-term and long-term policy measures by country");
  const x = d3.scaleBand().domain(data.map((d) => d.country)).range([margin.left, width - margin.right]).padding(.22);
  const y = d3.scaleLinear().domain([0, (d3.max(data, (d) => d.decision + d.framework) || 1) * 1.12]).nice().range([height - margin.bottom, margin.top]);
  svg.append("g").attr("class", "chart-grid").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(width - margin.left - margin.right)).tickFormat(d3.format("~s")));
  svg.append("g").attr("class", "chart-axis").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).tickFormat((name) => name === "United Arab Emirates" ? "UAE" : name === "Saudi Arabia" ? "Saudi" : name).tickSizeOuter(0));
  const stack = d3.stack().keys(["decision", "framework"])(data);
  const colors = { decision: "#287bb0", framework: "#40836d" };
  const bars = svg.append("g").selectAll("g").data(stack).join("g").attr("fill", (d) => colors[d.key]).selectAll("rect").data((d) => d.map((entry) => Object.assign(entry, { key: d.key }))).join("rect").attr("x", (d) => x(d.data.country)).attr("y", (d) => y(d[1])).attr("height", (d) => Math.max(0, y(d[0]) - y(d[1]))).attr("width", x.bandwidth()).attr("rx", 2).attr("class", "chart-mark").attr("tabindex", 0).attr("role", "button").attr("aria-label", (d) => `Filter ${d.data.country} by ${d.key === "decision" ? "short-term decisions" : "long-term frameworks"}`)
    .on("click keydown", (event, entry) => { if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return; if (event.type === "keydown") event.preventDefault(); state.country = entry.data.country; state.type = entry.key; syncFilters(); render(); });
  bars.append("title").text((d) => `${d.data.country} · ${d.key === "decision" ? "Short-term decisions" : "Long-term frameworks"}: ${d[1] - d[0]} (${percentage(d[1] - d[0], d.data.decision + d.data.framework)}). Click to filter.`);
}
function drawFamilyDonut(records) {
  const target = d3.select("#family-chart"); target.selectAll("*").remove();
  const entries = groupCount(records, (record) => record.family);
  if (!entries.length) { target.html(emptyMarkup()); return; }
  const width = Math.max(250, target.node().clientWidth || 360), height = 245, radius = Math.min(width * .31, 96);
  const svg = target.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("aria-label", "Policy measures by family");
  const group = svg.append("g").attr("transform", `translate(${width / 2},${height / 2})`);
  const pie = d3.pie().sort(null).value((entry) => entry[1])(entries);
  const arc = d3.arc().innerRadius(radius * .63).outerRadius(radius);
  const slices = group.selectAll("path").data(pie).join("path").attr("d", arc).attr("fill", (entry) => familyColor(entry.data[0])).attr("stroke", "white").attr("stroke-width", 2).attr("class", "chart-mark").attr("tabindex", 0).attr("role", "button").attr("aria-label", (entry) => `Filter to ${entry.data[0]}, ${entry.data[1]} measures`).on("click keydown", (event, entry) => { if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return; if (event.type === "keydown") event.preventDefault(); setFilter("family", entry.data[0]); });
  slices.append("title").text((entry) => `${entry.data[0]}: ${entry.data[1]} measures (${percentage(entry.data[1], records.length)}). Click to filter.`);
  group.append("text").attr("class", "donut-center-value").attr("y", -2).text(records.length.toLocaleString());
  group.append("text").attr("class", "donut-center-label").attr("y", 18).text("measures");
  $("#family-legend").innerHTML = entries.map(([family, count]) => `<button class="legend-item" data-family="${escapeHtml(family)}"><i style="background:${familyColor(family)}"></i><span>${escapeHtml(family)}</span><strong>${count.toLocaleString()}</strong></button>`).join("");
  $$('[data-family]').forEach((button) => button.addEventListener("click", () => setFilter("family", button.dataset.family)));
}
function drawHeatmap(records) {
  const target = $("#heatmap-wrap");
  const domains = groupCount(records, (record) => record.domain).slice(0, 12).map(([domain]) => domain);
  if (!domains.length) { target.innerHTML = emptyMarkup(); return; }
  const values = COUNTRIES.flatMap((country) => domains.map((domain) => ({ country, domain, count: records.filter((record) => record.country === country && record.domain === domain).length })));
  const max = d3.max(values, (entry) => entry.count) || 1;
  const cellColor = d3.scaleSequential([0, max], (t) => d3.interpolateBlues(.08 + t * .85));
  const shortName = (country) => ({ "United Arab Emirates": "UAE", "Saudi Arabia": "Saudi" })[country] || country;
  const cellRows = domains.map((domain) => `<tr><th scope="row"><button class="heatmap-domain" data-heat-domain="${escapeHtml(domain)}" title="${escapeHtml(domain)}">${escapeHtml(domain)}</button></th>${COUNTRIES.map((country) => { const entry = values.find((value) => value.country === country && value.domain === domain); return `<td><button class="heatmap-cell${entry.count ? "" : " empty"}" style="${entry.count ? `background:${cellColor(entry.count)};color:${entry.count > max * .5 ? "white" : "#1f4258"}` : ""}" data-country="${escapeHtml(country)}" data-domain="${escapeHtml(domain)}" aria-label="${escapeHtml(country)}, ${escapeHtml(domain)}: ${entry.count} measures" title="${escapeHtml(country)} · ${escapeHtml(domain)}: ${entry.count} measures (${percentage(entry.count, records.filter((record) => record.country === country).length)} of ${escapeHtml(country)}). Click to filter.">${entry.count || "–"}</button></td>`; }).join("")}</tr>`).join("");
  target.innerHTML = `<table class="heatmap-table"><thead><tr><th scope="col">Policy domain</th>${COUNTRIES.map((country) => `<th scope="col"><button class="heatmap-country" data-country="${escapeHtml(country)}" title="${escapeHtml(country)}">${escapeHtml(shortName(country))}</button></th>`).join("")}</tr></thead><tbody>${cellRows}</tbody></table><div class="heatmap-scale"><span>Fewer</span><i style="background:linear-gradient(90deg,${cellColor(0)},${cellColor(max / 2)},${cellColor(max)})"></i><span>More measures</span></div>`;
  $$('[data-domain][data-country]', target).forEach((button) => button.addEventListener("click", () => { state.country = button.dataset.country; state.domain = button.dataset.domain; syncFilters(); render(); }));
  $$('button.heatmap-country', target).forEach((button) => button.addEventListener("click", () => setFilter("country", button.dataset.country)));
  $$('button.heatmap-domain', target).forEach((button) => button.addEventListener("click", () => setFilter("domain", button.dataset.heatDomain)));
}
function renderEmerging(records) {
  const latestKey = [...records].map(monthKey).filter(Boolean).sort().at(-1);
  if (!latestKey) return `<div class="empty-state">No dated records to compare.</div>`;
  const [year, month] = latestKey.split("-").map(Number);
  const end = new Date(Date.UTC(year, month, 1));
  const startRecent = new Date(Date.UTC(year, month - 12, 1));
  const startPrevious = new Date(Date.UTC(year, month - 24, 1));
  const recent = records.filter((record) => record.date && new Date(`${record.date}T00:00:00Z`) >= startRecent && new Date(`${record.date}T00:00:00Z`) < end);
  const previous = records.filter((record) => record.date && new Date(`${record.date}T00:00:00Z`) >= startPrevious && new Date(`${record.date}T00:00:00Z`) < startRecent);
  const themes = groupCount(recent, (record) => record.domain).slice(0, 16).map(([domain, count]) => {
    const prior = previous.filter((record) => record.domain === domain).length;
    return { domain, count, prior, change: prior ? (count - prior) / prior * 100 : null, countries: new Set(recent.filter((record) => record.domain === domain).map((record) => record.country)).size };
  }).sort((a, b) => (b.change ?? Infinity) - (a.change ?? Infinity)).slice(0, 6);
  return `<div class="theme-list">${themes.map((theme) => `<button class="theme-row" data-theme="${escapeHtml(theme.domain)}"><span class="theme-main"><strong>${escapeHtml(theme.domain)}</strong><small>${theme.count} measures · ${theme.countries} countries in latest 12 months</small></span><span class="theme-change ${theme.change === null ? "neutral" : theme.change >= 0 ? "up" : "down"}">${theme.change === null ? "New" : `${theme.change >= 0 ? "↑" : "↓"} ${Math.abs(theme.change).toFixed(0)}%`}</span></button>`).join("")}<p class="method-note">Change is calculated against the preceding 12 months through ${escapeHtml(formatDate(`${latestKey}-01`, { month: "short", year: "numeric", day: undefined }))}. New domains have no prior-period baseline.</p></div>`;
}
async function renderMap(records) {
  const target = $("#regional-map");
  if (!records.length) { target.innerHTML = emptyMarkup(); wireEmptyActions(); return; }
  const generation = ++mapRenderGeneration;
  const counts = Object.fromEntries(COUNTRIES.map((country) => [country, records.filter((record) => record.country === country).length]));
  try {
    worldTopologyPromise ||= d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
    const topology = await worldTopologyPromise;
    if (generation !== mapRenderGeneration) return;
    const countryFeatures = topojson.feature(topology, topology.objects.countries).features;
    const features = countryFeatures.filter((feature) => Object.values(COUNTRY_CODES).includes(String(feature.id).padStart(3, "0")));
    if (!features.length) throw new Error("Regional map geometry is unavailable.");
    const width = Math.max(300, target.clientWidth || 650), height = 370;
    const collection = { type: "FeatureCollection", features };
    const projection = d3.geoMercator().fitExtent([[20, 20], [width - 20, height - 20]], collection);
    const path = d3.geoPath(projection);
    const max = d3.max(Object.values(counts)) || 1;
    const color = d3.scaleSequential([0, max], (t) => d3.interpolateBlues(.2 + t * .75));
    const svg = d3.select(target).html("").append("svg").attr("class", "map-svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("aria-label", "Map of policy measures in the GCC and Yemen");
    const polygons = svg.selectAll("path").data(features).join("path").attr("d", path).attr("class", "map-country").attr("fill", (feature) => { const country = COUNTRIES.find((name) => COUNTRY_CODES[name] === String(feature.id).padStart(3, "0")); return color(counts[country] || 0); }).attr("tabindex", 0).attr("role", "button").attr("aria-label", (feature) => { const country = COUNTRIES.find((name) => COUNTRY_CODES[name] === String(feature.id).padStart(3, "0")); return `${country}: ${counts[country] || 0} measures`; }).on("click keydown", (event, feature) => { if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return; if (event.type === "keydown") event.preventDefault(); const country = COUNTRIES.find((name) => COUNTRY_CODES[name] === String(feature.id).padStart(3, "0")); setFilter("country", country); });
    polygons.append("title").text((feature) => { const country = COUNTRIES.find((name) => COUNTRY_CODES[name] === String(feature.id).padStart(3, "0")); const countryRecords = records.filter((record) => record.country === country); const latest = latestDate(countryRecords); const topDomain = groupCount(countryRecords, (record) => record.domain)[0]?.[0] || "No domain records"; const monthCounts = groupCount(countryRecords, monthKey); return `${country}\n${countryRecords.length} measures\n${topDomain}\nMost active month: ${monthCounts[0]?.[0] || "Not available"}\nLatest: ${latest ? formatDate(latest) : "Not available"}`; });
    const geometryCountries = new Set(features.map((feature) => COUNTRIES.find((name) => COUNTRY_CODES[name] === String(feature.id).padStart(3, "0"))).filter(Boolean));
    if (!geometryCountries.has("Bahrain")) {
      const [x, y] = projection([50.55, 26.07]);
      const marker = svg.append("g").attr("class", "map-small-country").attr("transform", `translate(${x},${y})`).attr("role", "button").attr("tabindex", 0).attr("aria-label", `Bahrain: ${counts.Bahrain} measures`).on("click keydown", (event) => { if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return; if (event.type === "keydown") event.preventDefault(); setFilter("country", "Bahrain"); });
      marker.append("circle").attr("r", 6).attr("fill", color(counts.Bahrain)).attr("stroke", "white").attr("stroke-width", 2);
      marker.append("text").attr("x", 9).attr("y", 4).attr("fill", "#26475c").attr("font-size", 12).attr("font-weight", 600).text("Bahrain");
      marker.append("title").text(`Bahrain: ${counts.Bahrain} measures. Island polygon is not available in the map geometry.`);
    }
    const key = document.createElement("div"); key.className = "map-country-strip"; key.innerHTML = COUNTRIES.map((country) => `<button type="button" data-map-country="${escapeHtml(country)}"><span class="map-key-dot" style="background:${color(counts[country])}"></span><span>${escapeHtml(country)}</span><strong>${counts[country].toLocaleString()}</strong></button>`).join(""); target.append(key);
    $$('[data-map-country]', key).forEach((button) => button.addEventListener("click", () => setFilter("country", button.dataset.mapCountry)));
  } catch {
    if (generation !== mapRenderGeneration) return;
    target.innerHTML = `<div class="map-fallback">${COUNTRIES.map((country) => `<button data-country="${escapeHtml(country)}"><strong>${escapeHtml(country)}</strong><span>${counts[country].toLocaleString()} policy measures</span></button>`).join("")}</div>`;
    $$('[data-country]', target).forEach((button) => button.addEventListener("click", () => setFilter("country", button.dataset.country)));
  }
}

function renderOverviewPage() {
  const root = $("#page-content");
  root.innerHTML = renderOverview();
  const records = filtered();
  drawActivityChart("#activity-chart", records);
  renderCountryRank(records);
  drawTypeBars(records);
  drawFamilyDonut(records);
  drawHeatmap(records);
  renderMap(records);
  $$('[data-theme]').forEach((button) => button.addEventListener("click", () => { state.domain = button.dataset.theme; syncFilters(); render(); }));
  $$("[data-activity]").forEach((button) => button.addEventListener("click", () => { state.activityMode = button.dataset.activity; $$("[data-activity]").forEach((item) => item.setAttribute("aria-pressed", String(item === button))); drawActivityChart("#activity-chart", filtered(), state.activityMode); }));
  refreshIcons();
}

function renderTrendsPage() {
  const records = filtered();
  const actions = `<div class="chart-toolbar" id="activity-range">${["1m", "3m", "6m", "ytd", "1y", "all"].map((range) => `<button type="button" data-range="${range}" aria-pressed="${state.activityRange === range}">${({ "1m": "1 month", "3m": "3 months", "6m": "6 months", ytd: "YTD", "1y": "1 year", all: "All" })[range]}</button>`).join("")}</div>`;
  $("#page-content").innerHTML = `${heading("Policy trends", "Monthly activity and measure orientation across the current regional selection.", "POLICY ACTIVITY", actions)}<div class="kpi-grid">${kpi("Policy measures", records.length.toLocaleString(), "In current selection", "files", "kpi-primary")}${kpi("Short-term decisions", totalCount(records, "decision").toLocaleString(), "Dated policy decisions", "scale")}${kpi("Long-term frameworks", totalCount(records, "framework").toLocaleString(), "Dated policy frameworks", "book-open")}${kpi("Countries active", new Set(records.map((record) => record.country)).size.toString(), "Countries with measures", "map-pinned")}</div><div class="content-grid">${card("Monthly policy activity", "Select a month to cross-filter the dashboard.", `<div class="chart-wrap chart-tall" id="trend-main"></div><div class="legend-row"><span class="legend-item"><i style="background:#287bb0"></i>Short-term decisions</span><span class="legend-item"><i style="background:#40836d"></i>Long-term frameworks</span></div>`, "span-12", chartExplainButton("monthly activity"))}${card("Country activity", "Measures by country in the selected period.", `<div class="rank-list" id="trend-country-rank"></div>`, "span-6")}${card("Policy family mix", "Distribution from recorded categories.", `<div class="chart-wrap" id="trend-family"></div><div class="legend-row" id="trend-family-legend"></div>`, "span-6")}</div>`;
  const rangeButton = (range) => { state.activityRange = range; $$("[data-range]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.range === range))); drawActivityChart("#trend-main", rangeRecords(records, range), "all"); };
  $$("[data-range]").forEach((button) => button.addEventListener("click", () => rangeButton(button.dataset.range)));
  drawActivityChart("#trend-main", rangeRecords(records, state.activityRange), "all");
  renderCountryRank(records, "#trend-country-rank");
  drawFamilyDonutInto("#trend-family", "#trend-family-legend", records);
  refreshIcons();
}
function rangeRecords(records, range) {
  if (range === "all") return records;
  const monthly = aggregateMonthly(records);
  if (!monthly.length) return [];
  const last = monthly.at(-1)[0];
  const [year, month] = last.split("-").map(Number);
  const start = range === "ytd" ? `${year}-01` : (() => { const amount = range === "1m" ? 1 : range === "3m" ? 3 : range === "6m" ? 6 : 12; const date = new Date(Date.UTC(year, month - amount, 1)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`; })();
  return records.filter((record) => monthKey(record) >= start && monthKey(record) <= last);
}
function drawFamilyDonutInto(selector, legendSelector, records) {
  const target = d3.select(selector); target.selectAll("*").remove();
  const entries = groupCount(records, (record) => record.family);
  if (!entries.length) { target.html(emptyMarkup()); return; }
  const width = Math.max(250, target.node().clientWidth || 360), height = 245, radius = Math.min(width * .31, 96);
  const svg = target.append("svg").attr("viewBox", `0 0 ${width} ${height}`);
  const group = svg.append("g").attr("transform", `translate(${width / 2},${height / 2})`);
  const arc = d3.arc().innerRadius(radius * .63).outerRadius(radius);
  group.selectAll("path").data(d3.pie().sort(null).value((entry) => entry[1])(entries)).join("path").attr("d", arc).attr("fill", (entry) => familyColor(entry.data[0])).attr("stroke", "white").attr("stroke-width", 2).attr("class", "chart-mark").attr("tabindex", 0).on("click keydown", (event, entry) => { if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return; if (event.type === "keydown") event.preventDefault(); setFilter("family", entry.data[0]); }).append("title").text((entry) => `${entry.data[0]}: ${entry.data[1]}`);
  group.append("text").attr("class", "donut-center-value").attr("y", -2).text(records.length.toLocaleString());
  group.append("text").attr("class", "donut-center-label").attr("y", 18).text("measures");
  $(legendSelector).innerHTML = entries.map(([family, count]) => `<span class="legend-item"><i style="background:${familyColor(family)}"></i>${escapeHtml(family)} <strong>${count}</strong></span>`).join("");
}

function renderAreasPage() {
  const records = filtered();
  const domains = groupCount(records, (record) => record.domain);
  $("#page-content").innerHTML = `${heading("Policy areas", "Explore recorded policy domains and their distribution across the seven countries.", "POLICY TAXONOMY")}<div class="kpi-grid">${kpi("Policy domains", domains.length.toLocaleString(), "Distinct source categories", "shapes")}${kpi("Policy groups", new Set(records.map((record) => record.group)).size.toLocaleString(), "Mapped policy groups", "layers")}${kpi("Policy families", new Set(records.map((record) => record.family)).size.toLocaleString(), "Classification families", "folder-tree")}${kpi("Records in selection", records.length.toLocaleString(), "Current filter selection", "files", "kpi-primary")}</div><div class="content-grid">${card("Policy domains by volume", "Click a domain to filter all views.", `<div class="chart-wrap chart-tall" id="area-domain-chart"></div>`, "span-7")}${card("Policy family distribution", "Recorded classification families.", `<div class="chart-wrap" id="area-family-chart"></div><div class="legend-row" id="area-family-legend"></div>`, "span-5")}${card("Policy group breakdown", "Short-term group codes and long-term framework groupings.", `<div class="rank-list" id="group-rank"></div>`, "span-12")}</div>`;
  drawHorizontalBars("#area-domain-chart", domains.slice(0, 20), (domain) => { state.domain = domain; syncFilters(); render(); });
  drawFamilyDonutInto("#area-family-chart", "#area-family-legend", records);
  renderRankEntries(groupCount(records, (record) => record.group).slice(0, 20), "#group-rank", (group) => setFilter("group", group));
  refreshIcons();
}
function drawHorizontalBars(selector, entries, onClick = null) {
  const target = d3.select(selector); target.selectAll("*").remove();
  if (!entries.length) { target.html(emptyMarkup()); return; }
  const width = Math.max(350, target.node().clientWidth || 650), rowHeight = 28, height = entries.length * rowHeight + 20, margin = { top: 10, right: 35, bottom: 10, left: Math.min(270, width * .47) };
  const svg = target.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img");
  const x = d3.scaleLinear().domain([0, d3.max(entries, (d) => d[1]) || 1]).range([0, width - margin.left - margin.right]);
  const rows = svg.append("g").selectAll("g.chart-row").data(entries).join("g").attr("class", "chart-row").attr("transform", (_, i) => `translate(0,${margin.top + i * rowHeight})`).attr("tabindex", onClick ? 0 : null).on("click keydown", (event, entry) => { if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return; if (event.type === "keydown") event.preventDefault(); onClick?.(entry[0]); });
  rows.append("text").attr("x", margin.left - 9).attr("y", 16).attr("text-anchor", "end").attr("fill", "#526977").attr("font-size", 12).text((entry) => entry[0]);
  rows.append("rect").attr("x", margin.left).attr("y", 3).attr("height", 17).attr("width", (entry) => x(entry[1])).attr("rx", 4).attr("fill", (_, i) => d3.interpolateBlues(.45 + .48 * (1 - i / entries.length)));
  rows.append("text").attr("x", (entry) => margin.left + x(entry[1]) + 7).attr("y", 16).attr("fill", "#39586b").attr("font-size", 12).text((entry) => entry[1].toLocaleString());
  rows.append("title").text((entry) => `${entry[0]}: ${entry[1]} policy measures`);
}

function renderCountryPage() {
  if (state.country === "all") { state.country = "Saudi Arabia"; syncFilters(); }
  const country = state.country === "all" ? "Saudi Arabia" : state.country;
  const records = filtered().filter((record) => record.country === country);
  const recent = [...records].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const domains = groupCount(records, (record) => record.domain);
  const institutions = groupCount(records, (record) => record.institution).slice(0, 6);
  $("#page-content").innerHTML = `${heading(`${country} intelligence`, "Country profile, policy mix, activity and most recent developments.", "COUNTRY INTELLIGENCE", `<label class="country-switcher">Select country<select id="country-page-select">${COUNTRIES.map((name) => `<option ${name === country ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></label>`)}<div class="kpi-grid">${kpi("Total measures", records.length.toLocaleString(), "In the current selection", "files", "kpi-primary")}${kpi("Short-term decisions", totalCount(records, "decision").toLocaleString(), "Policy decisions", "scale")}${kpi("Long-term frameworks", totalCount(records, "framework").toLocaleString(), "Policy frameworks", "book-open")}${kpi("Top policy area", domains[0]?.[0] || "Not available", domains[0] ? `${domains[0][1]} measures` : "No records", "shapes")}</div><div class="content-grid">${card("Monthly activity", `Measure counts for ${escapeHtml(country)}.`, `<div class="chart-wrap" id="country-activity"></div>`, "span-7")}${card("Policy family mix", "Recorded measures by family.", `<div class="chart-wrap" id="country-family"></div><div class="legend-row" id="country-family-legend"></div>`, "span-5")}${card("Top institutions", "Decision-making institutions named in the records.", `<div class="rank-list" id="institution-rank"></div>`, "span-5")}${card("Latest developments", "Most recent records, with direct source links.", `<div class="record-list">${recent.length ? recent.slice(0, 8).map(recordCard).join("") : emptyMarkup()}</div>`, "span-7")}${card("Policy timeline", "Chronological developments for this country.", `<div class="timeline-list">${recent.length ? recent.slice(0, 30).map(timelineItem).join("") : emptyMarkup()}</div>`, "span-12")}`;
  $("#country-page-select").addEventListener("change", (event) => setFilter("country", event.target.value));
  drawActivityChart("#country-activity", records);
  drawFamilyDonutInto("#country-family", "#country-family-legend", records);
  renderRankEntries(institutions, "#institution-rank");
  refreshIcons();
}

function renderComparePage() {
  const choices = state.compareCountries;
  const records = filtered();
  const measures = choices.map((country) => ({ country, records: records.filter((record) => record.country === country) }));
  $("#page-content").innerHTML = `${heading("Country comparison", "Compare up to three countries using the same policy record and global filters.", "COMPARATIVE ANALYSIS", `<button class="button button-outline" id="add-compare" ${choices.length >= 3 ? "disabled title='Compare up to three countries'" : ""}><i data-lucide="plus"></i>Add country</button>`)}<div class="compare-selectors">${choices.map((country, i) => `<label>Country ${i + 1}<select data-compare="${i}">${COUNTRIES.map((name) => `<option ${country === name ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></label>`).join("")}</div><div class="content-grid">${card("Policy orientation", "Short-term decisions and long-term frameworks by country.", `<div class="chart-wrap chart-tall" id="compare-type"></div>`, "span-7")}${card("Policy family mix", "Shares from observed categories.", `<div class="chart-wrap" id="compare-family"></div>`, "span-5")}${card("Monthly activity", "Monthly policy measure counts by country.", `<div class="chart-wrap chart-tall" id="compare-monthly"></div>`, "span-12")}${card("Comparison table", "Counts and leading recorded domains.", `<div class="table-wrap"><table class="data-table"><thead><tr><th>Country</th><th>Total</th><th>Short-term</th><th>Long-term</th><th>Leading policy domain</th><th>Institutions</th></tr></thead><tbody>${measures.map(({ country, records: rows }) => `<tr><td><strong>${escapeHtml(country)}</strong></td><td>${rows.length}</td><td>${totalCount(rows, "decision")}</td><td>${totalCount(rows, "framework")}</td><td>${escapeHtml(groupCount(rows, (r) => r.domain)[0]?.[0] || "Not available")}</td><td>${new Set(rows.map((r) => r.institution).filter(Boolean)).size}</td></tr>`).join("")}</tbody></table></div>`, "span-12")}</div>`;
  $$('[data-compare]').forEach((select) => select.addEventListener("change", (event) => { state.compareCountries[Number(event.target.dataset.compare)] = event.target.value; renderComparePage(); }));
  $("#add-compare").addEventListener("click", () => { const next = COUNTRIES.find((name) => !state.compareCountries.includes(name)); if (state.compareCountries.length >= 3) showToast("Country comparison supports up to three countries."); else if (next) { state.compareCountries.push(next); renderComparePage(); } else showToast("All seven countries are already selected."); });
  drawComparisonType("#compare-type", measures);
  drawComparisonFamilies("#compare-family", measures);
  drawComparisonMonthly("#compare-monthly", measures);
  refreshIcons();
}
function drawComparisonType(selector, countries) {
  const target = d3.select(selector); target.selectAll("*").remove();
  if (!countries.some((country) => country.records.length)) { target.html(emptyMarkup()); wireEmptyActions(); return; }
  const data = countries.map(({ country, records }) => ({ country, decision: totalCount(records, "decision"), framework: totalCount(records, "framework") }));
  const width = Math.max(360, target.node().clientWidth || 680), height = 300, margin = { top: 20, right: 24, bottom: 42, left: 50 };
  const svg = target.append("svg").attr("viewBox", `0 0 ${width} ${height}`);
  const x0 = d3.scaleBand().domain(data.map((d) => d.country)).range([margin.left, width - margin.right]).padding(.22);
  const x1 = d3.scaleBand().domain(["decision", "framework"]).range([0, x0.bandwidth()]).padding(.1);
  const y = d3.scaleLinear().domain([0, d3.max(data, (d) => Math.max(d.decision, d.framework)) || 1]).nice().range([height - margin.bottom, margin.top]);
  svg.append("g").attr("class", "chart-grid").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(width - margin.left - margin.right)));
  svg.append("g").attr("class", "chart-axis").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x0).tickFormat((name) => name === "United Arab Emirates" ? "UAE" : name === "Saudi Arabia" ? "Saudi" : name));
  svg.append("g").selectAll("g").data(data).join("g").attr("transform", (d) => `translate(${x0(d.country)},0)`).selectAll("rect").data((d) => [{ key: "decision", value: d.decision, country: d.country }, { key: "framework", value: d.framework, country: d.country }]).join("rect").attr("x", (d) => x1(d.key)).attr("y", (d) => y(d.value)).attr("width", x1.bandwidth()).attr("height", (d) => y(0) - y(d.value)).attr("fill", (d) => d.key === "decision" ? "#287bb0" : "#40836d").attr("class", "chart-mark").attr("tabindex", 0).on("click keydown", (event, item) => { if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return; if (event.type === "keydown") event.preventDefault(); state.country = item.country; state.type = item.key; syncFilters(); render(); }).append("title").text((d) => `${d.country} · ${d.key}: ${d.value}`);
}
function drawComparisonFamilies(selector, countries) {
  const target = d3.select(selector); target.selectAll("*").remove();
  if (!countries.some((country) => country.records.length)) { target.html(emptyMarkup()); wireEmptyActions(); return; }
  const width = Math.max(280, target.node().clientWidth || 410), height = 280, margin = { top: 18, right: 15, bottom: 40, left: 48 };
  const series = [...new Set(countries.flatMap(({ records }) => records.map((record) => record.family)))];
  const data = countries.map(({ country, records }) => Object.assign({ country }, Object.fromEntries(series.map((family) => [family, records.filter((record) => record.family === family).length]))));
  const svg = target.append("svg").attr("viewBox", `0 0 ${width} ${height}`);
  const x0 = d3.scaleBand().domain(data.map((d) => d.country)).range([margin.left, width - margin.right]).padding(.2);
  const x1 = d3.scaleBand().domain(series).range([0, x0.bandwidth()]).padding(.06);
  const y = d3.scaleLinear().domain([0, d3.max(data, (d) => d3.max(series, (key) => d[key])) || 1]).nice().range([height - margin.bottom, margin.top]);
  svg.append("g").attr("class", "chart-axis").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x0).tickFormat((name) => name === "United Arab Emirates" ? "UAE" : name === "Saudi Arabia" ? "Saudi" : name));
  svg.append("g").attr("class", "chart-axis").call(d3.axisLeft(y).ticks(4));
  svg.append("g").selectAll("g").data(data).join("g").attr("transform", (d) => `translate(${x0(d.country)},0)`).selectAll("rect").data((d) => series.map((family) => ({ family, count: d[family], country: d.country }))).join("rect").attr("x", (d) => x1(d.family)).attr("y", (d) => y(d.count)).attr("width", x1.bandwidth()).attr("height", (d) => y(0) - y(d.count)).attr("fill", (d) => familyColor(d.family)).attr("class", "chart-mark").attr("tabindex", 0).on("click keydown", (event, item) => { if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return; if (event.type === "keydown") event.preventDefault(); state.country = item.country; state.family = item.family; syncFilters(); render(); }).append("title").text((d) => `${d.country} · ${d.family}: ${d.count}`);
}
function drawComparisonMonthly(selector, countries) {
  const target = d3.select(selector); target.selectAll("*").remove();
  if (!countries.some((country) => country.records.length)) { target.html(emptyMarkup()); wireEmptyActions(); return; }
  const series = countries.map(({ country, records }) => ({ country, monthly: new Map(aggregateMonthly(records).map(([month, counts]) => [month, counts.total])) }));
  const months = [...new Set(series.flatMap((entry) => [...entry.monthly.keys()]))].sort();
  const width = Math.max(360, target.node().clientWidth || 1000), height = 310, margin = { top: 15, right: 20, bottom: 45, left: 48 };
  const svg = target.append("svg").attr("viewBox", `0 0 ${width} ${height}`);
  const x = d3.scalePoint().domain(months).range([margin.left, width - margin.right]).padding(.2);
  const max = d3.max(series, (entry) => d3.max(months, (month) => entry.monthly.get(month) || 0)) || 1;
  const y = d3.scaleLinear().domain([0, max * 1.1]).nice().range([height - margin.bottom, margin.top]);
  svg.append("g").attr("class", "chart-grid").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(width - margin.left - margin.right)));
  svg.append("g").attr("class", "chart-axis").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).tickValues(months.filter((_, i) => i % Math.max(1, Math.ceil(months.length / 11)) === 0)).tickFormat((key) => { const [yr, mon] = key.split("-"); return `${MONTHS[Number(mon) - 1].slice(0, 3)} '${yr.slice(-2)}`; }));
  const color = d3.scaleOrdinal().domain(series.map((entry) => entry.country)).range(["#116aab", "#49806a", "#b7852f"]);
  series.forEach((entry) => { const line = d3.line().defined((month) => entry.monthly.has(month)).x((month) => x(month)).y((month) => y(entry.monthly.get(month) || 0)).curve(d3.curveMonotoneX); svg.append("path").datum(months).attr("d", line).attr("fill", "none").attr("stroke", color(entry.country)).attr("stroke-width", 2.5); });
  target.append("div").attr("class", "legend-row").html(series.map((entry) => `<span class="legend-item"><i style="background:${color(entry.country)}"></i>${escapeHtml(entry.country)}</span>`).join(""));
}

function recordCard(record) {
  const href = safeUrl(record.source);
  return `<details class="record-card"><summary><span class="record-card-title">${escapeHtml(record.title)}</span><span class="record-card-meta"><span>${escapeHtml(record.country)}</span><span>${escapeHtml(formatDate(record.date))}</span><span class="type-badge ${record.type === "framework" ? "framework" : ""}">${record.type === "decision" ? "Short-term" : "Long-term"}</span></span></summary><div class="record-description">${escapeHtml(record.description)}</div>${record.institution ? `<div class="record-institution">Institution: ${escapeHtml(record.institution)}</div>` : ""}<div class="record-card-meta"><span>${escapeHtml(record.family)}</span><span>${escapeHtml(record.domain)}</span></div>${href ? `<a class="source-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">View original source ↗</a>` : "<span class='heading-meta'>No source URL in this record</span>"}</details>`;
}
function timelineItem(record) {
  return `<article class="timeline-item"><div class="timeline-date">${escapeHtml(formatDate(record.date))}</div><div class="timeline-body"><span class="type-badge ${record.type === "framework" ? "framework" : ""}">${record.type === "decision" ? "Short-term decision" : "Long-term framework"}</span><h3>${escapeHtml(record.title)}</h3><p>${escapeHtml(record.description.slice(0, 260))}${record.description.length > 260 ? "…" : ""}</p><div class="record-card-meta"><span>${escapeHtml(record.domain)}</span><span>${escapeHtml(record.institution || "Institution not stated")}</span></div>${safeUrl(record.source) ? `<a class="source-link" href="${escapeHtml(record.source)}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : ""}</div></article>`;
}
function emptyMarkup(title = "No matching policy measures", body = "Adjust your filters or reset the current selection.") {
  return `<div class="empty-state">${icon("search-x", 25)}<h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p><button class="button button-outline" type="button" data-reset-empty>Reset filters</button></div>`;
}
function wireEmptyActions() { $$("[data-reset-empty]").forEach((button) => button.addEventListener("click", resetFilters)); }

function renderRecordsPage() {
  const records = filtered().slice().sort((a, b) => {
    const av = a[state.sortKey] ?? "", bv = b[state.sortKey] ?? "";
    return String(av).localeCompare(String(bv), undefined, { numeric: true }) * (state.sortDirection === "asc" ? 1 : -1);
  });
  const pages = Math.max(1, Math.ceil(records.length / PAGE_SIZE)); state.pageNumber = Math.min(state.pageNumber, pages);
  const visible = records.slice((state.pageNumber - 1) * PAGE_SIZE, state.pageNumber * PAGE_SIZE);
  const headers = [["date", "Date"], ["country", "Country"], ["title", "Policy measure"], ["type", "Type"], ["family", "Family"], ["domain", "Policy domain"], ["institution", "Institution"], ["source", "Source"]].filter(([key]) => state.columns.has(key));
  $("#page-content").innerHTML = `${heading("Policy records", "Search, sort and export the underlying monitored measures.", "EVIDENCE EXPLORER", `<button class="button button-outline" id="export-csv">${icon("file-down")}CSV</button><button class="button button-outline" id="export-xlsx">${icon("sheet")}Excel</button><div class="column-menu"><details><summary>${icon("columns-3")}Columns</summary><div class="column-options">${[["date","Date"],["country","Country"],["title","Policy measure"],["type","Type"],["family","Family"],["domain","Policy domain"],["institution","Institution"],["source","Source"]].map(([key,label]) => `<label><input type="checkbox" data-column="${key}" ${state.columns.has(key)?"checked":""}>${label}</label>`).join("")}</div></details></div>`)}<div class="table-toolbar"><div><strong>${records.length.toLocaleString()} records</strong><span class="heading-meta"> · Sorted ${escapeHtml(state.sortKey)} ${state.sortDirection}</span></div><label class="table-search">${icon("search")}<span class="sr-only">Search policy records</span><input id="record-search" value="${escapeHtml(state.keyword)}" placeholder="Search country, topic, institution or measure" /></label></div><div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(([key,label]) => `<th><button class="sort-button" data-sort="${key}">${label}${icon(state.sortKey === key ? state.sortDirection === "asc" ? "arrow-up" : "arrow-down" : "arrow-up-down", 12)}</button></th>`).join("")}</tr></thead><tbody>${visible.length ? visible.map((record) => `<tr data-record-id="${record.id}">${headers.map(([key]) => `<td>${renderCell(record,key)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${headers.length}">${emptyMarkup()}</td></tr>`}</tbody></table></div><div class="table-footer"><span>Showing ${records.length ? (state.pageNumber-1)*PAGE_SIZE+1 : 0}–${Math.min(state.pageNumber*PAGE_SIZE,records.length)} of ${records.length.toLocaleString()}</span><div class="pagination"><button data-page="prev" ${state.pageNumber<=1?"disabled":""} aria-label="Previous page">${icon("chevron-left")}</button><span class="pagination-status">${state.pageNumber} / ${pages}</span><button data-page="next" ${state.pageNumber>=pages?"disabled":""} aria-label="Next page">${icon("chevron-right")}</button></div></div>`;
  $("#record-search").addEventListener("input", (event) => { state.keyword = event.target.value; state.pageNumber = 1; renderRecordsPage(); const input = $("#record-search"); input.focus(); input.setSelectionRange(input.value.length, input.value.length); });
  $$('[data-sort]').forEach((button) => button.addEventListener("click", () => { const key = button.dataset.sort; state.sortDirection = state.sortKey === key && state.sortDirection === "desc" ? "asc" : "desc"; state.sortKey = key; renderRecordsPage(); }));
  $$('[data-page]').forEach((button) => button.addEventListener("click", () => { state.pageNumber += button.dataset.page === "next" ? 1 : -1; renderRecordsPage(); }));
  $$('[data-column]').forEach((input) => input.addEventListener("change", () => { if (input.checked) state.columns.add(input.dataset.column); else if (state.columns.size > 1) state.columns.delete(input.dataset.column); renderRecordsPage(); }));
  $("#export-csv").addEventListener("click", () => exportCsv(records));
  $("#export-xlsx").addEventListener("click", () => exportXlsx(records));
  $$("[data-record-id]").forEach((row) => row.addEventListener("click", (event) => { if (event.target.closest("a,button,input")) return; const record = state.records.find((item) => item.id === row.dataset.recordId); if (record) openRecordDrawer(record); }));
  wireEmptyActions(); refreshIcons();
}
function renderCell(record, key) {
  if (key === "date") return escapeHtml(formatDate(record.date));
  if (key === "country") return escapeHtml(record.country);
  if (key === "type") return `<span class="type-badge ${record.type === "framework" ? "framework" : ""}">${record.type === "decision" ? "Short-term" : "Long-term"}</span>`;
  if (key === "title") return `<div class="table-measure">${escapeHtml(record.title)}<small>${escapeHtml(record.description.slice(0, 130))}${record.description.length > 130 ? "…" : ""}</small></div>`;
  if (key === "source") return safeUrl(record.source) ? `<a class="source-link" href="${escapeHtml(record.source)}" target="_blank" rel="noopener noreferrer">Open ↗</a>` : "Not provided";
  return escapeHtml(record[key] || "Not stated");
}
function openRecordDrawer(record) {
  $("#record-drawer")?.remove();
  const aside = document.createElement("aside");
  aside.id = "record-drawer"; aside.className = "assistant-panel open"; aside.setAttribute("role", "dialog"); aside.setAttribute("aria-modal", "true"); aside.setAttribute("aria-label", "Policy record detail");
  aside.innerHTML = `<div class="assistant-header"><div><span class="ai-icon">${icon("file-text")}</span><div><strong>Policy measure detail</strong><small>${escapeHtml(record.id)}</small></div></div><button class="icon-button" id="close-record-drawer" aria-label="Close detail">${icon("x")}</button></div><div class="assistant-messages"><div class="eyebrow">${escapeHtml(record.country)} · ${escapeHtml(formatDate(record.date))}</div><h2 class="drawer-title">${escapeHtml(record.title)}</h2><div class="record-card-meta"><span class="type-badge ${record.type === "framework" ? "framework" : ""}">${escapeHtml(record.typeLabel)}</span><span class="family-badge">${escapeHtml(record.family)}</span></div><h3>Policy domain</h3><p>${escapeHtml(record.group)} · ${escapeHtml(record.domain)}</p><h3>Full description</h3><p class="record-description">${escapeHtml(record.description)}</p><h3>Decision-making institution</h3><p>${escapeHtml(record.institution || "Not stated in the source record")}</p><h3>Source</h3>${safeUrl(record.source) ? `<a class="source-link" href="${escapeHtml(record.source)}" target="_blank" rel="noopener noreferrer">Open original source ↗</a>` : "<p>Source link not provided.</p>"}<h3>Related policy measures</h3><div class="record-list">${state.records.filter((item) => item.id !== record.id && item.country === record.country && (item.domain === record.domain || item.group === record.group)).slice(0,3).map((item) => `<div class="related-record"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(formatDate(item.date))} · ${escapeHtml(item.domain)}</small></div>`).join("") || "<p>No related records found.</p>"}</div><div class="drawer-ai"><strong>AI summary</strong><p>Request a sourced summary from Ask Policy AI. This record will be searched with the regional dataset.</p><button class="button button-primary" id="summarize-record">${icon("sparkles")}Ask about this record</button></div></div>`;
  document.body.append(aside); $("#panel-scrim").classList.add("visible"); $("#panel-scrim").onclick = closeRecordDrawer;
  $("#close-record-drawer").onclick = closeRecordDrawer;
  $("#summarize-record").onclick = () => { closeRecordDrawer(); openAssistant(`Summarise policy measure ${record.id} and cite its source.`); };
  refreshIcons();
}
function closeRecordDrawer() { $("#record-drawer")?.remove(); $("#panel-scrim").classList.remove("visible"); }
function exportCsv(records) {
  const columns = [["date","Date"],["country","Country"],["typeLabel","Policy type"],["family","Policy family"],["group","Policy group"],["domain","Policy domain"],["title","Policy measure"],["description","Description"],["institution","Institution"],["source","Source URL"]];
  const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const data = [columns.map(([,label]) => quote(label)).join(","), ...records.map((record) => columns.map(([key]) => quote(record[key])).join(","))].join("\r\n");
  downloadBlob(new Blob(["\uFEFF",data], { type: "text/csv;charset=utf-8" }), "gcc-yemen-policy-records.csv");
}
function exportXlsx(records) {
  if (!window.XLSX) { showToast("Excel export library did not load. Use CSV export instead.", "error"); return; }
  const rows = records.map(({ id, country, date, year, typeLabel, family, group, domain, title, description, institution, source }) => ({ ID: id, Country: country, Date: date, Year: year, Type: typeLabel, Family: family, Group: group, Domain: domain, Measure: title, Description: description, Institution: institution, Source: source }));
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Policy Measures"); XLSX.writeFile(workbook, "gcc-yemen-policy-records.xlsx");
}
function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

function renderCountryRecordsPage() { renderRecordsPage(); }
function renderMethodologyPage() {
  const latest = latestDate(state.records);
  const noAi = !$("meta[name='policy-ai-endpoint']")?.content;
  $("#page-content").innerHTML = `${heading("Methodology & sources", "How the monitored records are classified, filtered and interpreted.", "ABOUT THIS PLATFORM")}<div class="content-grid">${card("Purpose and coverage", "The dashboard supports monitoring and analysis, not legal interpretation.", `<p>This platform organises reported food and agriculture policy developments for <strong>the six GCC member states and Yemen</strong>: Bahrain, Kuwait, Oman, Qatar, Saudi Arabia, the United Arab Emirates and Yemen.</p><p>Current source coverage: <strong>${state.records.length.toLocaleString()} unique records</strong> spanning ${Math.min(...state.records.map((record)=>record.year||2023))}–${Math.max(...state.records.map((record)=>record.year||2026))}. Latest dated record: <strong>${escapeHtml(formatDate(latest))}</strong>.</p>`, "span-6")}${card("Classification", "Families and groups follow the source workbook coding.", `<h3>Short-term policy decisions</h3><p>Decision records use the leading code digits to classify Consumer-oriented, Producer-oriented or Trade-oriented measures and their groups.</p><h3>Long-term policy frameworks</h3><p>Framework records are grouped under development planning, food security and nutrition, agriculture and rural development, social protection and employment, natural resources and climate, trade and value chains, disaster risk management, and gender.</p><p>Domains and institutions are shown as supplied in the source record.</p>`, "span-6")}${card("Data processing and limitations", "No missing values are inferred as facts.", `<ul class="method-list"><li>Duplicate records are removed by type, country, date and the first 160 characters of description.</li><li>Excel serial dates are converted to ISO dates.</li><li>Country aliases are normalised in the source-generation script.</li><li>Rows with Excel error values in the country field are excluded rather than assigned an inferred country.</li><li>Record summaries may omit context from their original source; review the source before using a finding.</li></ul>`, "span-6")}${card("AI methodology and limitations", "Secure backend configuration is required for model-generated answers.", `<p>${noAi ? "AI responses are not enabled on this GitHub Pages deployment. The assistant can show locally matched evidence records, but it does not claim that these are model-generated answers." : "AI requests are sent to the configured server endpoint, which retrieves records server-side and returns traceable record citations."}</p><p>Any generated analysis should be treated as a research aid. Verify material claims against cited original sources. The API key is not stored in this static site.</p>`, "span-6")}${card("Food price and healthy diet indicators", "FAOSTAT annual indicators shown on the Food Prices & Diets page and in reports.", `<ul class="method-list"><li><strong>Producer prices</strong> (FAOSTAT PP): annual farm-gate prices per tonne in USD and local currency, 2020–2024. Live-weight meat duplicates and non-food items are excluded; USD values inconsistent with official currency pegs are recomputed from local-currency prices.</li><li><strong>Cost and affordability of a healthy diet</strong> (FAOSTAT CAHD): PPP dollars per person per day, 2020–2025, with food-group costs for 2021 and unaffordability where reported.</li><li>Series that repeat one value every year are treated as carried-forward estimates and excluded from change statistics; year-on-year swings above 60% are flagged for verification.</li><li>Coverage gaps: no producer prices for the United Arab Emirates and no healthy diet estimates for Yemen.</li></ul>`, "span-12")}${card("Disclaimer", "Policy monitoring, not legal advice.", `<p>Policy measures are short summaries compiled from publicly available sources for monitoring and analysis. They are not legal texts and do not represent an official or legal interpretation. Always consult the original source.</p>`, "span-12")}</div>`;
  refreshIcons();
}

function renderAiPage() {
  const records = filtered();
  const mode = state.aiSearchMode || "question";
  $("#page-content").innerHTML = `${heading("AI Policy Analyst", "Ask questions about the regional policy record with source citations.", "POLICY INTELLIGENCE ASSISTANT", `<div class="ai-availability ${$("meta[name='policy-ai-endpoint']")?.content ? "connected" : "offline"}"><span class="status-dot"></span>${$("meta[name='policy-ai-endpoint']")?.content ? "Secure endpoint configured" : "Evidence search available · AI endpoint not connected"}</div>`)}<div class="content-grid"><section class="card span-8"><div class="card-header"><div><h2 class="card-title">Policy Intelligence Assistant</h2><p class="card-subtitle">Ask about policy measures, periods, countries and recorded source evidence.</p></div></div><div class="card-body"><div class="assistant-inline-messages" id="ai-page-messages"><div class="assistant-welcome"><h2>Ask with evidence.</h2><p>Answers should identify supporting records. If the secure AI service is unavailable, matching evidence is still shown without pretending to generate an AI answer.</p><div class="starter-questions">${["What were the latest UAE food security policy developments?","Compare Saudi Arabia and Oman agriculture measures.","Which policy themes increased in the latest year?"].map((question)=>`<button type="button" data-question="${escapeHtml(question)}">${escapeHtml(question)}</button>`).join("")}</div></div></div><form class="assistant-compose inline-compose" id="ai-page-form"><label class="sr-only" for="ai-page-input">Ask a policy question</label><textarea id="ai-page-input" rows="3" placeholder="Ask a question about GCC States and Yemen policy…" required></textarea><div><span>${records.length.toLocaleString()} records in current filters</span><button class="button button-primary" type="submit">${icon("send")}Ask Policy AI</button></div></form><div class="assistant-config" id="ai-page-config" ${$("meta[name='policy-ai-endpoint']")?.content ? "hidden" : ""}>Secure AI is not deployed on GitHub Pages. Evidence results below are local record matches, not model-generated answers. Deploy the API and set the endpoint to enable RAG responses.</div></div></section>${card("Try a question", "Examples grounded in the current source collection.", `<div class="ai-capabilities"><div>${icon("quote")}<span>Ask for summaries with cited records.</span></div><div>${icon("git-compare-arrows")}<span>Compare country activity and recorded domains.</span></div><div>${icon("chart-no-axes-combined")}<span>Explain observed changes from the filtered data.</span></div><div>${icon("languages")}<span>Questions can be submitted in Arabic; model language quality depends on the configured endpoint.</span></div></div>`, "span-4")}</div>`;
  $("#ai-page-form").addEventListener("submit", (event) => { event.preventDefault(); askAssistant($("#ai-page-input").value, $("#ai-page-messages"), true); });
  $$('[data-question]').forEach((button) => button.addEventListener("click", () => { $("#ai-page-input").value = button.dataset.question; askAssistant(button.dataset.question, $("#ai-page-messages"), true); }));
  refreshIcons();
}

function openAssistant(prefill = "") {
  $("#assistant-panel").classList.add("open"); $("#assistant-panel").setAttribute("aria-hidden", "false"); $("#panel-scrim").classList.add("visible");
  if (prefill) $("#assistant-input").value = prefill;
  $("#assistant-input").focus();
}
function closeAssistant() { $("#assistant-panel").classList.remove("open"); $("#assistant-panel").setAttribute("aria-hidden", "true"); $("#panel-scrim").classList.remove("visible"); }
const OUT_OF_SCOPE_COUNTRIES = ["Algeria", "Egypt", "Iraq", "Jordan", "Lebanon", "Libya", "Mauritania", "Morocco", "Palestine", "Sudan", "Syria", "Tunisia"];
function outOfScopeCountry(question) {
  const normalized = normalizeText(question);
  return OUT_OF_SCOPE_COUNTRIES.find((country) => new RegExp(`\\b${country.toLocaleLowerCase()}\\b`, "i").test(normalized));
}
function localEvidence(question, sourceRecords = filtered()) {
  const outsideCountry = outOfScopeCountry(question);
  if (outsideCountry) return { outsideCountry, records: [] };
  const tokens = normalizeText(question).split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 2);
  const synonyms = { reserves: ["storage", "stocks", "reserve"], resilience: ["supply", "availability", "chain", "imports"], wheat: ["cereal", "grain", "flour"], fisheries: ["fish", "aquaculture"], water: ["irrigation", "desalination", "water"], trade: ["export", "import", "customs", "trade"], الاستدامة: ["sustainability", "climate", "water"], الأمن: ["security", "resilience", "reserves"], الغذاء: ["food", "security", "nutrition"], المياه: ["water", "irrigation", "desalination"], الزراعة: ["agriculture", "farming", "crops"] };
  const extended = new Set(tokens.flatMap((token) => [token, ...(synonyms[token] || [])]));
  const records = sourceRecords.map((record) => {
    const text = `${record.country} ${record.title} ${record.description} ${record.domain} ${record.group} ${record.institution}`.toLocaleLowerCase();
    const score = [...extended].reduce((sum, token) => sum + (text.includes(token) ? token.length > 5 ? 2 : 1 : 0), 0);
    return { record, score };
  }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score || (b.record.date || "").localeCompare(a.record.date || "")).slice(0, 8).map((entry) => entry.record);
  return { outsideCountry: null, records };
}
async function consumeAssistantStream(response, message) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sources = [];
  message.textContent = "";
  const consume = (block) => {
    const eventName = block.split(/\r?\n/).find((line) => line.startsWith("event:"))?.slice(6).trim();
    const data = block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
    if (!data) return;
    const payload = JSON.parse(data);
    if (eventName === "sources") sources = payload;
    else if (eventName === "delta") message.textContent += payload.text || "";
    else if (eventName === "error") throw new Error(payload.error || "The AI response stream failed.");
  };
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";
    blocks.forEach(consume);
    if (done) break;
  }
  if (buffer.trim()) consume(buffer);
  const sourceIds = new Set(sources.map((source) => String(source.id)));
  const groundedAnswer = message.textContent.replace(/\[([a-f0-9]{16})\]/gi, (citation, id) => sourceIds.has(id) ? citation : "");
  message.innerHTML = `${escapeHtml(groundedAnswer)}${renderCitations(sources)}`;
}
async function askAssistant(question, container, pageContext = false) {
  const cleanQuestion = question.trim(); if (!cleanQuestion) return;
  container.insertAdjacentHTML("beforeend", `<div class="chat-message">${escapeHtml(cleanQuestion)}</div><div class="chat-message assistant" data-response="pending"><span class="loading-mark small"></span>Searching regional evidence…</div>`);
  container.scrollTop = container.scrollHeight;
  const endpoint = $("meta[name='policy-ai-endpoint']")?.content.trim();
  const pending = $('[data-response="pending"]', container);
  try {
    if (endpoint) {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: cleanQuestion, stream: true, filters: { country: state.country, year: state.year, month: state.month, type: state.type, family: state.family, group: state.group, domain: state.domain, institution: state.institution, from: state.from, to: state.to } }) });
      if (response.headers.get("content-type")?.includes("text/event-stream")) {
        await consumeAssistantStream(response, pending);
        pending.removeAttribute("data-response");
        container.scrollTop = container.scrollHeight;
        if (!pageContext) $("#assistant-input").value = "";
        refreshIcons();
        return;
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `AI request failed (${response.status})`);
      pending.innerHTML = `${escapeHtml(result.answer)}${renderCitations(result.sources || [])}`;
    } else {
      const result = localEvidence(cleanQuestion);
      const matches = result.records;
      if (result.outsideCountry) {
        pending.textContent = `This dashboard covers GCC States and Yemen, so I can’t answer questions about ${result.outsideCountry}.`;
      } else if (!matches.length) pending.innerHTML = "No matching GCC/Yemen records were found in the current source data. Try a country name, policy area, date or related term. This is evidence search, not an AI-generated answer.";
      else pending.innerHTML = `Secure AI is not configured for this GitHub Pages site, so I can’t provide a generated analysis. These ${matches.length} records are the closest local matches to your question.${matches.map((record) => `<div class="evidence-result"><strong>${escapeHtml(record.country)} · ${escapeHtml(formatDate(record.date))}</strong><p>${escapeHtml(record.title)}</p><small>${escapeHtml(record.domain)} · ${escapeHtml(record.institution || "Institution not stated")}</small>${safeUrl(record.source) ? `<a href="${escapeHtml(record.source)}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : ""}</div>`).join("")}`;
    }
  } catch (error) {
    pending.innerHTML = `The assistant could not complete this request: ${escapeHtml(error.message)}. You can still search the policy records below.`;
  }
  pending.removeAttribute("data-response");
  container.scrollTop = container.scrollHeight;
  if (!pageContext) $("#assistant-input").value = "";
  refreshIcons();
}
function renderCitations(sources) { return `<div class="chat-sources"><strong>Supporting records</strong>${sources.map((source) => `<a href="${escapeHtml(safeUrl(source.url || source.source) || "#")}" target="_blank" rel="noopener noreferrer">[${escapeHtml(source.id)}] ${escapeHtml(source.country)} · ${escapeHtml(formatDate(source.date))} · ${escapeHtml(source.title)}</a>`).join("")}</div>`; }

function renderDashboardPage() {
  $("#current-page-label").textContent = pageLabels[state.page] || "Overview";
  $$("[data-nav]").forEach((button) => button.classList.toggle("active", button.dataset.nav === state.page));
  if (state.page === "overview") renderOverviewPage();
  else if (state.page === "country") renderCountryPage();
  else if (state.page === "trends") renderTrendsPage();
  else if (state.page === "areas") renderAreasPage();
  else if (state.page === "compare") renderComparePage();
  else if (state.page === "network") renderNetworkPage(ui);
  else if (state.page === "prices") withFoodData(renderPricesPage);
  else if (state.page === "records") renderRecordsPage();
  else if (state.page === "ai") renderAiPage();
  else if (state.page === "reports") withFoodData(renderReportsPage);
  else if (state.page === "methodology") renderMethodologyPage();
  else renderOverviewPage();
  renderActiveFilters();
  refreshIcons();
  window.scrollTo({ top: 0, behavior: "instant" });
}
const pageLabels = { overview: "Overview", country: "Country Intelligence", trends: "Policy Trends", areas: "Policy Areas", compare: "Country Comparison", network: "Policy Network", prices: "Food Prices & Diets", records: "Policy Records", ai: "AI Policy Analyst", reports: "Reports", methodology: "Methodology & Sources" };
function setPage(page) { if (!pageLabels[page]) return; state.page = page; history.replaceState(null, "", `#${page}`); closeMobileSidebar(); renderDashboardPage(); }
function setFilter(key, value) { state[key] = value || "all"; state.pageNumber = 1; syncFilters(); render(); }
function render() { renderDashboardPage(); }
function resetFilters() { state.country = state.year = state.month = state.type = state.family = state.domain = state.group = state.institution = "all"; state.keyword = state.from = state.to = ""; state.pageNumber = 1; syncFilters(); render(); }
function closeMobileSidebar() { $("#sidebar").classList.remove("mobile-open"); $("#sidebar-scrim").classList.remove("visible"); }
function bindShell() {
  $$("[data-nav]").forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); setPage(button.dataset.nav); }));
  $("#collapse-sidebar").addEventListener("click", () => appShell.classList.toggle("nav-collapsed"));
  $("#mobile-menu").addEventListener("click", () => { $("#sidebar").classList.add("mobile-open"); $("#sidebar-scrim").classList.add("visible"); });
  $("#sidebar-scrim").addEventListener("click", closeMobileSidebar);
  const filterMap = [["#filter-country","country"],["#filter-year","year"],["#filter-month","month"],["#filter-type","type"],["#filter-family","family"],["#filter-domain","domain"],["#filter-group","group"],["#filter-institution","institution"],["#filter-from","from"],["#filter-to","to"]];
  filterMap.forEach(([selector,key]) => $(selector).addEventListener("change", (event) => setFilter(key,event.target.value)));
  $("#reset-filters").addEventListener("click", resetFilters);
  $("#toggle-filters").addEventListener("click", () => setFiltersCollapsed(!$(".global-filters").classList.contains("collapsed")));
  let storedCollapsed = null;
  try { storedCollapsed = localStorage.getItem("filtersCollapsed"); } catch { /* Storage may be unavailable. */ }
  setFiltersCollapsed(storedCollapsed === null ? window.matchMedia("(max-width: 760px)").matches : storedCollapsed === "1");
  $("#global-search").addEventListener("input", (event) => { state.keyword = event.target.value; state.pageNumber = 1; render(); });
  $("#ask-policy-ai").addEventListener("click", () => openAssistant());
  $("#close-assistant").addEventListener("click", closeAssistant);
  $("#panel-scrim").addEventListener("click", () => { closeAssistant(); closeRecordDrawer(); });
  $("#assistant-form").addEventListener("submit", (event) => { event.preventDefault(); askAssistant($("#assistant-input").value, $("#assistant-messages")); });
  $$("[data-question]").forEach((button) => button.addEventListener("click", () => { if ($("#ai-page-input")) { $("#ai-page-input").value = button.dataset.question; askAssistant(button.dataset.question,$("#ai-page-messages"),true); } else openAssistant(button.dataset.question); }));
  $("#top-export").addEventListener("click", () => setPage("reports"));
  $("#updates-button").addEventListener("click", () => showToast(`Dataset includes records through ${formatDate(latestDate(state.records))}.`));
  document.addEventListener("click", (event) => { const explain = event.target.closest("[data-explain]"); if (explain) openAssistant(`Explain ${explain.dataset.explain} using the current filters and cite supporting records.`); });
  document.addEventListener("keydown", (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); $("#global-search").focus(); } if (event.key === "Escape") { closeAssistant(); closeRecordDrawer(); closeMobileSidebar(); } });
  let resizeTimer;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (["overview","trends","country","areas","network","compare","prices"].includes(state.page)) renderDashboardPage(); }, 180); });
  window.addEventListener("popstate", () => { const page = location.hash.slice(1); state.page = pageLabels[page] ? page : "overview"; renderDashboardPage(); });
}
// Pages that also need FAOSTAT food indicators load them once, then render.
function withFoodData(renderPage) {
  const page = state.page;
  $("#page-content").innerHTML = `<div class="loading-state"><span class="loading-mark"></span><span>Loading food price indicators…</span></div>`;
  loadFoodIndicators().then((food) => { if (state.page === page) { renderPage(ui, food); renderActiveFilters(); } }).catch((error) => {
    $("#page-content").innerHTML = emptyMarkup("Food indicators could not be loaded", `${error.message}. Reload the page to try again.`);
    wireEmptyActions();
  });
}
const ui = { state, COUNTRIES, MONTHS, escapeHtml, formatDate, safeUrl, filtered, totalCount, percentage, latestDate, groupCount, monthKey, aggregateMonthly, activeFilterEntries, icon, refreshIcons, showToast, heading, card, kpi, emptyMarkup, wireEmptyActions, setFilter, setPage, syncFilters, openAssistant, downloadBlob, exportXlsx };
function initialize() {
  bindShell();
  $("#assistant-config").hidden = !!$("meta[name='policy-ai-endpoint']")?.content.trim();
  $("#assistant-messages").addEventListener("click", (event) => { const button = event.target.closest("[data-question]"); if (button) openAssistant(button.dataset.question); });
  loadRegionalData().then((records) => {
    state.records = records;
    initializeFilters(records);
    const last = latestDate(records);
    $("#data-status").textContent = `${records.length.toLocaleString()} records · through ${formatDate(last, { day: "2-digit", month: "short", year: "numeric" })}`;
    state.page = pageLabels[location.hash.slice(1)] ? location.hash.slice(1) : "overview";
    renderDashboardPage();
  }).catch((error) => {
    $("#data-status").textContent = "Dataset unavailable";
    $("#page-content").innerHTML = emptyMarkup("Policy data could not be loaded", `${error.message}. Check the static JSON file and reload the page.`);
  });
}

initialize();
