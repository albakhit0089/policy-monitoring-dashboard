// Policy network: focus orb → dimension cards → fan of linked items → detail panel.

const DIMENSIONS = {
  country: { label: "Countries", singular: "Country", icon: "map-pinned", filter: "country" },
  domain: { label: "Policy domains", singular: "Policy domain", icon: "shapes", filter: "domain" },
  institution: { label: "Institutions", singular: "Institution", icon: "landmark", filter: "institution" },
  group: { label: "Policy groups", singular: "Policy group", icon: "layers", filter: "group" },
  family: { label: "Policy families", singular: "Policy family", icon: "folder-tree", filter: "family" },
};
const MAX_ITEMS = 14;
const DAY = 86400000;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const truncate = (text, length) => text.length > length ? `${text.slice(0, length - 1)}…` : text;

function windows(allRecords) {
  // Trend windows anchor on the dataset's latest date so they stay stable as filters change.
  const latest = allRecords.map((record) => record.date).filter(Boolean).sort().at(-1);
  const end = latest ? new Date(`${latest}T00:00:00Z`).getTime() : Date.now();
  return { end, recentStart: end - 365 * DAY, previousStart: end - 730 * DAY };
}
function trend(records, periods) {
  const time = (record) => record.date ? new Date(`${record.date}T00:00:00Z`).getTime() : null;
  const recent = records.filter((record) => time(record) > periods.recentStart && time(record) <= periods.end).length;
  const previous = records.filter((record) => time(record) > periods.previousStart && time(record) <= periods.recentStart).length;
  return { recent, previous, change: previous ? (recent - previous) / previous * 100 : null };
}
// Plain-language activity comparison, no arrows or percentages.
function activityText(t) {
  if (!t.recent && !t.previous) return "No measures in the last 24 months";
  return `${t.recent.toLocaleString()} in the last 12 months · ${t.previous.toLocaleString()} in the 12 months before`;
}
function monthlyBars(records, periods, months = 24) {
  const counts = [];
  const endDate = new Date(periods.end);
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    counts.push([key, records.filter((record) => record.date?.startsWith(key)).length]);
  }
  const max = Math.max(1, ...counts.map(([, count]) => count));
  const width = 260, height = 54, gap = 2, bar = (width - gap * (months - 1)) / months;
  return `<svg class="pn-spark" viewBox="0 0 ${width} ${height}" role="img" aria-label="Monthly measures, last ${months} months">${counts.map(([key, count], i) => { const h = Math.max(2, count / max * (height - 4)); return `<rect x="${(i * (bar + gap)).toFixed(1)}" y="${(height - h).toFixed(1)}" width="${bar.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5"><title>${key}: ${count}</title></rect>`; }).join("")}</svg>`;
}

// ---------- optional 3D view (3d-force-graph, loaded only when chosen; 2D stays the default) ----------
const FAMILY_COLORS = { "Consumer oriented": "#287bb0", "Producer oriented": "#b7852f", "Trade oriented": "#776bb0", "Long-term frameworks": "#40836d", "Other decision family": "#71828e" };
// Dimension colours stay clear of the fixed family colours (blue, gold, purple, green).
const DIM_COLORS = { domain: "#d0705b", institution: "#3c4f5e", group: "#a3b85c" };
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const webgl = () => { try { const canvas = document.createElement("canvas"); return !!(canvas.getContext("webgl") || canvas.getContext("experimental-webgl")); } catch { return false; } };
let graphLib = null, graph3d = null;
function loadGraphLib() {
  // 3d-force-graph uses a global THREE, when one exists, instead of its own bundled Three.js (r162).
  // The Overview map leaves Three.js r128 there; with it the graph renders with old lighting and colour
  // handling and every node comes out several times too bright. So the bundle is fetched, then run
  // synchronously with the global hidden, and the global is restored straight after.
  graphLib ||= (async () => {
    if (window.ForceGraph3D) return;
    const response = await fetch("./assets/vendor/3d-force-graph.min.js");
    if (!response.ok) throw new Error("The 3D graph library could not be loaded.");
    const code = await response.text();
    const hadThree = "THREE" in window, saved = window.THREE;
    window.THREE = undefined;
    try { const script = document.createElement("script"); script.textContent = code; document.head.append(script); }
    finally { if (hadThree) window.THREE = saved; else delete window.THREE; }
    if (!window.ForceGraph3D) throw new Error("The 3D graph library could not be loaded.");
  })().catch((error) => { graphLib = null; throw error; });
  return graphLib;
}
function disposeGraph() { if (graph3d) { graph3d._destructor?.(); graph3d = null; } }
function graphData(ui, records, focus) {
  const nodes = new Map(), links = new Map();
  const node = (id, props) => { if (!nodes.has(id)) nodes.set(id, { id, count: 0, ...props }); return nodes.get(id); };
  const keep = { domain: new Set(ui.groupCount(records, (record) => record.domain).filter(([name]) => !/^unspecified/i.test(name)).slice(0, 12).map(([name]) => name)), institution: new Set(ui.groupCount(records, (record) => record.institution).slice(0, 8).map(([name]) => name)), group: new Set(ui.groupCount(records, (record) => record.group).slice(0, 8).map(([name]) => name)), family: new Set(records.map((record) => record.family)) };
  records.forEach((record) => {
    const country = node(`country:${record.country}`, { name: record.country, dim: "country", color: record.country === focus ? "#116aab" : "#5f7686" });
    country.count += 1;
    ["domain", "institution", "group", "family"].forEach((dim) => {
      if (!keep[dim].has(record[dim])) return;
      const item = node(`${dim}:${record[dim]}`, { name: record[dim], dim, color: dim === "family" ? FAMILY_COLORS[record[dim]] || "#71828e" : DIM_COLORS[dim] });
      item.count += 1;
      const key = `${country.id}|${item.id}`;
      links.set(key, { source: country.id, target: item.id, value: (links.get(key)?.value || 0) + 1 });
    });
  });
  return { nodes: [...nodes.values()], links: [...links.values()] };
}
async function render3D(ui, records, focus) {
  const host = $("#pn3d");
  host.innerHTML = `<div class="loading-state"><span class="loading-mark"></span><span>Loading the 3D view…</span></div>`;
  try { await loadGraphLib(); } catch (error) { host.innerHTML = `<p class="muted-note">${ui.escapeHtml(error.message)} The 2D view is unaffected.</p>`; return; }
  if (!host.isConnected) return;
  host.innerHTML = "";
  const data = graphData(ui, records, focus);
  const still = reducedMotion();
  graph3d = window.ForceGraph3D()(host)
    .width(host.clientWidth).height(host.clientHeight).backgroundColor("rgba(0,0,0,0)").showNavInfo(false)
    .graphData(data)
    .nodeVal((n) => 2 + Math.sqrt(n.count))
    .nodeColor((n) => n.color).nodeOpacity(1).nodeResolution(14)
    .nodeLabel((n) => `<div class="pn3d-tip"><strong>${ui.escapeHtml(n.name)}</strong><span>${ui.escapeHtml(DIMENSIONS[n.dim].singular)} · ${n.count.toLocaleString()} measures</span></div>`)
    .linkColor(() => "#4f6d82").linkWidth((l) => Math.min(3, .3 + Math.log2(1 + l.value) / 3)).linkOpacity(.55)
    // Most of the layout is computed before the first frame, so the opening view is already framed.
    .warmupTicks(still ? 160 : 90).cooldownTicks(still ? 0 : 70)
    .onEngineStop(() => graph3d?.zoomToFit(still ? 0 : 500, 30))
    .onNodeClick((n) => { if (n.dim === "country") ui.setFilter("country", n.name); else { ui.state.networkView = "2d"; ui.state.networkDim = n.dim; ui.state.networkItem = n.name; renderNetworkPage(ui); } });
  setTimeout(() => graph3d?.zoomToFit(still ? 0 : 400, 30), still ? 50 : 120);
  // Stop the render loop once the page is left.
  const watch = setInterval(() => { if (!host.isConnected) { clearInterval(watch); disposeGraph(); } }, 1000);
}

export function renderNetworkPage(ui) {
  const { state, escapeHtml, COUNTRIES } = ui;
  disposeGraph();
  const view3d = state.networkView === "3d" && webgl();
  const all = ui.filtered();
  const focus = state.country !== "all" ? state.country : null;
  const records = focus ? all.filter((record) => record.country === focus) : all;
  const dims = focus ? ["domain", "institution", "group", "family"] : ["country", "domain", "institution", "group", "family"];
  if (!dims.includes(state.networkDim)) state.networkDim = focus ? "domain" : "country";
  const dim = state.networkDim;
  const periods = windows(state.records);
  const items = ui.groupCount(records, (record) => record[dim]).slice(0, MAX_ITEMS).map(([name, count]) => ({ name, count, trend: trend(records.filter((record) => record[dim] === name), periods) }));
  if (!items.some((item) => item.name === state.networkItem)) state.networkItem = items[0]?.name ?? null;
  const selected = items.find((item) => item.name === state.networkItem);
  const countryCounts = Object.fromEntries(COUNTRIES.map((country) => [country, all.filter((record) => record.country === country).length]));
  const focusTrend = trend(records, periods);

  const satellites = COUNTRIES.filter((country) => country !== focus).map((country, i, list) => {
    // Spread satellites over the upper arc so they never collide with the focus label below the orb.
    const angle = Math.PI * 1.08 + (i / Math.max(1, list.length - 1)) * Math.PI * .84;
    return `<button type="button" class="pn-sat" data-pn-country="${escapeHtml(country)}" style="--x:${(50 + Math.cos(angle) * 44).toFixed(1)}%;--y:${(50 + Math.sin(angle) * 40).toFixed(1)}%" title="Focus on ${escapeHtml(country)}"><span class="pn-sat-dot"></span><span class="pn-sat-label">${escapeHtml(country === "United Arab Emirates" ? "UAE" : country)}<small>${countryCounts[country].toLocaleString()}</small></span></button>`;
  }).join("");
  const cards = dims.map((key) => `<button type="button" class="pn-card${key === dim ? " active" : ""}" data-pn-dim="${key}"><span class="pn-card-icon">${ui.icon(DIMENSIONS[key].icon, 15)}</span><strong>${new Set(records.map((record) => record[key]).filter(Boolean)).size.toLocaleString()}</strong><span>${DIMENSIONS[key].label}</span></button>`).join("");
  const maxCount = Math.max(1, ...items.map((item) => item.count));
  const fan = items.length ? items.map((item, i) => `<button type="button" class="pn-item${item.name === state.networkItem ? " active" : ""}" data-pn-item="${escapeHtml(item.name)}" style="--offset:${(Math.sin(Math.PI * (i + .5) / items.length) * 46).toFixed(1)}px" title="${escapeHtml(item.name)}: ${escapeHtml(activityText(item.trend))}"><span class="pn-dot"></span><span class="pn-item-body"><span class="pn-item-name">${escapeHtml(truncate(item.name, 38))}</span><span class="pn-item-meta"><span class="pn-count">${item.count.toLocaleString()} measures</span><span class="pn-share"><i style="width:${(item.count / maxCount * 100).toFixed(0)}%"></i></span></span></span></button>`).join("") : `<div class="pn-empty">No measures match the current filters.</div>`;

  const toggle = `<div class="chart-toolbar" role="group" aria-label="Network view"><button type="button" data-pn-view="2d" aria-pressed="${!view3d}">2D view</button><button type="button" data-pn-view="3d" aria-pressed="${view3d}" ${webgl() ? "" : "disabled title='3D needs WebGL'"}>3D view</button></div>`;
  if (view3d) {
    $("#page-content").innerHTML = `${ui.heading("Policy network", "A rotatable 3D view of how countries connect to policy domains, institutions, groups and families. Drag to rotate; select a node to open it.", "RELATIONSHIPS", toggle)}<section class="pn3d-stage"><div class="pn3d" id="pn3d" aria-label="3D policy network"></div><div class="pn3d-legend"><span><i style="background:#5f7686"></i>Countries</span>${focus ? `<span><i style="background:#116aab"></i>${escapeHtml(focus)}</span>` : ""}<span><i style="background:${DIM_COLORS.domain}"></i>Policy domains</span><span><i style="background:${DIM_COLORS.institution}"></i>Institutions</span><span><i style="background:${DIM_COLORS.group}"></i>Policy groups</span>${Object.entries(FAMILY_COLORS).slice(0, 4).map(([name, color]) => `<span><i style="background:${color}"></i>${escapeHtml(name)}</span>`).join("")}</div></section>`;
    $$("[data-pn-view]").forEach((button) => button.addEventListener("click", () => { state.networkView = button.dataset.pnView; renderNetworkPage(ui); }));
    render3D(ui, records, focus);
    ui.refreshIcons();
    return;
  }
  $("#page-content").innerHTML = `${ui.heading("Policy network", "Trace how countries connect to policy domains, institutions and instruments. Select an orb, a card or a linked item.", "RELATIONSHIPS", toggle)}
  <section class="pn-stage" id="pn-stage" aria-label="Policy relationship network">
    <svg class="pn-links" id="pn-links" aria-hidden="true"></svg>
    <div class="pn-col pn-left">
      <div class="pn-brand">${ui.icon("orbit", 15)}<span>Policy Intelligence<small>Relationship network</small></span></div>
      <div class="pn-orbit">
        <div class="pn-ring"></div><div class="pn-ring pn-ring-2"></div>
        ${satellites}
        <button type="button" class="pn-orb" id="pn-orb" title="${focus ? "Show the whole region" : "Region"}"><span class="pn-orb-core"></span></button>
        <div class="pn-focus"><strong>${escapeHtml(focus || "GCC States & Yemen")}</strong><span>${records.length.toLocaleString()} measures · ${focusTrend.recent.toLocaleString()} in the last 12 months</span></div>
      </div>
      <div class="pn-cards" id="pn-cards">${cards}</div>
      <div class="pn-legend"><span class="pn-legend-title">LEGEND</span><span><i class="lg-orb"></i>Focus</span><span><i class="lg-sat"></i>Countries</span><span><i class="lg-card"></i>Dimension</span><span><i class="lg-link"></i>Selected link</span></div>
    </div>
    <div class="pn-col pn-fan" id="pn-fan">${fan}</div>
    <aside class="pn-col pn-detail" id="pn-detail">${selected ? detailPanel(ui, { dim, focus, records, selected, periods }) : ""}</aside>
  </section>`;

  $$("[data-pn-view]").forEach((button) => button.addEventListener("click", () => { state.networkView = button.dataset.pnView; renderNetworkPage(ui); }));
  $$("[data-pn-country]").forEach((button) => button.addEventListener("click", () => ui.setFilter("country", button.dataset.pnCountry)));
  $("#pn-orb").addEventListener("click", () => { if (focus) ui.setFilter("country", "all"); });
  $$("[data-pn-dim]").forEach((button) => button.addEventListener("click", () => { state.networkDim = button.dataset.pnDim; state.networkItem = null; renderNetworkPage(ui); }));
  $$("[data-pn-item]").forEach((button) => button.addEventListener("click", () => { state.networkItem = button.dataset.pnItem; renderNetworkPage(ui); }));
  bindDetail(ui, { dim, focus, selected });
  ui.refreshIcons();
  requestAnimationFrame(drawLinks);
  window.__pnResize ||= (() => { let timer; window.addEventListener("resize", () => { clearTimeout(timer); timer = setTimeout(() => { if ($("#pn-stage")) drawLinks(); }, 120); }); return true; })();
}

function detailPanel(ui, { dim, focus, records, selected, periods }) {
  const { escapeHtml } = ui;
  const rows = records.filter((record) => record[dim] === selected.name);
  const latest = rows.map((record) => record.date).filter(Boolean).sort().at(-1);
  const active = latest && (periods.end - new Date(`${latest}T00:00:00Z`).getTime()) <= 90 * DAY;
  const share = records.length ? selected.count / records.length * 100 : 0;
  const breadthKey = dim === "country" ? "institution" : focus ? "institution" : "country";
  const breadth = new Set(rows.map((record) => record[breadthKey]).filter(Boolean)).size;
  const topDomain = dim !== "domain" ? ui.groupCount(rows, (record) => record.domain)[0] : null;
  const t = selected.trend;
  const insight = [
    `${escapeHtml(selected.name)} accounts for ${share.toFixed(0)}% of ${escapeHtml(focus || "regional")} measures in the current selection (${selected.count.toLocaleString()} of ${records.length.toLocaleString()}).`,
    !t.recent && !t.previous ? "No measures were recorded in the last 24 months." : `${t.recent.toLocaleString()} measures were recorded in the last 12 months, ${t.recent > t.previous ? "more than" : t.recent < t.previous ? "fewer than" : "the same as"} the ${t.previous.toLocaleString()} recorded in the 12 months before.`,
    topDomain ? `Its leading policy domain is ${escapeHtml(topDomain[0])} (${topDomain[1]} measures).` : "",
  ].filter(Boolean).join(" ");
  const recent = rows.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 3);
  return `<div class="pn-detail-head"><span class="pn-kicker">${ui.icon(DIMENSIONS[dim].icon, 14)}${DIMENSIONS[dim].singular}${focus ? ` · ${escapeHtml(focus)}` : ""}</span><h2>${escapeHtml(selected.name)}</h2><div class="pn-status"><span class="pn-chip ${active ? "on" : ""}">${active ? "Active" : "Quiet"}</span><span>Latest record ${escapeHtml(ui.formatDate(latest))}</span></div></div>
    <div class="pn-metric"><div><span class="pn-metric-label">Share of measures</span><strong>${share.toFixed(0)}%</strong><span class="pn-metric-delta">${escapeHtml(activityText(t))}</span></div>${monthlyBars(rows, periods)}</div>
    <div class="pn-tiles"><div><strong>${selected.count.toLocaleString()}</strong><span>Measures</span></div><div><strong>${ui.totalCount(rows, "decision").toLocaleString()}</strong><span>Short-term decisions</span></div><div><strong>${ui.totalCount(rows, "framework").toLocaleString()}</strong><span>Long-term frameworks</span></div><div><strong>${breadth.toLocaleString()}</strong><span>${breadthKey === "country" ? "Countries involved" : "Institutions involved"}</span></div></div>
    <div class="pn-analysis"><span class="pn-kicker">${ui.icon("sparkles", 14)}Analysis</span><p>${insight}</p></div>
    <div class="pn-recent"><span class="pn-kicker">${ui.icon("clock-3", 14)}Latest developments</span>${recent.map((record) => `<a ${ui.safeUrl(record.source) ? `href="${escapeHtml(record.source)}" target="_blank" rel="noopener noreferrer"` : ""}><small>${escapeHtml(record.country)} · ${escapeHtml(ui.formatDate(record.date))}</small>${escapeHtml(truncate(record.title, 110))}</a>`).join("")}</div>
    <div class="pn-actions"><button type="button" class="pn-btn pn-btn-gold" id="pn-explore">${ui.icon("rows-3", 15)}Explore records</button></div>`;
}

function bindDetail(ui, { dim, focus, selected }) {
  if (!selected) return;
  $("#pn-explore")?.addEventListener("click", () => {
    ui.state[DIMENSIONS[dim].filter] = selected.name;
    if (focus) ui.state.country = focus;
    ui.state.pageNumber = 1;
    ui.syncFilters();
    ui.setPage("records");
  });
}

function drawLinks() {
  const stage = $("#pn-stage"), svg = $("#pn-links");
  if (!stage || !svg) return;
  const box = stage.getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
  if (getComputedStyle(svg).display === "none") { svg.innerHTML = ""; return; }
  const rel = (element, side) => { const r = element.getBoundingClientRect(); return { x: (side === "left" ? r.left : side === "right" ? r.right : r.left + r.width / 2) - box.left, y: r.top + r.height / 2 - box.top }; };
  const curve = (a, b, cls) => { const mx = (a.x + b.x) / 2; return `<path class="${cls}" d="M${a.x.toFixed(1)},${a.y.toFixed(1)} C${mx.toFixed(1)},${a.y.toFixed(1)} ${mx.toFixed(1)},${b.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}"/>`; };
  const orb = $("#pn-orb"), card = $(".pn-card.active"), detail = $("#pn-detail");
  let paths = "";
  if (orb && card) paths += curve(rel(orb, "center"), rel(card, "left"), "pn-link pn-link-gold");
  if (card) {
    const from = rel(card, "right");
    $$(".pn-item").forEach((item) => {
      const dot = $(".pn-dot", item);
      const to = rel(dot, "center");
      const active = item.classList.contains("active");
      paths += curve(from, to, `pn-link${active ? " pn-link-active" : ""}`);
      if (active && detail) paths += curve({ x: to.x + 8, y: to.y }, rel(detail, "left"), "pn-link pn-link-detail");
    });
    paths += `<circle class="pn-hub" cx="${from.x.toFixed(1)}" cy="${from.y.toFixed(1)}" r="4"/>`;
  }
  svg.innerHTML = paths;
}
