import { comparableItems, countryPriceSummary, dietComponents, dietSummary, groupPriceSummary, itemLookup, priceChanges, priceCountries } from "./food-analysis.js";

export const COUNTRY_COLORS = { Bahrain: "#c2563f", Kuwait: "#776bb0", Oman: "#2a9d8f", Qatar: "#8a3f6f", "Saudi Arabia": "#116aab", "United Arab Emirates": "#b7852f", Yemen: "#3f7f5a" };
const COMPONENT_COLORS = ["#b7852f", "#c2563f", "#8a6b3f", "#3f7f5a", "#2a9d8f", "#776bb0"];
const shortName = (country) => ({ "United Arab Emirates": "UAE", "Saudi Arabia": "Saudi Arabia" })[country] || country;
const fmtPct = (value, digits = 1) => value === null || value === undefined || !Number.isFinite(value) ? "n/a" : `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
const fmtMoney = (value, currency) => value === undefined || value === null ? "–" : currency === "usd" ? `$${Math.round(value).toLocaleString()}` : Math.round(value).toLocaleString();

function lineChart(ui, selector, series, { height = 290, format = (value) => value, highlight = null } = {}) {
  const host = d3.select(selector);
  host.selectAll("*").remove();
  const points = series.flatMap((entry) => entry.points);
  if (!points.length) { host.html(`<div class="empty-state"><h2>No values for this selection</h2><p>Choose another commodity or country.</p></div>`); return; }
  const width = Math.max(320, host.node().clientWidth || 640);
  const margin = { top: 16, right: 22, bottom: 34, left: 62 };
  const years = [...new Set(points.map(([year]) => year))].sort((a, b) => a - b);
  const x = d3.scalePoint().domain(years).range([margin.left, width - margin.right]).padding(.35);
  const y = d3.scaleLinear().domain([0, (d3.max(points, ([, value]) => value) || 1) * 1.12]).nice().range([height - margin.bottom, margin.top]);
  const svg = host.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("aria-label", "Line chart by country");
  svg.append("g").attr("class", "chart-grid").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(width - margin.left - margin.right)).tickFormat((value) => format(value)));
  svg.append("g").attr("class", "chart-axis").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).tickFormat(String));
  series.forEach((entry) => {
    const dim = highlight && highlight !== entry.name;
    const group = svg.append("g").attr("opacity", dim ? .22 : 1);
    group.append("path").datum(entry.points).attr("fill", "none").attr("stroke", entry.color).attr("stroke-width", dim ? 1.6 : 2.6).attr("d", d3.line().x(([year]) => x(year)).y(([, value]) => y(value)).curve(d3.curveMonotoneX));
    group.selectAll("circle").data(entry.points).join("circle").attr("cx", ([year]) => x(year)).attr("cy", ([, value]) => y(value)).attr("r", 3.6).attr("fill", "white").attr("stroke", entry.color).attr("stroke-width", 2)
      .append("title").text(([year, value]) => `${entry.name} · ${year}: ${format(value)}`);
  });
}

function legend(ui, series, activeCountry) {
  return `<div class="legend-row chart-legend">${series.map((entry) => `<button type="button" class="legend-item legend-button${activeCountry === entry.name ? " active" : ""}" data-legend-country="${ui.escapeHtml(entry.name)}"><i style="background:${entry.color}"></i>${ui.escapeHtml(entry.name)}</button>`).join("")}</div>`;
}

function componentBars(ui, selector, components, highlight) {
  const host = d3.select(selector);
  host.selectAll("*").remove();
  const rows = components.rows.sort((a, b) => b.total - a.total);
  const width = Math.max(320, host.node().clientWidth || 600), rowHeight = 34, margin = { top: 6, right: 52, bottom: 8, left: 132 };
  const height = rows.length * rowHeight + margin.top + margin.bottom;
  const x = d3.scaleLinear().domain([0, d3.max(rows, (row) => row.total) || 1]).range([0, width - margin.left - margin.right]);
  const svg = host.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("aria-label", "Healthy diet cost by food group");
  rows.forEach((row, index) => {
    const g = svg.append("g").attr("transform", `translate(0,${margin.top + index * rowHeight})`).attr("opacity", highlight && highlight !== row.country ? .35 : 1);
    g.append("text").attr("x", margin.left - 10).attr("y", 20).attr("text-anchor", "end").attr("class", "bar-label").text(shortName(row.country));
    let offset = margin.left;
    components.groups.forEach((group, i) => {
      const value = row.parts[group] || 0;
      g.append("rect").attr("x", offset).attr("y", 6).attr("width", Math.max(0, x(value) - 1)).attr("height", 20).attr("rx", 3).attr("fill", COMPONENT_COLORS[i % COMPONENT_COLORS.length]).append("title").text(`${row.country} · ${group}: $${value.toFixed(2)} (${(value / row.total * 100).toFixed(0)}%)`);
      offset += x(value);
    });
    g.append("text").attr("x", offset + 8).attr("y", 20).attr("class", "bar-value").text(`$${row.total.toFixed(2)}`);
  });
}

export function renderPricesPage(ui, food) {
  const { state, escapeHtml } = ui;
  const focus = state.country !== "all" ? state.country : null;
  const items = itemLookup(food);
  const comparable = comparableItems(food, 2);
  state.priceItem ||= comparable.find((item) => item.name === "Tomatoes")?.code || comparable[0]?.code;
  state.priceCurrency ||= "usd";
  const diet = dietSummary(food);
  const components = dietComponents(food);
  const countrySummary = countryPriceSummary(food);
  const groups = groupPriceSummary(food);
  const focusDiet = focus && diet.rows.find((row) => row.country === focus);
  const focusPrices = focus && countrySummary.find((row) => row.country === focus);
  const puaRows = diet.rows.filter((row) => row.puaLatest);

  const kpis = `<div class="kpi-grid">
    ${ui.kpi(focusDiet ? `${shortName(focus)} healthy diet cost` : "Avg. healthy diet cost", focusDiet ? `$${focusDiet.latest.toFixed(2)}` : `$${diet.regional.at(-1)[1].toFixed(2)}`, `PPP $/person/day, ${diet.latestYear} · ${fmtPct(focusDiet ? focusDiet.change : diet.regionalChange)} since ${diet.firstYear}`, "salad", "kpi-primary")}
    ${ui.kpi("Highest diet cost", shortName(diet.highest.country), `$${diet.highest.latest.toFixed(2)} per day in ${diet.latestYear}; lowest ${shortName(diet.lowest.country)} $${diet.lowest.latest.toFixed(2)}`, "trending-up", "kpi-gold")}
    ${ui.kpi(focusPrices ? `${shortName(focus)} producer prices` : "Producer price series", focusPrices ? (focusPrices.medianChange === null ? "Not assessable" : fmtPct(focusPrices.medianChange)) : food.prices.series.length.toLocaleString(), focusPrices ? `Median local-currency change, ${focusPrices.assessed} of ${focusPrices.series} series assessable` : `${food.prices.items.length} commodities · ${priceCountries(food).length} countries · ${food.prices.years[0]}–${food.prices.years.at(-1)}`, "tags", "kpi-teal")}
    ${ui.kpi("Unable to afford a healthy diet", puaRows.length ? puaRows.map((row) => `${row.puaLatest.value}%`).join(" / ") : "n/a", puaRows.length ? `${puaRows.map((row) => shortName(row.country)).join(" / ")} (${puaRows[0].puaLatest.year}); not reported elsewhere` : "Not reported for this region", "users")}
  </div>`;

  const dietSeries = diet.rows.map((row) => ({ name: row.country, color: COUNTRY_COLORS[row.country], points: row.points }));
  const itemOptions = [...new Set(comparable.map((item) => item.group))].map((group) => `<optgroup label="${escapeHtml(group)}">${comparable.filter((item) => item.group === group).map((item) => `<option value="${escapeHtml(item.code)}" ${item.code === state.priceItem ? "selected" : ""}>${escapeHtml(item.name)} (${item.countries} countries)</option>`).join("")}</optgroup>`).join("");
  const explorerControls = `<div class="explorer-controls"><label>Commodity<select id="price-item">${itemOptions}</select></label><div class="chart-toolbar" role="group" aria-label="Currency"><button type="button" data-currency="usd" aria-pressed="${state.priceCurrency === "usd"}">USD / tonne</button><button type="button" data-currency="lcu" aria-pressed="${state.priceCurrency === "lcu"}">Local currency / tonne</button></div></div>`;

  // Heat table: commodities priced in at least three countries, local-currency change first → latest year.
  const changes = priceChanges(food, "lcu");
  const heatItems = comparableItems(food, 3).slice(0, 16);
  const heatCountries = priceCountries(food);
  const changeColor = d3.scaleDiverging([-60, 0, 60], (t) => d3.interpolateRdYlGn(1 - t)).clamp(true);
  const heatRows = heatItems.map((item) => `<tr><th scope="row"><button class="heatmap-domain" data-price-item="${escapeHtml(item.code)}" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</button></th>${heatCountries.map((country) => {
    const entry = changes.find((change) => change.country === country && change.code === item.code);
    if (!entry) return `<td><span class="heatmap-cell empty" title="No data">–</span></td>`;
    if (entry.flat) return `<td><span class="heatmap-cell empty" title="${escapeHtml(country)}: same value reported every year (${entry.firstYear}–${entry.latestYear})">=</span></td>`;
    if (country === "Yemen") return `<td><span class="heatmap-cell yemen-cell" title="Yemen ${escapeHtml(item.name)}: ${fmtPct(entry.change, 0)} in rial (${entry.firstYear}–${entry.latestYear}); currency depreciation dominates">${fmtPct(entry.change, 0)}</span></td>`;
    return `<td><span class="heatmap-cell" style="background:${changeColor(entry.change)};color:${Math.abs(entry.change) > 40 ? "white" : "#1f3d4f"}" title="${escapeHtml(country)} · ${escapeHtml(item.name)}: ${fmtPct(entry.change)} (${entry.firstYear}–${entry.latestYear})${entry.swing ? " · large year-on-year swing, verify" : ""}">${fmtPct(entry.change, 0)}${entry.swing ? "<sup>!</sup>" : ""}</span></td>`;
  }).join("")}</tr>`).join("");
  const heatTable = `<div class="table-wrap heatmap-wrap"><table class="heatmap-table price-heat"><thead><tr><th scope="col">Commodity</th>${heatCountries.map((country) => `<th scope="col"><span class="heatmap-country">${escapeHtml(shortName(country).replace("Saudi Arabia", "Saudi"))}</span></th>`).join("")}</tr></thead><tbody>${heatRows}</tbody></table><div class="heatmap-scale"><span>Falling</span><i style="background:linear-gradient(90deg,${changeColor(-60)},${changeColor(0)},${changeColor(60)})"></i><span>Rising</span><span class="scale-note">= repeated value · <sup>!</sup> swing &gt;60% in one year · Yemen in rial</span></div></div>`;

  // Policy response alongside prices: measures in the policy record by country.
  const records = ui.filtered();
  const linkRows = ui.COUNTRIES.map((country) => {
    const rows = records.filter((record) => record.country === country);
    const dietRow = diet.rows.find((row) => row.country === country);
    const priceRow = countrySummary.find((row) => row.country === country);
    const marketMeasures = rows.filter((record) => /price|market|subsid|reserve|stock|import|export|trade/i.test(`${record.domain} ${record.group}`)).length;
    return `<tr${focus === country ? ' class="row-focus"' : ""}><td><strong>${escapeHtml(country)}</strong></td><td>${dietRow ? `$${dietRow.latest.toFixed(2)}` : "n/a"}</td><td>${dietRow ? fmtPct(dietRow.change) : "n/a"}</td><td>${priceRow ? (priceRow.medianChange === null ? "Not assessable" : `${fmtPct(priceRow.medianChange)}${priceRow.assessed < 5 ? ` <small>(${priceRow.assessed} of ${priceRow.series} series)</small>` : ""}`) : "No data"}</td><td>${rows.length.toLocaleString()}</td><td>${rows.filter((record) => record.family === "Consumer oriented").length}</td><td>${rows.filter((record) => record.family === "Trade oriented").length}</td><td>${marketMeasures} <small>(${ui.percentage(marketMeasures, rows.length)})</small></td></tr>`;
  }).join("");
  const linkTable = `<div class="table-wrap"><table class="data-table compact-table"><thead><tr><th>Country</th><th>Diet cost ${diet.latestYear}</th><th>Diet cost change</th><th>Producer prices (median)</th><th>Policy measures</th><th>Consumer-oriented</th><th>Trade-oriented</th><th>Market, price &amp; trade measures</th></tr></thead><tbody>${linkRows}</tbody></table></div><p class="method-note">Policy counts follow the global filters. Diet cost is FAOSTAT's cost of a healthy diet (PPP $/person/day, ${diet.firstYear}–${diet.latestYear}); producer prices are median local-currency changes across commodities with changing values. Associations shown here are descriptive, not causal.</p>`;

  const groupBars = groups.map((group) => `<div class="rank-row static"><span class="rank-country">${escapeHtml(group.group)}</span><span class="rank-track diverging"><span style="width:${Math.min(100, Math.abs(group.medianChange))}%;background:${group.medianChange >= 0 ? "#c2563f" : "#3f7f5a"}"></span></span><strong class="rank-count">${fmtPct(group.medianChange, 0)}</strong></div>`).join("");
  const notes = `<ul class="method-list">${food.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul><details class="swing-details"><summary>Large year-on-year swings flagged for verification (${food.prices.swings.length})</summary><ul>${food.prices.swings.slice().sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).map((swing) => `<li>${escapeHtml(swing.country)} · ${escapeHtml(items.get(swing.code)?.name || swing.code)}: ${swing.from}→${swing.to} ${fmtPct(swing.change, 0)}</li>`).join("")}</ul></details><p class="method-note">Sources: ${escapeHtml(food.sources.prices.name)}; ${escapeHtml(food.sources.diet.name)}. Built ${escapeHtml(food.generatedAt)}.</p>`;

  $("#page-content").innerHTML = `${ui.heading("Food prices & healthy diets", "Producer prices and the cost and affordability of a healthy diet across GCC States and Yemen, alongside the policy record.", "FOOD PRICES & AFFORDABILITY")}${kpis}<div class="content-grid">
    ${ui.card("Cost of a healthy diet", `PPP dollars per person per day, ${diet.firstYear}–${diet.latestYear} · click a country to filter`, `<div class="chart-wrap" id="diet-chart"></div>${legend(ui, dietSeries, focus)}`, "span-7")}
    ${ui.card("What the diet costs by food group", `PPP $/person/day, ${components.year} (the only year FAOSTAT publishes components)`, `<div class="chart-wrap" id="diet-components"></div><div class="legend-row">${components.groups.map((group, i) => `<span class="legend-item"><i style="background:${COMPONENT_COLORS[i % COMPONENT_COLORS.length]}"></i>${escapeHtml(group)}</span>`).join("")}</div>`, "span-5")}
    ${ui.card("Producer price explorer", "Annual producer prices by country · FAOSTAT", `${explorerControls}<div class="chart-wrap" id="price-chart"></div><div id="price-legend"></div><div class="table-wrap" id="price-table"></div>`, "span-12")}
    ${ui.card("Producer price change by commodity", "Local-currency change from first to latest available year · click a commodity to explore", heatTable, "span-8")}
    ${ui.card("Change by food group", "Median local-currency change, GCC series with changing values (Yemen excluded)", `<div class="rank-list">${groupBars}</div>`, "span-4")}
    ${ui.card("Prices, affordability and the policy response", "How each country's food cost trends sit alongside its recorded policy measures", linkTable, "span-12")}
    ${ui.card("Data coverage and quality notes", "Read before using these figures", notes, "span-12")}
  </div>`;

  lineChart(ui, "#diet-chart", dietSeries, { format: (value) => `$${Number(value).toFixed(2)}`, highlight: focus });
  componentBars(ui, "#diet-components", components, focus);
  drawExplorer(ui, food, focus);
  $$("[data-legend-country]").forEach((button) => button.addEventListener("click", () => ui.setFilter("country", button.dataset.legendCountry === focus ? "all" : button.dataset.legendCountry)));
  document.querySelector("#price-item").addEventListener("change", (event) => { state.priceItem = event.target.value; drawExplorer(ui, food, focus); });
  $$("[data-currency]").forEach((button) => button.addEventListener("click", () => { state.priceCurrency = button.dataset.currency; $$("[data-currency]").forEach((item) => item.setAttribute("aria-pressed", String(item === button))); drawExplorer(ui, food, focus); }));
  $$("[data-price-item]").forEach((button) => button.addEventListener("click", () => { state.priceItem = button.dataset.priceItem; document.querySelector("#price-item").value = state.priceItem; drawExplorer(ui, food, focus); document.querySelector("#price-chart").closest(".card").scrollIntoView({ behavior: "smooth", block: "start" }); }));
  ui.refreshIcons();
}

function drawExplorer(ui, food, focus) {
  const { state, escapeHtml } = ui;
  const currency = state.priceCurrency;
  const item = itemLookup(food).get(state.priceItem);
  const rows = food.prices.series.filter((series) => series.code === state.priceItem);
  const swings = new Set(food.prices.swings.filter((swing) => swing.code === state.priceItem).map((swing) => `${swing.country}|${swing.to}`));
  // Yemen's rial values would flatten every other line, so local-currency view plots GCC only and lists Yemen in the table.
  const plotted = rows.filter((series) => currency === "usd" || series.country !== "Yemen");
  const series = plotted.map((entry) => ({ name: entry.country, color: COUNTRY_COLORS[entry.country], points: Object.entries(entry[currency]).map(([year, value]) => [Number(year), value]).sort((a, b) => a[0] - b[0]) }));
  lineChart(ui, "#price-chart", series, { format: (value) => fmtMoney(value, currency), highlight: focus });
  document.querySelector("#price-legend").innerHTML = legend(ui, series, focus) + (currency === "lcu" && rows.some((entry) => entry.country === "Yemen") ? `<p class="method-note">Yemen is listed in the table but not plotted in local currency: rial values are on a different scale.</p>` : "");
  $$("#price-legend [data-legend-country]").forEach((button) => button.addEventListener("click", () => ui.setFilter("country", button.dataset.legendCountry === focus ? "all" : button.dataset.legendCountry)));
  const years = food.prices.years;
  document.querySelector("#price-table").innerHTML = `<table class="data-table compact-table"><thead><tr><th>${escapeHtml(item?.name || "")}</th>${years.map((year) => `<th>${year}</th>`).join("")}<th>Change</th></tr></thead><tbody>${rows.map((entry) => {
    const values = entry[currency];
    const available = Object.keys(values).map(Number).sort((a, b) => a - b);
    const flat = available.length > 1 && available.every((year) => entry.lcu[year] === entry.lcu[available[0]]);
    const change = available.length > 1 ? (values[available.at(-1)] / values[available[0]] - 1) * 100 : null;
    return `<tr${focus === entry.country ? ' class="row-focus"' : ""}><td><strong>${escapeHtml(entry.country)}</strong></td>${years.map((year) => `<td>${fmtMoney(values[year], currency)}${entry.imputed.includes(year) ? '<sup title="Imputed value">i</sup>' : ""}${swings.has(`${entry.country}|${year}`) ? '<sup title="Large year-on-year swing, verify">!</sup>' : ""}</td>`).join("")}<td>${flat ? '<span class="muted" title="Same value reported every year">repeated</span>' : fmtPct(change)}</td></tr>`;
  }).join("")}</tbody></table><p class="method-note">${currency === "usd" ? "USD per tonne" : "Local currency per tonne"}. <sup>i</sup> imputed value · <sup>!</sup> swing above 60% in one year.</p>`;
}

function $(selector) { return document.querySelector(selector); }
function $$(selector) { return [...document.querySelectorAll(selector)]; }
