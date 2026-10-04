import { CURRENCY, comparableItems, countryPriceSummary, dietComponents, dietSummary, formatLocal, groupPriceSummary, itemLookup, latestPricePerKg, median, perMonth, priceChanges, priceCountries } from "./food-analysis.js?v=pi-20261007";

export const COUNTRY_COLORS = { Bahrain: "#c2563f", Kuwait: "#776bb0", Oman: "#2a9d8f", Qatar: "#8a3f6f", "Saudi Arabia": "#116aab", "United Arab Emirates": "#b7852f", Yemen: "#3f7f5a" };
const COMPONENT_COLORS = ["#b7852f", "#c2563f", "#8a6b3f", "#3f7f5a", "#2a9d8f", "#776bb0"];
const shortName = (country) => country === "United Arab Emirates" ? "UAE" : country;
const fmtPct = (value, digits = 0) => value === null || value === undefined || !Number.isFinite(value) ? "n/a" : `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
const usdKg = (value) => value === null || value === undefined ? "–" : `$${value.toFixed(2)}`;
const monthly = (daily, country) => formatLocal(perMonth(daily), country, { digits: ["BHD", "KWD", "OMR"].includes(CURRENCY[country]) ? 1 : 0 });
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function lineChart(selector, series, { height = 290, format = (value) => value, highlight = null } = {}) {
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

function componentBars(selector, components, highlight) {
  const host = d3.select(selector);
  host.selectAll("*").remove();
  const rows = components.rows.slice().sort((a, b) => b.total - a.total);
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
      g.append("rect").attr("x", offset).attr("y", 6).attr("width", Math.max(0, x(value) - 1)).attr("height", 20).attr("rx", 3).attr("fill", COMPONENT_COLORS[i % COMPONENT_COLORS.length]).append("title").text(`${row.country} · ${group}: $${value.toFixed(2)} (${(value / row.total * 100).toFixed(0)}% of the diet cost)`);
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
  state.priceCurrency ||= "lcu";
  const diet = dietSummary(food);
  const components = dietComponents(food);
  const countrySummary = countryPriceSummary(food);
  const groups = groupPriceSummary(food);
  const focusDiet = focus && diet.rows.find((row) => row.country === focus);
  const focusPrices = focus && countrySummary.find((row) => row.country === focus);
  const puaRows = diet.rows.filter((row) => row.puaLatest);
  const medianLocalChange = median(diet.rows.map((row) => row.lcuChange));
  const latestPriceYear = food.prices.years.at(-1);

  const kpis = `<div class="kpi-grid">
    ${focusDiet
      ? ui.kpi(`Healthy diet in ${shortName(focus)}`, formatLocal(focusDiet.lcuLatest, focus), `per person per day in ${focusDiet.latestYear} · about ${monthly(focusDiet.lcuLatest, focus)} a month`, "salad", "kpi-primary")
      : ui.kpi("Healthy diet, GCC average", `$${diet.regional.at(-1)[1].toFixed(2)}`, `per person per day in ${diet.latestYear} (PPP dollars, comparable across countries)`, "salad", "kpi-primary")}
    ${focusDiet
      ? ui.kpi("Increase since " + focusDiet.firstYear, fmtPct(focusDiet.lcuChange, 1), `in ${CURRENCY[focus]}, from ${formatLocal(focusDiet.lcuFirst, focus)} a day`, "trending-up", "kpi-gold")
      : ui.kpi("Increase since " + diet.firstYear, fmtPct(medianLocalChange, 1), `median across six GCC countries, in local currency`, "trending-up", "kpi-gold")}
    ${focusPrices
      ? ui.kpi("Farm-gate price change", focusPrices.medianChange === null ? "No change reported" : fmtPct(focusPrices.medianChange), focusPrices.medianChange === null ? "FAOSTAT reports the same values every year" : `median across ${focusPrices.assessed} commodities, ${focusPrices.firstYear}–${focusPrices.latestYear}${focusPrices.assessed < 5 ? " (few series)" : ""}`, "tags", "kpi-teal")
      : ui.kpi("Farm-gate prices tracked", food.prices.items.length.toLocaleString(), `commodities in ${priceCountries(food).length} countries, ${food.prices.years[0]}–${latestPriceYear}`, "tags", "kpi-teal")}
    ${ui.kpi("Unable to afford a healthy diet", puaRows.length ? puaRows.map((row) => `${row.puaLatest.value}%`).join(" / ") : "n/a", puaRows.length ? `of the population in ${puaRows.map((row) => shortName(row.country)).join(" / ")} (${puaRows[0].puaLatest.year}); not reported elsewhere` : "Not reported for this region", "users")}
  </div>`;

  const dietSeries = diet.rows.map((row) => ({ name: row.country, color: COUNTRY_COLORS[row.country], points: row.points }));
  const dietTable = `<div class="table-wrap"><table class="data-table compact-table fit-table"><thead><tr><th>Country</th><th>Per person per day</th><th>Per person per month</th><th>Change since ${diet.firstYear} (local currency)</th><th>PPP $ per day</th><th>Unable to afford</th></tr></thead><tbody>${diet.rows.slice().sort((a, b) => b.latest - a.latest).map((row) => `<tr${focus === row.country ? ' class="row-focus"' : ""}><td><strong>${escapeHtml(row.country)}</strong></td><td>${formatLocal(row.lcuLatest, row.country)}</td><td>${monthly(row.lcuLatest, row.country)}</td><td>${fmtPct(row.lcuChange, 1)}</td><td>$${row.latest.toFixed(2)}</td><td>${row.puaLatest ? `${row.puaLatest.value}%` : '<span class="muted">not reported</span>'}</td></tr>`).join("")}</tbody></table></div><p class="method-note">Local-currency figures show what a healthy diet costs a person in each country (${diet.latestYear}); monthly cost is the daily cost × 30.4. PPP dollars adjust for price levels so countries can be compared with each other. Yemen is not covered by FAOSTAT.</p>`;

  // Price board: latest farm-gate price per kg for commodities priced in at least three countries.
  const boardCountries = priceCountries(food);
  const boardItems = comparableItems(food, 3).slice(0, 14);
  const boardRows = boardItems.map((item) => `<tr><th scope="row"><button class="link-button" data-price-item="${escapeHtml(item.code)}">${escapeHtml(item.name)}</button></th>${boardCountries.map((country) => {
    const series = food.prices.series.find((entry) => entry.country === country && entry.code === item.code);
    const price = series && latestPricePerKg(series);
    if (!price) return `<td class="muted">–</td>`;
    return `<td${focus === country ? ' class="col-focus"' : ""}><span class="price-local">${formatLocal(price.lcu, country, { digits: country === "Yemen" ? 0 : undefined })}</span><span class="price-usd">${usdKg(price.usd)}${price.year < latestPriceYear ? ` · ${price.year}` : ""}</span></td>`;
  }).join("")}</tr>`).join("");
  const board = `<div class="table-wrap"><table class="data-table price-board"><thead><tr><th>Commodity (per kg)</th>${boardCountries.map((country) => `<th>${escapeHtml(shortName(country))}</th>`).join("")}</tr></thead><tbody>${boardRows}</tbody></table></div><p class="method-note">Latest annual farm-gate price per kg: local currency, with USD below. A year is shown where the latest value is older than ${latestPriceYear}. These are prices received by producers, not retail shelf prices, which are typically higher.</p>`;

  const itemOptions = [...new Set(comparable.map((item) => item.group))].map((group) => `<optgroup label="${escapeHtml(group)}">${comparable.filter((item) => item.group === group).map((item) => `<option value="${escapeHtml(item.code)}" ${item.code === state.priceItem ? "selected" : ""}>${escapeHtml(item.name)} (${item.countries} countries)</option>`).join("")}</optgroup>`).join("");
  const explorerControls = `<div class="explorer-controls"><label>Commodity<select id="price-item">${itemOptions}</select></label><div class="chart-toolbar" role="group" aria-label="Currency"><button type="button" data-currency="lcu" aria-pressed="${state.priceCurrency === "lcu"}">Local currency per kg</button><button type="button" data-currency="usd" aria-pressed="${state.priceCurrency === "usd"}">USD per kg</button></div></div>`;

  // Change table: GCC in local currency; Yemen in USD because rial depreciation dominates rial changes.
  const lcuChanges = priceChanges(food, "lcu");
  const usdChanges = priceChanges(food, "usd");
  const changeItems = comparableItems(food, 3).slice(0, 14);
  const tone = (change) => { const t = Math.max(-1, Math.min(1, change / 60)); return t >= 0 ? `rgba(194, 120, 63, ${(.12 + t * .55).toFixed(2)})` : `rgba(63, 127, 117, ${(.12 - t * .5).toFixed(2)})`; };
  const changeRows = changeItems.map((item) => `<tr><th scope="row"><button class="link-button" data-price-item="${escapeHtml(item.code)}">${escapeHtml(item.name)}</button></th>${boardCountries.map((country) => {
    const entry = (country === "Yemen" ? usdChanges : lcuChanges).find((change) => change.country === country && change.code === item.code);
    if (!entry) return `<td class="muted">–</td>`;
    if (entry.flat) return `<td><span class="change-cell flat" title="FAOSTAT reports the same value in every year (${entry.firstYear}–${entry.latestYear})">0%</span></td>`;
    return `<td><span class="change-cell" style="background:${tone(entry.change)}" title="${escapeHtml(country)} · ${escapeHtml(item.name)}: ${fmtPct(entry.change, 1)} (${entry.firstYear}–${entry.latestYear})${country === "Yemen" ? " in USD" : ""}${entry.swing ? "; includes a large one-year swing, verify" : ""}">${fmtPct(entry.change)}${entry.swing ? "<sup>!</sup>" : ""}</span></td>`;
  }).join("")}</tr>`).join("");
  const changeTable = `<div class="table-wrap"><table class="data-table change-table"><thead><tr><th>Commodity</th>${boardCountries.map((country) => `<th>${escapeHtml(shortName(country))}${country === "Yemen" ? " (USD)" : ""}</th>`).join("")}</tr></thead><tbody>${changeRows}</tbody></table></div><p class="method-note">Change from the first to the latest available year (${food.prices.years[0]}–${latestPriceYear}), in local currency; Yemen in USD. A grey 0% means FAOSTAT reports the same value in every year. <sup>!</sup> one year moved by more than 60%.</p>`;

  const records = ui.filtered();
  const linkRows = ui.COUNTRIES.map((country) => {
    const rows = records.filter((record) => record.country === country);
    const dietRow = diet.rows.find((row) => row.country === country);
    const priceRow = countrySummary.find((row) => row.country === country);
    const marketMeasures = rows.filter((record) => /price|market|subsid|reserve|stock|import|export|trade/i.test(`${record.domain} ${record.group}`)).length;
    return `<tr${focus === country ? ' class="row-focus"' : ""}><td><strong>${escapeHtml(country)}</strong></td><td>${dietRow ? `${formatLocal(dietRow.lcuLatest, country)} <small>(${fmtPct(dietRow.lcuChange)})</small>` : '<span class="muted">Not estimated by FAO or the World Bank</span>'}</td><td>${priceRow ? (priceRow.medianChange === null ? '<span class="muted">No change reported</span>' : `${fmtPct(country === "Yemen" ? priceRow.medianUsdChange : priceRow.medianChange)}${country === "Yemen" ? " <small>(USD)</small>" : ""}${priceRow.assessed < 5 ? ` <small>(${priceRow.assessed} series)</small>` : ""}`) : '<span class="muted">Not reported to FAOSTAT</span>'}</td><td>${rows.length.toLocaleString()}</td><td>${rows.filter((record) => record.family === "Consumer oriented").length}</td><td>${rows.filter((record) => record.family === "Trade oriented").length}</td><td>${marketMeasures} <small>(${ui.percentage(marketMeasures, rows.length)})</small></td></tr>`;
  }).join("");
  const linkTable = `<div class="table-wrap"><table class="data-table compact-table"><thead><tr><th>Country</th><th>Healthy diet per day (change since ${diet.firstYear})</th><th>Farm-gate prices (median change)</th><th>Policy measures</th><th>Consumer-oriented</th><th>Trade-oriented</th><th>Market, price &amp; trade measures</th></tr></thead><tbody>${linkRows}</tbody></table></div><p class="method-note">Policy counts follow the global filters. This is a descriptive comparison; it does not show that measures caused or responded to price changes.</p>`;

  const groupTiles = `<div class="group-tiles">${groups.map((group) => `<div><span>${escapeHtml(group.group)}</span><strong>${fmtPct(group.medianChange)}</strong><small>median of ${group.series} series</small></div>`).join("")}</div>`;
  const notes = `<ul class="method-list"><li>Producer prices are annual farm-gate prices received by producers (FAOSTAT), not retail prices paid by consumers.</li>${food.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}<li>FAOSTAT's "number of people unable to afford a healthy diet" is not shown: for Qatar it is inconsistent with the reported prevalence.</li></ul><details class="swing-details"><summary>Large one-year price movements flagged for verification (${food.prices.swings.length})</summary><ul>${food.prices.swings.slice().sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).map((swing) => `<li>${escapeHtml(swing.country)} · ${escapeHtml(items.get(swing.code)?.name || swing.code)}: ${swing.from}→${swing.to} ${fmtPct(swing.change)}</li>`).join("")}</ul></details><p class="method-note">Sources: ${escapeHtml(food.sources.prices.name)}; ${escapeHtml(food.sources.diet.name)}. Processed ${escapeHtml(food.generatedAt)}.</p>`;

  $("#page-content").innerHTML = `${ui.heading("Food prices & healthy diets", "What a healthy diet costs people in each country, and the prices farmers receive for staple foods, alongside the policy record.", "FOOD PRICES & AFFORDABILITY")}${kpis}<div class="content-grid">
    ${ui.card("What a healthy diet costs", `Per person, ${diet.firstYear}–${diet.latestYear} · chart in PPP dollars for comparison · click a country to filter`, `<div class="chart-wrap" id="diet-chart"></div>${legend(ui, dietSeries, focus)}${dietTable}`, "span-7")}
    ${ui.card("Where the money goes", `Cost of each food group in a healthy diet, PPP $ per person per day (${components.year}, the only year published)`, `<div class="chart-wrap" id="diet-components"></div><div class="legend-row">${components.groups.map((group, i) => `<span class="legend-item"><i style="background:${COMPONENT_COLORS[i % COMPONENT_COLORS.length]}"></i>${escapeHtml(group)}</span>`).join("")}</div>`, "span-5")}
    ${ui.card("Farm-gate price board", "Latest price per kg received by producers · click a commodity to see its history", board, "span-12")}
    ${ui.card("Farm-gate price history", "Annual price per kg by country · FAOSTAT producer prices", `${explorerControls}<div class="chart-wrap" id="price-chart"></div><div id="price-legend"></div><div class="table-wrap" id="price-table"></div>`, "span-12")}
    ${ui.card("How farm-gate prices changed", `${food.prices.years[0]} to latest year, by commodity and country`, `${groupTiles}<p class="method-note group-note">Median change by food group across GCC commodities with measurable change (Yemen excluded: currency depreciation dominates).</p>${changeTable}`, "span-12")}
    ${ui.card("Food costs and the policy response", "Each country's food cost picture alongside its recorded policy measures", linkTable, "span-12")}
    ${ui.card("About these figures", "Coverage, definitions and quality checks", notes, "span-12")}
  </div>`;

  lineChart("#diet-chart", dietSeries, { format: (value) => `$${Number(value).toFixed(2)}`, highlight: focus });
  componentBars("#diet-components", components, focus);
  drawExplorer(ui, food, focus);
  $$("[data-legend-country]").forEach((button) => button.addEventListener("click", () => ui.setFilter("country", button.dataset.legendCountry === focus ? "all" : button.dataset.legendCountry)));
  $("#price-item").addEventListener("change", (event) => { state.priceItem = event.target.value; drawExplorer(ui, food, focus); });
  $$("[data-currency]").forEach((button) => button.addEventListener("click", () => { state.priceCurrency = button.dataset.currency; $$("[data-currency]").forEach((item) => item.setAttribute("aria-pressed", String(item === button))); drawExplorer(ui, food, focus); }));
  $$("[data-price-item]").forEach((button) => button.addEventListener("click", () => { state.priceItem = button.dataset.priceItem; $("#price-item").value = state.priceItem; drawExplorer(ui, food, focus); $("#price-chart").closest(".card").scrollIntoView({ behavior: "smooth", block: "start" }); }));
  ui.refreshIcons();
}

function drawExplorer(ui, food, focus) {
  const { state, escapeHtml } = ui;
  const currency = state.priceCurrency;
  const item = itemLookup(food).get(state.priceItem);
  const rows = food.prices.series.filter((series) => series.code === state.priceItem);
  const swings = new Set(food.prices.swings.filter((swing) => swing.code === state.priceItem).map((swing) => `${swing.country}|${swing.to}`));
  // Local currencies are not comparable on one axis, so the local view charts each country indexed to its first year (= 100).
  const series = rows.map((entry) => {
    const values = Object.entries(entry[currency]).map(([year, value]) => [Number(year), value / 1000]).sort((a, b) => a[0] - b[0]);
    const base = values[0]?.[1];
    return { name: entry.country, color: COUNTRY_COLORS[entry.country], points: currency === "lcu" ? values.map(([year, value]) => [year, base ? value / base * 100 : 0]) : values };
  });
  lineChart("#price-chart", series, { format: (value) => currency === "lcu" ? Number(value).toFixed(0) : `$${Number(value).toFixed(2)}`, highlight: focus });
  $("#price-legend").innerHTML = legend(ui, series, focus) + `<p class="method-note">${currency === "lcu" ? "Chart shows each country's local-currency price as an index (first year = 100), because currencies differ; actual prices are in the table." : "USD per kg, converted at official exchange rates."}</p>`;
  $$("#price-legend [data-legend-country]").forEach((button) => button.addEventListener("click", () => ui.setFilter("country", button.dataset.legendCountry === focus ? "all" : button.dataset.legendCountry)));
  const years = food.prices.years;
  $("#price-table").innerHTML = `<table class="data-table compact-table"><thead><tr><th>${escapeHtml(item?.name || "")} · per kg</th>${years.map((year) => `<th>${year}</th>`).join("")}<th>Change</th></tr></thead><tbody>${rows.map((entry) => {
    const values = entry[currency];
    const available = Object.keys(values).map(Number).sort((a, b) => a - b);
    const flat = available.length > 1 && available.every((year) => entry.lcu[year] === entry.lcu[available[0]]);
    const change = available.length > 1 ? (values[available.at(-1)] / values[available[0]] - 1) * 100 : null;
    const cell = (value) => value === undefined ? "–" : currency === "usd" ? usdKg(value / 1000) : formatLocal(value / 1000, entry.country, { digits: entry.country === "Yemen" ? 0 : undefined });
    return `<tr${focus === entry.country ? ' class="row-focus"' : ""}><td><strong>${escapeHtml(entry.country)}</strong></td>${years.map((year) => `<td>${cell(values[year])}${entry.imputed.includes(year) ? '<sup title="Imputed value">i</sup>' : ""}${swings.has(`${entry.country}|${year}`) ? '<sup title="Moved more than 60% in one year, verify">!</sup>' : ""}</td>`).join("")}<td>${flat ? '<span class="muted" title="FAOSTAT reports the same value in every year">0.0%</span>' : fmtPct(change, 1)}</td></tr>`;
  }).join("")}</tbody></table><p class="method-note"><sup>i</sup> imputed by FAOSTAT · <sup>!</sup> moved more than 60% in one year.</p>`;
}
