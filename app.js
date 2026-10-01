const DATA_URL = "./data/measures.json";
const PAGE_SIZE = 20;
const FAMILY_COLORS = {
  "Consumer oriented": "#3B8FD9",
  "Producer oriented": "#B87D0E",
  "Trade oriented": "#9085E9",
  "Long-term frameworks": "#1E9E6E",
  "Other decision family": "#A9BFD4",
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const state = { records: [], view: "network", type: "all", year: "all", country: "all", group: null, query: "", page: 1 };
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const safeUrl = (value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
};
const formatDate = (date) => date ? new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "Date not stated";
const groupKey = (record) => `${record.family}::${record.group}`;
const familyClass = (family) => Object.keys(FAMILY_COLORS).find((key) => key === family) || "Other decision family";

function getFilteredRecords({ ignoreGroup = false } = {}) {
  const needle = state.query.trim().toLocaleLowerCase();
  return state.records.filter((record) => {
    if (state.type !== "all" && record.type !== state.type) return false;
    if (state.year !== "all" && String(record.year || "") !== state.year) return false;
    if (state.country !== "all" && record.country !== state.country) return false;
    if (!ignoreGroup && state.group && groupKey(record) !== state.group) return false;
    if (needle && ![record.country, record.title, record.description, record.domain, record.group, record.institution].join(" ").toLocaleLowerCase().includes(needle)) return false;
    return true;
  });
}

function createGroupStats(items) {
  const groups = d3.rollups(items, (values) => ({
    records: values,
    count: values.length,
    countries: d3.rollups(values, (rows) => rows.length, (record) => record.country).sort((a, b) => d3.descending(a[1], b[1])),
    domains: d3.rollups(values, (rows) => rows.length, (record) => record.domain).sort((a, b) => d3.descending(a[1], b[1])),
  }), groupKey);
  const mapped = groups.map(([key, stats]) => {
    const record = stats.records[0];
    return { key, ...stats, family: record.family, group: record.group, color: FAMILY_COLORS[familyClass(record.family)] };
  });
  return mapped.sort((a, b) => d3.descending(a.count, b.count));
}

function renderLegend() {
  const families = ["Consumer oriented", "Producer oriented", "Trade oriented", "Long-term frameworks"];
  $("#family-legend").innerHTML = families.map((family) => `<span class="legend-item"><i style="background:${FAMILY_COLORS[family]}"></i>${family}</span>`).join("");
}

function shortGroupLabel(value) {
  return value.replace("Agriculture & rural development", "Agriculture & rural dev.")
    .replace("Social protection & employment", "Social protection")
    .replace("Disaster risk management", "Disaster risk")
    .replace("Natural resources & climate", "Natural resources")
    .replace("Natural resources management", "Natural resources mgmt.")
    .replace("Institutional & organisational", "Institutions & org.")
    .replace("Macroeconomic decisions", "Macroeconomics")
    .replace("Nutrition & health assistance", "Nutrition & health")
    .replace("Development planning", "Development plans")
    .replace("Food security & nutrition", "Food security");
}

function renderNetwork() {
  const filtered = getFilteredRecords({ ignoreGroup: true });
  const groups = createGroupStats(filtered);
  const selected = groups.find((item) => item.key === state.group);
  if (!selected && state.group) state.group = null;
  const svg = d3.select("#network-svg");
  svg.selectAll("*").remove();
  const compact = window.matchMedia("(max-width: 620px)").matches;
  const width = compact ? 390 : 1100;
  const height = compact ? 1100 : 700;
  const center = compact ? { x: 195, y: 550 } : { x: 550, y: 347 };
  const radiusX = 412;
  const radiusY = 260;
  svg.attr("viewBox", `0 0 ${width} ${height}`);
  const defs = svg.append("defs");
  const hubFill = defs.append("radialGradient").attr("id", "hub-fill");
  hubFill.append("stop").attr("offset", "0%").attr("stop-color", "#184d76");
  hubFill.append("stop").attr("offset", "63%").attr("stop-color", "#0d2b46");
  hubFill.append("stop").attr("offset", "100%").attr("stop-color", "#091a2c");
  groups.forEach((group, index) => {
    const gradient = defs.append("linearGradient").attr("id", `link-${index}`).attr("x1", "0").attr("y1", "0").attr("x2", "1").attr("y2", "0");
    gradient.append("stop").attr("offset", "0%").attr("stop-color", "#3B8FD9").attr("stop-opacity", .1);
    gradient.append("stop").attr("offset", "100%").attr("stop-color", group.color).attr("stop-opacity", .9);
  });
  if (compact) {
    svg.append("ellipse").attr("class", "orbit-guide").attr("cx", center.x).attr("cy", center.y).attr("rx", 152).attr("ry", 470);
  } else {
    svg.append("ellipse").attr("class", "orbit-guide").attr("cx", center.x).attr("cy", center.y).attr("rx", radiusX - 20).attr("ry", radiusY - 18);
  }

  const maxCount = d3.max(groups, (group) => group.count) || 1;
  const perColumn = Math.ceil(groups.length / 2);
  const nodes = groups.map((group, index) => {
    const column = compact ? index % 2 : 0;
    const row = compact ? Math.floor(index / 2) : 0;
    const angle = compact ? (column === 0 ? 0 : Math.PI) : -Math.PI / 2 + index * (2 * Math.PI / Math.max(groups.length, 1));
    const r = compact ? 13 + 9 * Math.sqrt(group.count / maxCount) : 20 + 21 * Math.sqrt(group.count / maxCount);
    const x = compact ? (column === 0 ? 50 : 340) : center.x + radiusX * Math.cos(angle);
    const y = compact ? 95 + row * (910 / Math.max(perColumn - 1, 1)) : center.y + radiusY * Math.sin(angle);
    return { ...group, index, r, x, y, angle, column };
  });
  const links = svg.append("g");
  nodes.forEach((node) => {
    const id = `group-path-${node.index}`;
    const dx = node.x - center.x;
    const dy = node.y - center.y;
    const path = `M${center.x},${center.y} C${center.x + dx * .45 - dy * .06},${center.y + dy * .45 + dx * .06} ${center.x + dx * .75 - dy * .04},${center.y + dy * .75 + dx * .04} ${node.x},${node.y}`;
    node.path = path;
    links.append("path").attr("id", id).attr("class", `link-path network-link${state.group && node.key !== state.group ? " is-dimmed" : ""}`).attr("d", path).attr("stroke", `url(#link-${node.index})`);
    links.append("path").attr("class", `link-flow network-link${state.group && node.key !== state.group ? " is-dimmed" : ""}`).attr("d", path).attr("stroke", node.color);
    if (node.count > 1) {
      links.append("circle").attr("class", "flow-particle").attr("r", 2.1).attr("fill", node.color).append("animateMotion").attr("dur", `${9 + node.index % 7}s`).attr("repeatCount", "indefinite").attr("begin", `${(node.index % 8) * -.8}s`).attr("path", path);
    }
  });

  const hub = svg.append("g").attr("class", "hub-select").attr("role", "button").attr("tabindex", 0).attr("aria-label", `${state.country === "all" ? "All monitored countries" : state.country}; ${filtered.length} policy measures. Clear selected group.`).attr("aria-pressed", !state.group).style("cursor", "pointer");
  hub.append("title").text(`${state.country === "all" ? "All monitored countries" : state.country}: ${filtered.length.toLocaleString()} policy measures. Clear the selected group.`);
  const spikePoints = d3.range(64).map((i) => {
    const angle = (i / 64) * Math.PI * 2;
    const radius = i % 2 ? 83 : 95;
    return [center.x + radius * Math.cos(angle), center.y + radius * Math.sin(angle)].join(",");
  }).join(" ");
  hub.append("polygon").attr("class", "hub-spike").attr("points", spikePoints).style("transform-origin", `${center.x}px ${center.y}px`);
  hub.append("circle").attr("class", "hub-ring").attr("cx", center.x).attr("cy", center.y).attr("r", 77);
  hub.append("circle").attr("class", "hub-core").attr("cx", center.x).attr("cy", center.y).attr("r", 65);
  hub.append("text").attr("class", "hub-label").attr("x", center.x).attr("y", center.y - 16).text(state.country === "all" ? "All monitored" : state.country);
  hub.append("text").attr("class", "hub-label").attr("x", center.x).attr("y", center.y - 3).text(state.country === "all" ? "countries" : "country");
  hub.append("text").attr("class", "hub-count").attr("x", center.x).attr("y", center.y + 24).text(filtered.length.toLocaleString());
  hub.append("text").attr("class", "hub-caption").attr("x", center.x).attr("y", center.y + 40).text("POLICY MEASURES");
  hub.on("click", () => { state.group = null; render(); }).on("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); state.group = null; render(); } });

  const nodeLayer = svg.append("g");
  const selection = nodeLayer.selectAll("g.network-node").data(nodes).join("g")
    .attr("class", (node) => `network-node${state.group === node.key ? " is-selected" : ""}${state.group && state.group !== node.key ? " is-dimmed" : ""}`)
    .attr("transform", (node) => `translate(${node.x},${node.y})`)
    .attr("role", "button").attr("tabindex", 0)
    .attr("aria-label", (node) => `${node.group}, ${node.count} measures, ${((node.count / Math.max(filtered.length, 1)) * 100).toFixed(1)} percent share. Select group.`)
    .attr("aria-pressed", (node) => node.key === state.group)
    .on("click", (event, node) => { state.group = state.group === node.key ? null : node.key; render(); })
    .on("keydown", (event, node) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); state.group = state.group === node.key ? null : node.key; render(); } });
  selection.append("title").text((node) => `${node.group}: ${node.count} measures (${(node.count / Math.max(filtered.length, 1) * 100).toFixed(1)}%). Top countries: ${node.countries.slice(0, 3).map(([name, count]) => `${name} ${count}`).join(", ")}`);
  selection.append("circle").attr("class", "orb").attr("r", (node) => node.r).attr("fill", (node) => `${node.color}26`).attr("stroke", (node) => node.color).attr("color", (node) => node.color);
  selection.append("circle").attr("class", "orb-ring").attr("r", (node) => node.r + 5).attr("stroke", (node) => node.color);
  selection.each(function (node) {
    const group = d3.select(this);
    node.countries.slice(0, 3).forEach(([country, count], i) => {
      const satelliteAngle = -Math.PI / 2 + i * (Math.PI * 2 / 3) + node.index * .4;
      const offset = node.r + 8;
      const x = Math.cos(satelliteAngle) * offset;
      const y = Math.sin(satelliteAngle) * offset;
      group.append("circle").attr("class", "orb-satellite").attr("cx", x).attr("cy", y).attr("r", 5.3).attr("fill", node.color).append("title").text(`${country}: ${count} measures`);
        group.append("text").attr("class", "orb-satellite-count").attr("x", x).attr("y", y + 2.3).text(count > 99 ? "99+" : count);
    });
    const centerLabel = compact && Math.abs(node.y - center.y) < 95;
    const sideLabel = compact && !centerLabel;
    const labelX = sideLabel ? Math.sign(Math.cos(node.angle)) * (node.r + 8) : 0;
    const labelY = compact ? (centerLabel ? -node.r - 8 : 3) : node.r + 17;
    const anchor = sideLabel ? (labelX > 0 ? "start" : "end") : "middle";
    group.append("text").attr("class", "orb-label").attr("x", labelX).attr("y", labelY).attr("text-anchor", anchor).text(shortGroupLabel(node.group));
    group.append("text").attr("class", "orb-meta").attr("x", labelX).attr("y", labelY + 11).attr("text-anchor", anchor).text(`${node.count.toLocaleString()} · ${(node.count / Math.max(filtered.length, 1) * 100).toFixed(1)}%`);
  });
  renderLegend();
  renderDetail(selected || (state.group ? null : groups[0]), filtered);
}

function renderDetail(group, filtered) {
  const panel = $("#detail-panel");
  if (!group) {
    panel.innerHTML = `<div class="detail-head"><div class="panel-overline">GROUP DETAIL</div><h2>No measures in this view</h2><div class="detail-subtitle">Adjust the filters to explore the policy network.</div></div>`;
    return;
  }
  const groupRecords = group.records;
  const domainMax = group.domains[0]?.[1] || 1;
  const domainHtml = group.domains.slice(0, 8).map(([domain, count]) => `<div class="breakdown-row"><span title="${escapeHtml(domain)}">${escapeHtml(domain)}</span><strong>${count}</strong><div class="breakdown-track"><i style="width:${(count / domainMax) * 100}%"></i></div></div>`).join("");
  const countryHtml = group.countries.slice(0, 7).map(([country, count]) => `<span class="country-chip">${escapeHtml(country)} · ${count}</span>`).join("");
  const measures = [...groupRecords].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 8);
  const measureHtml = measures.map((record) => {
    const href = safeUrl(record.source);
    return `<details class="measure-card"><summary><span class="measure-title">${escapeHtml(record.title)}</span><span class="measure-meta"><span>${escapeHtml(record.country)}</span><span>${escapeHtml(formatDate(record.date))}</span><span>${escapeHtml(record.domain)}</span></span></summary><div class="measure-body"><p>${escapeHtml(record.description)}</p>${record.institution ? `<p class="institution">Decision-making institution: ${escapeHtml(record.institution)}</p>` : ""}${href ? `<a class="source-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">View source ↗</a>` : ""}</div></details>`;
  }).join("");
  const share = (group.count / Math.max(filtered.length, 1) * 100).toFixed(1);
  panel.innerHTML = `<div class="detail-head"><div class="panel-overline">${escapeHtml(group.family)}</div><h2>${escapeHtml(group.group)}</h2><div class="detail-subtitle">${escapeHtml(group.family)} · ${group.count.toLocaleString()} measures · ${share}% of current view</div><div class="detail-counts"><div class="detail-stat"><strong>${group.count.toLocaleString()}</strong><span>POLICY MEASURES</span></div><div class="detail-stat"><strong>${group.countries.length}</strong><span>COUNTRIES</span></div><div class="detail-stat"><strong>${group.domains.length}</strong><span>SUB-DOMAINS</span></div></div></div><div class="detail-scroll"><section class="detail-section"><h3>Sub-domain breakdown</h3><div class="breakdown-list">${domainHtml || "<span class='detail-subtitle'>No sub-domains listed.</span>"}</div></section><section class="detail-section"><h3>Leading countries</h3><div class="chip-list">${countryHtml || "<span class='detail-subtitle'>No country data.</span>"}</div></section><section class="detail-section"><h3>Related policy measures</h3><div class="measure-list">${measureHtml || "<span class='detail-subtitle'>No measures in this group.</span>"}</div></section></div>`;
}

function compareYears(country, records) {
  const measureTypeRecords = records.filter((record) => state.type === "all" || record.type === state.type);
  const datedYears = [...new Set(measureTypeRecords.map((record) => record.year).filter(Number.isFinite))].sort((a, b) => a - b);
  if (!datedYears.length) return "■ No dated records";
  const currentYear = state.year !== "all" ? Number(state.year) : datedYears.at(-1);
  const priorYear = currentYear - 1;
  const current = measureTypeRecords.filter((record) => record.country === country && record.year === currentYear).length;
  const prior = measureTypeRecords.filter((record) => record.country === country && record.year === priorYear).length;
  if (!prior && !current) return "■ No records in these years";
  if (!prior && current) return `▲ New · ${currentYear}`;
  if (current === prior) return `■ 0% vs ${priorYear}`;
  const change = ((current - prior) / prior) * 100;
  return `${change > 0 ? "▲" : "▼"} ${Math.abs(change).toFixed(0)}% vs ${priorYear}`;
}

function renderCountries() {
  const items = getFilteredRecords({ ignoreGroup: true });
  const stats = d3.rollups(items, (values) => values.length, (record) => record.country).sort((a, b) => d3.descending(a[1], b[1]));
  const svg = d3.select("#countries-svg");
  svg.selectAll("*").remove();
  const compact = window.matchMedia("(max-width: 620px)").matches;
  const width = compact ? 390 : 1200;
  const height = compact ? 820 : 520;
  svg.attr("viewBox", `0 0 ${width} ${height}`);
  const defs = svg.append("defs");
  const gradient = defs.append("linearGradient").attr("id", "country-flow").attr("x1", "0").attr("y1", "1").attr("x2", "1").attr("y2", "0");
  gradient.append("stop").attr("offset", "0%").attr("stop-color", "#E3B44B");
  gradient.append("stop").attr("offset", "100%").attr("stop-color", "#3B8FD9");
  const centerBase = compact ? { x: 14, y: 795 } : { x: 600, y: 477 };
  if (!compact) svg.append("path").attr("class", "country-arc").attr("d", `M60,430 Q600,-40 1140,430`);
  const max = d3.max(stats, (entry) => entry[1]) || 1;
  const nodes = stats.map(([country, count], index) => {
    const t = stats.length <= 1 ? .5 : index / (stats.length - 1);
    const x = compact ? (index % 2 ? 292 : 98) : (stats.length <= 1 ? width / 2 : 62 + t * 1076);
    const y = compact ? 50 + Math.floor(index / 2) * (720 / Math.max(Math.ceil(stats.length / 2) - 1, 1)) : 397 - Math.sin(Math.PI * t) * 292;
    return { country, count, x, y, r: 8 + 14 * Math.sqrt(count / max), share: count / Math.max(items.length, 1) * 100, trend: compareYears(country, state.records) };
  });
  const lineLayer = svg.append("g");
  nodes.forEach((node, index) => {
    const curve = `M${centerBase.x},${centerBase.y} C${centerBase.x - 190},${centerBase.y - 115} ${node.x + (centerBase.x - node.x) * .3},${node.y + 120} ${node.x},${node.y}`;
    lineLayer.append("path").attr("class", "country-link").attr("d", curve);
    lineLayer.append("path").attr("class", "country-link-flow").attr("d", curve);
    if (node.count > 1) lineLayer.append("circle").attr("r", 2).attr("fill", index % 2 ? "#3B8FD9" : "#E3B44B").append("animateMotion").attr("dur", `${8 + index % 5}s`).attr("repeatCount", "indefinite").attr("path", curve);
  });
  const countryNode = svg.append("g").selectAll("g.country-node").data(nodes).join("g")
    .attr("class", "country-node").attr("transform", (node) => `translate(${node.x},${node.y})`)
    .attr("role", "button").attr("tabindex", 0)
    .attr("aria-label", (node) => `${node.country}, ${node.count} measures, ${node.share.toFixed(1)} percent. ${node.trend}. Filter network by country.`)
    .on("click", (event, node) => selectCountry(node.country))
    .on("keydown", (event, node) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectCountry(node.country); } });
  countryNode.append("title").text((node) => `${node.country}: ${node.count} measures (${node.share.toFixed(1)}%). ${node.trend}`);
  countryNode.append("circle").attr("class", "country-dot").attr("r", (node) => node.r).attr("fill", (node) => `rgba(17,106,171,${.12 + .25 * node.count / max})`);
  countryNode.append("text").attr("class", "country-label").attr("y", (node) => -node.r - 9).text((node) => node.country);
  countryNode.append("text").attr("class", "country-meta").attr("y", (node) => -node.r - 1).text((node) => `${node.count.toLocaleString()} · ${node.share.toFixed(1)}%`);
  countryNode.append("text").attr("class", "country-trend").attr("y", (node) => node.r + 12).text((node) => node.trend);
}

function renderRecords() {
  const items = getFilteredRecords();
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  state.page = Math.max(1, Math.min(state.page, pageCount));
  const visible = items.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
  $("#record-count").textContent = `${items.length.toLocaleString()} measures`;
  $("#page-status").textContent = `Page ${state.page} of ${pageCount}`;
  $("#previous-page").disabled = state.page <= 1;
  $("#next-page").disabled = state.page >= pageCount;
  if (!visible.length) {
    $("#records-body").innerHTML = `<tr><td colspan="6" class="empty-results">No policy measures match these filters.</td></tr>`;
    return;
  }
  $("#records-body").innerHTML = visible.map((record) => {
    const href = safeUrl(record.source);
    return `<tr><td data-label="Date">${escapeHtml(formatDate(record.date))}</td><td data-label="Country">${escapeHtml(record.country)}</td><td data-label="Type"><span class="type-pill">${record.type === "decision" ? "Short-term decision" : "Long-term framework"}</span></td><td class="domain-cell" data-label="Domain">${escapeHtml(record.domain)}</td><td data-label="Measure"><div class="table-title">${escapeHtml(record.title)}</div><div class="table-description">${escapeHtml(record.description.slice(0, 180))}${record.description.length > 180 ? "…" : ""}</div></td><td data-label="Source link">${href ? `<a class="source-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">View ↗</a>` : "—"}</td></tr>`;
  }).join("");
}

function renderPulse() {
  const counts = d3.rollup(getFilteredRecords(), (values) => values.length, (record) => record.date?.slice(0, 7) || "undated");
  const allCounts = d3.rollup(state.records, (values) => values.length, (record) => record.date?.slice(0, 7) || "undated");
  const keys = d3.range(2023, 2027).flatMap((year) => d3.range(1, 13).map((month) => `${year}-${String(month).padStart(2, "0")}`));
  const max = d3.max(keys, (key) => allCounts.get(key) || 0) || 1;
  $("#pulse-strip").innerHTML = keys.map((key, index) => {
    const count = counts.get(key) || 0;
    const [year, month] = key.split("-");
    const height = Math.max(4, (count / max) * 100);
    const active = state.year === year;
    return `<button class="pulse-bar${index % 12 === 0 ? " year-start" : ""}" type="button" data-year="${year}" style="--bar-height:${height}%" aria-label="${MONTHS[Number(month) - 1]} ${year}: ${count} measures. Filter by ${year}." aria-pressed="${active}" title="${MONTHS[Number(month) - 1]} ${year}: ${count.toLocaleString()} measures${active ? " · selected year" : ""}"></button>`;
  }).join("");
  $("#pulse-strip").querySelectorAll(".pulse-bar").forEach((bar) => bar.addEventListener("click", () => { state.year = bar.dataset.year; state.page = 1; syncControls(); render(); }));
}

function renderKpis() {
  const items = getFilteredRecords({ ignoreGroup: true });
  $("#kpi-measures").textContent = items.length.toLocaleString();
  $("#kpi-countries").textContent = new Set(items.map((record) => record.country)).size.toLocaleString();
  $("#kpi-short").textContent = items.filter((record) => record.type === "decision").length.toLocaleString();
  $("#kpi-long").textContent = items.filter((record) => record.type === "framework").length.toLocaleString();
}

function setView(view) {
  state.view = view;
  document.querySelectorAll("[data-view]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.view === view)));
  document.querySelectorAll(".view-panel").forEach((panel) => { panel.hidden = panel.id !== `${view}-view`; });
  render();
}

function syncControls() {
  $("#year-filter").value = state.year;
  $("#country-filter").value = state.country;
  $("#type-filter").querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.type === state.type)));
  $("#search-input").value = state.query;
}

function selectCountry(country) {
  state.country = country;
  state.group = null;
  state.page = 1;
  syncControls();
  setView("network");
}

function render() {
  if (state.view === "network") renderNetwork();
  if (state.view === "countries") renderCountries();
  if (state.view === "records") renderRecords();
  renderPulse();
  renderKpis();
}

function exportCsv() {
  const rows = getFilteredRecords();
  const headers = ["Date", "Country", "Type", "Family", "Policy group", "Domain", "Measure", "Description", "Decision-making institution", "Source"];
  const fields = ["date", "country", null, "family", "group", "domain", "title", "description", "institution", "source"];
  const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.map(quote).join(","), ...rows.map((record) => fields.map((key) => quote(key === null ? record.typeLabel : record[key])).join(","))].join("\r\n");
  const link = document.createElement("a");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  link.href = url;
  link.download = "monthly-policy-monitoring.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function setupControls() {
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  $("#type-filter").addEventListener("click", (event) => {
    const button = event.target.closest("[data-type]");
    if (!button) return;
    state.type = button.dataset.type;
    state.group = null;
    state.page = 1;
    syncControls();
    render();
  });
  $("#year-filter").addEventListener("change", (event) => { state.year = event.target.value; state.page = 1; state.group = null; render(); });
  $("#country-filter").addEventListener("change", (event) => { state.country = event.target.value; state.page = 1; state.group = null; render(); });
  $("#reset-filters").addEventListener("click", () => { state.type = "all"; state.year = "all"; state.country = "all"; state.group = null; state.query = ""; state.page = 1; syncControls(); render(); });
  $("#search-input").addEventListener("input", (event) => { state.query = event.target.value; state.page = 1; render(); });
  $("#clear-search").addEventListener("click", () => { state.query = ""; syncControls(); state.page = 1; render(); $("#search-input").focus(); });
  $("#export-csv").addEventListener("click", exportCsv);
  $("#previous-page").addEventListener("click", () => { state.page -= 1; renderRecords(); });
  $("#next-page").addEventListener("click", () => { state.page += 1; renderRecords(); });
}

async function initialize() {
  setupControls();
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`Data request failed (${response.status})`);
    const payload = await response.json();
    state.records = payload.records || [];
    const years = [...new Set(state.records.map((record) => record.year).filter(Number.isFinite))].sort((a, b) => b - a);
    $("#year-filter").innerHTML = `<option value="all">All years</option>${years.map((year) => `<option value="${year}">${year}</option>`).join("")}`;
    const countries = [...new Set(state.records.map((record) => record.country))].sort((a, b) => a.localeCompare(b));
    $("#country-filter").innerHTML = `<option value="all">All countries</option>${countries.map((country) => `<option value="${escapeHtml(country)}">${escapeHtml(country)}</option>`).join("")}`;
    $("#record-count-total").textContent = `${state.records.length.toLocaleString()} measures loaded`;
    setView("network");
  } catch (error) {
    $("#app-content").innerHTML = `<div class="error-message">The monitoring dataset could not be loaded. ${escapeHtml(error.message)}<br />Run the data-generation script, then serve this folder over HTTP.</div>`;
  }
}

initialize();
window.matchMedia("(max-width: 620px)").addEventListener("change", () => {
  if (state.view === "network") renderNetwork();
  if (state.view === "countries") renderCountries();
});
