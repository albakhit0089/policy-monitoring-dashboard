// "This month": the latest briefing at a glance — key messages and themes from the narrative engine,
// food price inflation with policy measures marked on it, what is new since the last visit, and a watchlist.
import { buildBrief, COUNTRIES, THEMES, themesOf, toHtml } from "./narrative.js?v=pi-20261114";
import { buildDocx } from "./docx.js?v=pi-20261114";
import { loadEvents } from "./data-service.js?v=pi-20261114";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const monthName = (key) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const shortMonth = (key) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
const PRICE_THEMES = ["trade", "social"];
// Local storage can be blocked or full; then choices last for this session only (kept in memory).
const memory = new Map();
const store = {
  get(key, fallback) { try { const value = localStorage.getItem(key); return value === null ? (memory.has(key) ? memory.get(key) : fallback) : JSON.parse(value); } catch { return memory.has(key) ? memory.get(key) : fallback; } },
  set(key, value) { memory.set(key, value); try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage unavailable: the in-memory copy is used. */ } },
};

export async function renderThisMonthPage(ui, food) {
  const { state, escapeHtml } = ui;
  const events = await loadEvents().catch(() => []);
  const months = [...new Set(state.records.map((record) => record.date?.slice(0, 7)).filter(Boolean))].sort();
  const partial = ui.partialMonth();
  const query = new URLSearchParams(location.hash.split("?")[1] || "");
  state.thisMonth ||= { month: query.get("month") || months.at(-1), country: query.get("country") || "all" };
  const t = state.thisMonth;
  if (!months.includes(t.month)) t.month = months.at(-1);
  const scope = { kind: "monthly", country: t.country, month: t.month };
  const report = buildBrief({ records: state.records, food, events, scope });
  state.currentReport = report;
  const isPartial = t.month === partial;
  const through = ui.latestDate(state.records);
  const html = toHtml(report);
  // Key messages and short theme sections come straight from the brief.
  const keyMessages = report.sections[0].blocks[0];
  const themeSection = report.sections[2];
  const themeCards = [];
  themeSection.blocks.forEach((block) => { if (block.type === "h3") themeCards.push({ title: block.text, blocks: [] }); else themeCards.at(-1)?.blocks.push(block); });
  const fragment = (blocks) => { const temp = document.createElement("div"); temp.innerHTML = toHtml({ ...report, sections: [{ title: "", blocks }] }); return temp.querySelector("section").innerHTML.replace(/^<h3>[^<]*<\/h3>/, ""); };

  $("#page-content").innerHTML = `${ui.heading(`This month: ${monthName(t.month)}`, `${t.country === "all" ? "GCC States and Yemen" : t.country} · data through ${ui.formatDate(through)}${isPartial ? " · partial month" : ""}`, "POLICY BRIEFING", `<div class="tm-actions"><button class="button button-primary" id="tm-word" type="button">${ui.icon("file-text")}Export brief (Word)</button><button class="button button-outline" id="tm-pdf" type="button">${ui.icon("printer")}PDF</button><button class="button button-outline" id="tm-link" type="button">${ui.icon("link")}Copy link</button></div>`)}
  <div class="tm-scope"><div class="chart-toolbar" role="group" aria-label="Month">${[...new Set([...months.slice(-3), t.month])].sort().map((key) => `<button type="button" data-tm-month="${key}" aria-pressed="${key === t.month}">${escapeHtml(monthName(key))}${key === partial ? " (partial)" : ""}</button>`).join("")}</div><label class="tm-country">Scope<select id="tm-country"><option value="all">All countries</option>${COUNTRIES.map((country) => `<option ${country === t.country ? "selected" : ""}>${escapeHtml(country)}</option>`).join("")}</select></label>${isPartial ? `<span class="tm-partial">${ui.icon("info", 14)}${escapeHtml(monthName(t.month))} is covered only to ${escapeHtml(ui.formatDate(through))}.</span>` : ""}</div>
  <div class="content-grid">
    ${ui.card("Key messages", "The main developments and why they matter for food security.", `<div class="tm-key generated-text">${fragment([keyMessages])}</div><button class="text-button" type="button" data-nav-to="reports">${ui.icon("file-text")}Read the full brief</button>`, "span-7")}
    ${ui.card("What's new since your last visit", "Measures added to the record since you last opened this page.", `<div id="tm-new"></div>`, "span-5")}
    ${ui.card("Food prices and policy", "Food price inflation (FAOSTAT) with price-related measures marked on the line. Hover a marker to see the measures; select it to list them.", `<div class="tm-price-controls" id="tm-price-countries"></div><div class="chart-wrap" id="tm-price-chart"></div><div class="tm-price-detail" id="tm-price-detail" aria-live="polite"></div>`, "span-12")}
    ${themeCards.map((theme) => ui.card(escapeHtml(theme.title), "", `<div class="generated-text">${fragment(theme.blocks)}</div>`, "span-6 tm-theme")).join("")}
    ${ui.card("Watchlist", "Countries and policy areas you follow. Your choices are kept in this browser only.", `<div id="tm-watch"></div>`, "span-12")}
  </div>
  <div class="generated-report print-only" id="generated-report">${html}</div>`;

  $$("[data-tm-month]").forEach((button) => button.addEventListener("click", () => { t.month = button.dataset.tmMonth; rerender(ui); }));
  $("#tm-country").addEventListener("change", (event) => { t.country = event.target.value; rerender(ui); });
  $$("[data-nav-to]").forEach((button) => button.addEventListener("click", () => { state.report = { type: "monthly", month: t.month, country: t.country }; ui.setPage(button.dataset.navTo); }));
  $("#tm-word").addEventListener("click", () => ui.downloadBlob(new Blob([buildDocx(report)], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), `monthly-briefing-${t.month}-${t.country.toLowerCase().replace(/\s+/g, "-")}.docx`));
  $("#tm-pdf").addEventListener("click", () => { document.body.classList.add("printing-report"); window.print(); setTimeout(() => document.body.classList.remove("printing-report"), 500); });
  $("#tm-link").addEventListener("click", async () => { try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}#thismonth?${new URLSearchParams({ month: t.month, country: t.country })}`); ui.showToast("Link copied."); } catch { ui.showToast("Clipboard access is unavailable.", "error"); } });
  history.replaceState(null, "", `#thismonth?${new URLSearchParams({ month: t.month, country: t.country })}`);
  renderWhatsNew(ui);
  renderPricePanel(ui, food);
  renderWatchlist(ui);
  ui.refreshIcons();
}
function rerender(ui) { ui.renderPage(); }

// ---------- what's new ----------
function renderWhatsNew(ui) {
  const { state, escapeHtml } = ui;
  const seen = new Set(store.get("pi.seenRecordIds", []));
  const firstVisit = !seen.size;
  const fresh = firstVisit ? [] : state.records.filter((record) => !seen.has(record.id)).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  $("#tm-new").innerHTML = firstVisit
    ? `<p class="muted-note">This is your first visit from this browser. Next time, measures added since today will be listed here.</p>`
    : fresh.length
      ? `<p><strong>${fresh.length.toLocaleString()}</strong> measure${fresh.length === 1 ? "" : "s"} added since your last visit.</p><ul class="tm-list">${fresh.slice(0, 6).map((record) => `<li><button type="button" class="link-button" data-open-record="${escapeHtml(record.id)}">${escapeHtml(record.title)}</button><small>${escapeHtml(record.country)} · ${escapeHtml(ui.formatDate(record.date))}</small></li>`).join("")}</ul>`
      : `<p class="muted-note">No new measures since your last visit (data through ${escapeHtml(ui.formatDate(ui.latestDate(state.records)))}).</p>`;
  store.set("pi.seenRecordIds", state.records.map((record) => record.id));
  wireRecordButtons(ui, $("#tm-new"));
}
function wireRecordButtons(ui, root) {
  root.querySelectorAll("[data-open-record]").forEach((button) => button.addEventListener("click", () => { const record = ui.state.records.find((item) => item.id === button.dataset.openRecord); if (record) ui.openRecordDrawer(record); }));
}

// ---------- price–policy panel ----------
function renderPricePanel(ui, food) {
  const { state, escapeHtml } = ui;
  const cpi = food?.cpi;
  const host = $("#tm-price-chart");
  if (!cpi) { host.innerHTML = `<p class="muted-note">Consumer price indices are not available.</p>`; return; }
  const countries = Object.keys(cpi.countries);
  state.thisMonth.priceCountry ||= state.thisMonth.country !== "all" && countries.includes(state.thisMonth.country) ? state.thisMonth.country : countries.map((country) => [country, Object.entries(cpi.countries[country].inflation).sort().at(-1)?.[1] ?? -Infinity]).sort((a, b) => b[1] - a[1])[0][0];
  const focus = state.thisMonth.priceCountry;
  $("#tm-price-countries").innerHTML = `<div class="chart-toolbar" role="group" aria-label="Country shown with measures">${countries.map((country) => `<button type="button" data-price-country="${escapeHtml(country)}" aria-pressed="${country === focus}">${escapeHtml(country === "United Arab Emirates" ? "UAE" : country)}</button>`).join("")}</div>`;
  $$("[data-price-country]").forEach((button) => button.addEventListener("click", () => { state.thisMonth.priceCountry = button.dataset.priceCountry; renderPricePanel(ui, food); }));
  const months = cpi.months;
  const series = countries.map((country) => ({ country, points: months.filter((month) => cpi.countries[country].inflation[month] !== undefined).map((month) => [month, cpi.countries[country].inflation[month]]) }));
  // Price-related measures (trade, markets, consumer support) of the focus country, grouped by month.
  const measures = state.records.filter((record) => record.country === focus && record.date && months.includes(record.date.slice(0, 7)) && themesOf(record).some((key) => PRICE_THEMES.includes(key)));
  const byMonth = d3.group(measures, (record) => record.date.slice(0, 7));
  const width = Math.max(320, host.clientWidth || 800), height = 300, margin = { top: 16, right: 18, bottom: 34, left: 48 };
  const x = d3.scalePoint().domain(months).range([margin.left, width - margin.right]).padding(.3);
  const values = series.flatMap((entry) => entry.points.map(([, value]) => value));
  const y = d3.scaleLinear().domain([Math.min(0, d3.min(values)) * 1.15, d3.max(values) * 1.15]).nice().range([height - margin.bottom, margin.top]);
  host.innerHTML = "";
  const svg = d3.select(host).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("aria-label", `Food price inflation by country, with policy measures for ${focus}`);
  svg.append("g").attr("class", "chart-grid").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(width - margin.left - margin.right)).tickFormat((value) => `${value}%`));
  svg.append("g").attr("class", "chart-axis").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).tickValues(ui.monthTicks(months, width - margin.left - margin.right)).tickFormat(shortMonth));
  if (y.domain()[0] < 0) svg.append("line").attr("x1", margin.left).attr("x2", width - margin.right).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "#9fb0bc").attr("stroke-dasharray", "3 3");
  const line = d3.line().x(([month]) => x(month)).y(([, value]) => y(value)).curve(d3.curveMonotoneX);
  // Countries are neutral grey; only the selected country is coloured.
  series.forEach((entry) => svg.append("path").datum(entry.points).attr("d", line).attr("fill", "none").attr("stroke", entry.country === focus ? "#116aab" : "#b8c5ce").attr("stroke-width", entry.country === focus ? 3 : 1.5).attr("opacity", entry.country === focus ? 1 : .8).append("title").text(entry.country));
  const focusSeries = series.find((entry) => entry.country === focus);
  const markers = svg.append("g").selectAll("g").data([...byMonth].filter(([month]) => focusSeries.points.some(([key]) => key === month))).join("g").attr("class", "tm-marker").attr("tabindex", 0).attr("role", "button")
    .attr("transform", ([month]) => `translate(${x(month)},${y(focusSeries.points.find(([key]) => key === month)[1])})`)
    .attr("aria-label", ([month, rows]) => `${monthName(month)}: ${rows.length} price-related measure${rows.length === 1 ? "" : "s"} in ${focus}`);
  markers.append("circle").attr("r", ([, rows]) => 5 + Math.min(6, rows.length)).attr("fill", "#b7852f").attr("stroke", "white").attr("stroke-width", 2);
  markers.append("title").text(([month, rows]) => `${monthName(month)} · ${focus}\n${rows.slice(0, 5).map((record) => `• ${record.title}`).join("\n")}${rows.length > 5 ? `\n…and ${rows.length - 5} more` : ""}`);
  const show = ([month, rows]) => {
    $("#tm-price-detail").innerHTML = `<h3>${escapeHtml(focus)}, ${escapeHtml(monthName(month))}: food price inflation ${focusSeries.points.find(([key]) => key === month)[1].toFixed(1)}%</h3><ul class="tm-list">${rows.map((record) => `<li><button type="button" class="link-button" data-open-record="${escapeHtml(record.id)}">${escapeHtml(record.title)}</button><small>${escapeHtml(ui.formatDate(record.date))}</small></li>`).join("")}</ul>`;
    wireRecordButtons(ui, $("#tm-price-detail"));
  };
  markers.on("click keydown", (event, entry) => { if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return; event.preventDefault(); show(entry); });
  const latest = [...byMonth].filter(([month]) => focusSeries.points.some(([key]) => key === month)).sort((a, b) => b[0].localeCompare(a[0]))[0];
  $("#tm-price-detail").innerHTML = latest ? `<p class="muted-note">Select a marker to list the measures. Markers show price-related measures (trade, markets, consumer and household support) in ${escapeHtml(focus)}; other countries' lines are grey.</p>` : `<p class="muted-note">No price-related measures were recorded for ${escapeHtml(focus)} in the months covered by the price data.</p>`;
}

// ---------- watchlist ----------
function renderWatchlist(ui) {
  const { state, escapeHtml } = ui;
  const watched = store.get("pi.watchlist", []);
  const options = [...COUNTRIES.map((country) => ({ id: `country:${country}`, label: country })), ...THEMES.map((theme) => ({ id: `theme:${theme.key}`, label: theme.label }))];
  const month = state.thisMonth.month;
  const inMonth = state.records.filter((record) => record.date?.startsWith(month));
  const rowsFor = (id) => { const [kind, value] = id.split(":"); return inMonth.filter((record) => kind === "country" ? record.country === value : themesOf(record).includes(value)); };
  $("#tm-watch").innerHTML = `<div class="tm-watch-picker">${options.map((item) => `<button type="button" class="filter-chip tm-watch-chip${watched.includes(item.id) ? " active" : ""}" data-watch="${escapeHtml(item.id)}" aria-pressed="${watched.includes(item.id)}">${watched.includes(item.id) ? ui.icon("check", 12) : ui.icon("plus", 12)}${escapeHtml(item.label)}</button>`).join("")}</div>
    ${watched.length ? `<div class="tm-watch-grid">${watched.map((id) => { const item = options.find((option) => option.id === id); if (!item) return ""; const rows = rowsFor(id).sort((a, b) => b.date.localeCompare(a.date)); return `<article class="tm-watch-item"><h3>${escapeHtml(item.label)}</h3><p class="muted-note">${rows.length ? `${rows.length} measure${rows.length === 1 ? "" : "s"} in ${escapeHtml(monthName(month))}` : `No measures in ${escapeHtml(monthName(month))}`}</p><ul class="tm-list">${rows.slice(0, 3).map((record) => `<li><button type="button" class="link-button" data-open-record="${escapeHtml(record.id)}">${escapeHtml(record.title)}</button><small>${escapeHtml(record.country)} · ${escapeHtml(ui.formatDate(record.date))}</small></li>`).join("")}</ul></article>`; }).join("")}</div>` : `<p class="muted-note">Select countries or policy areas above to follow them here.</p>`}`;
  $$("[data-watch]").forEach((button) => button.addEventListener("click", () => {
    const list = store.get("pi.watchlist", []);
    const next = list.includes(button.dataset.watch) ? list.filter((id) => id !== button.dataset.watch) : [...list, button.dataset.watch];
    store.set("pi.watchlist", next);
    renderWatchlist(ui);
  }));
  wireRecordButtons(ui, $("#tm-watch"));
  ui.refreshIcons();
}
