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
// Each node type sits on its own labelled layer: countries in the middle, what they connect to above and
// below. Colours are the dashboard palette re-stepped for colour-vision separation on the light surface
// (validated: adjacent-pair CVD ΔE ≥ 10, all ≥ 3:1 against the glass); names on nodes carry identity too.
const TIERS = {
  family: { label: "Policy families", color: "#7f6fc9", fy: 190 },
  domain: { label: "Policy domains", color: "#b7852f", fy: 95 },
  country: { label: "Countries", color: "#116aab", fy: 0 },
  institution: { label: "Institutions", color: "#1f9e8e", fy: -95 },
  group: { label: "Policy groups", color: "#c25a43", fy: -190 },
};
const LINK_BASE = "rgba(125,147,164,.4)", LINK_FADE = "rgba(125,147,164,.07)", LINK_HOT = "#b7852f";
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
    const country = node(`country:${record.country}`, { name: record.country, dim: "country", color: TIERS.country.color, fy: TIERS.country.fy });
    country.count += 1;
    ["domain", "institution", "group", "family"].forEach((dim) => {
      if (!keep[dim].has(record[dim])) return;
      const item = node(`${dim}:${record[dim]}`, { name: record[dim], dim, color: TIERS[dim].color, fy: TIERS[dim].fy });
      item.count += 1;
      const key = `${country.id}|${item.id}`;
      links.set(key, { source: country.id, target: item.id, value: (links.get(key)?.value || 0) + 1 });
    });
  });
  // Every layer is a fixed ring: evenly spaced nodes, biggest first, so nothing piles up at the centre
  // and the view is stable from the first frame. The camera still orbits freely.
  Object.keys(TIERS).forEach((dim, tierIndex) => {
    const ring = [...nodes.values()].filter((n) => n.dim === dim).sort((a, b) => b.count - a.count);
    const radius = ring.length > 1 ? Math.max(dim === "country" ? 175 : 85, ring.length * 100 / (2 * Math.PI)) : 0;
    ring.forEach((n, i) => { const angle = Math.PI * 2 * i / ring.length + tierIndex * .55; n.fx = Math.cos(angle) * radius; n.fz = Math.sin(angle) * radius; });
  });
  return { nodes: [...nodes.values()], links: [...links.values()] };
}
// Name labels and tier captions are HTML pinned over the canvas: each frame, node positions are projected
// through the camera by plain matrix arithmetic, so no Three.js objects cross library versions.
function mountLabels(host, graph, data, labelFaded) {
  const layer = document.createElement("div"); layer.className = "pn3d-labels"; host.append(layer);
  const perTier = {};
  const items = data.nodes.map((n) => {
    const el = document.createElement("div");
    el.className = `pn3d-label pn3d-label-${n.dim}`;
    el.textContent = truncate(n.name === "United Arab Emirates" ? "UAE" : n.name, 26);
    layer.append(el);
    // Alternate labels above and below their node within each layer, so neighbours collide less.
    const above = (perTier[n.dim] = (perTier[n.dim] || 0) + 1) % 2 === 0;
    return { n, el, above };
  });
  const caps = Object.entries(TIERS).map(([dim, tier]) => {
    const el = document.createElement("div"); el.className = "pn3d-cap"; el.style.color = tier.color; el.textContent = tier.label.toUpperCase(); layer.append(el);
    return { dim, tier, el };
  });
  const tick = () => {
    if (!host.isConnected) return;
    const camera = graph.camera();
    const width = host.clientWidth, height = host.clientHeight;
    const V = camera.matrixWorldInverse.elements, P = camera.projectionMatrix.elements;
    const project = (x, y, z) => {
      const vx = V[0] * x + V[4] * y + V[8] * z + V[12], vy = V[1] * x + V[5] * y + V[9] * z + V[13], vz = V[2] * x + V[6] * y + V[10] * z + V[14], vw = V[3] * x + V[7] * y + V[11] * z + V[15];
      const cx = P[0] * vx + P[4] * vy + P[8] * vz + P[12] * vw, cy = P[1] * vx + P[5] * vy + P[9] * vz + P[13] * vw, cw = P[3] * vx + P[7] * vy + P[11] * vz + P[15] * vw;
      return cw > 0 ? [(cx / cw * .5 + .5) * width, (1 - (cy / cw * .5 + .5)) * height] : null;
    };
    items.forEach(({ n, el, above }) => {
      const p = typeof n.x === "number" ? project(n.x, n.y, n.z) : null;
      if (!p || p[0] < -60 || p[0] > width + 60 || p[1] < -30 || p[1] > height + 30) { el.style.display = "none"; return; }
      el.style.display = "";
      el.style.opacity = labelFaded(n) ? .08 : 1;
      const gap = 7 + Math.sqrt(2 + Math.sqrt(n.count)) * 2.4;
      el.style.transform = above
        ? `translate(-50%,-100%) translate(${p[0].toFixed(1)}px,${(p[1] - gap).toFixed(1)}px)`
        : `translate(-50%,0) translate(${p[0].toFixed(1)}px,${(p[1] + gap).toFixed(1)}px)`;
    });
    caps.forEach(({ dim, tier, el }) => {
      const tierNodes = data.nodes.filter((n) => n.dim === dim && typeof n.x === "number");
      if (!tierNodes.length) { el.style.display = "none"; return; }
      const minX = Math.min(...tierNodes.map((n) => n.x)), meanZ = tierNodes.reduce((sum, n) => sum + n.z, 0) / tierNodes.length;
      const p = project(minX - 60, tier.fy, meanZ);
      if (!p || p[0] < -140 || p[1] < -30 || p[1] > height + 30) { el.style.display = "none"; return; }
      el.style.display = "";
      el.style.transform = `translate(-100%,-50%) translate(${Math.max(74, p[0]).toFixed(1)}px,${p[1].toFixed(1)}px)`;
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
const fade = (hex, alpha) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${alpha})`;
async function render3D(ui, records, focus) {
  const host = $("#pn3d");
  host.innerHTML = `<div class="loading-state"><span class="loading-mark"></span><span>Loading the 3D view…</span></div>`;
  try { await loadGraphLib(); } catch (error) { host.innerHTML = `<p class="muted-note">${ui.escapeHtml(error.message)} The 2D view is unaffected.</p>`; return; }
  if (!host.isConnected) return;
  host.innerHTML = "";
  const data = graphData(ui, records, focus);
  // Adjacency for hover tracing: a node, its links and its direct neighbours light up; the rest recede.
  const neighbours = new Map(data.nodes.map((n) => [n.id, new Set([n.id])]));
  data.links.forEach((l) => { neighbours.get(l.source).add(l.target); neighbours.get(l.target).add(l.source); });
  let hover = null;
  const linkEnds = (l) => [typeof l.source === "object" ? l.source.id : l.source, typeof l.target === "object" ? l.target.id : l.target];
  const linkHot = (l) => { const [s, t] = linkEnds(l); return s === hover || t === hover; };
  const still = reducedMotion();
  graph3d = window.ForceGraph3D()(host)
    .width(host.clientWidth).height(host.clientHeight).backgroundColor("rgba(0,0,0,0)").showNavInfo(false)
    .graphData(data)
    // Log scale: Saudi Arabia (1,085 measures) stays comparable to the rest instead of filling the view.
    .nodeVal((n) => 2 + Math.log2(1 + n.count) * 1.5)
    .nodeColor((n) => !hover || neighbours.get(hover)?.has(n.id) ? n.color : fade(n.color, .15)).nodeOpacity(1).nodeResolution(24)
    .nodeLabel((n) => `<div class="pn3d-tip"><strong>${ui.escapeHtml(n.name)}</strong><span>${ui.escapeHtml(DIMENSIONS[n.dim].singular)} · ${n.count.toLocaleString()} measures</span></div>`)
    .linkColor((l) => hover ? (linkHot(l) ? LINK_HOT : LINK_FADE) : LINK_BASE)
    .linkWidth((l) => (linkHot(l) ? 1.6 : 1) * Math.min(3, .3 + Math.log2(1 + l.value) / 3)).linkOpacity(.55)
    .onNodeHover((n) => { const id = n?.id ?? null; if (id === hover) return; hover = id; host.style.cursor = n ? "pointer" : ""; graph3d.nodeColor(graph3d.nodeColor()); graph3d.linkColor(graph3d.linkColor()); graph3d.linkWidth(graph3d.linkWidth()); })
    // Positions are fixed rings, so the layout is final before the first frame. The camera fit must be
    // animated: this library version ignores a zero-duration fit.
    .warmupTicks(60).cooldownTicks(0)
    .onEngineStop(() => graph3d?.zoomToFit(still ? 1 : 450, 46))
    .onNodeClick((n) => { if (n.dim === "country") ui.setFilter("country", n.name); else { ui.state.networkView = "2d"; ui.state.networkDim = n.dim; ui.state.networkItem = n.name; renderNetworkPage(ui); } });
  setTimeout(() => graph3d?.zoomToFit(still ? 1 : 450, 46), 700);
  mountLabels(host, graph3d, data, (n) => Boolean(hover) && !neighbours.get(hover)?.has(n.id));
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
    $("#page-content").innerHTML = `${ui.heading("Policy network", `A layered 3D view: ${focus ? escapeHtml(focus) : "countries"} in the middle, with the policy domains, institutions, groups and families ${focus ? "it connects" : "they connect"} to on their own levels. Drag to rotate, scroll to zoom, point at a node to trace its connections, select it to open it.`, "RELATIONSHIPS", toggle)}<section class="pn3d-stage"><div class="pn3d" id="pn3d" aria-label="3D policy network"></div><div class="pn3d-legend">${["country", "domain", "institution", "group", "family"].map((dim) => `<span><i style="background:${TIERS[dim].color}"></i>${escapeHtml(TIERS[dim].label)}</span>`).join("")}</div></section>`;
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
