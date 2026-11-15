// Food Price Outlook (Futures, phase 1): 12-month food CPI forecasts per GCC country with backtested
// accuracy, empirical prediction intervals and transparent hypothetical scenarios.
// Data: data/forecasts/food-cpi.json, built by scripts/build-forecasts.cjs from FAOSTAT CP (monthly).

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

let dataPromise = null;
const loadForecasts = () => dataPromise ||= fetch("./data/forecasts/food-cpi.json?v=pi-20261115b").then((r) => { if (!r.ok) throw new Error(`Forecast data unavailable (${r.status})`); return r.json(); });

const ymDate = (ym) => new Date(`${ym}-01T00:00:00Z`);
const ymLabel = (ym) => ymDate(ym).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const addMonths = (ym, n) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };

// Scenario ramp in percentage points on year-on-year inflation at horizon h (1-12).
const rampPp = (data, state, h) => {
  if (state.futuresScenario === "adverse") return data.scenario.adverseShockPp * h / 12;
  if (state.futuresScenario === "policy") return data.scenario.adverseShockPp * h / 12 * (1 - (state.futuresMitigation ?? 50) / 100);
  return 0;
};

function seriesFor(data, country, state) {
  const c = data.countries[country];
  const indicator = state.futuresIndicator;
  const history = Object.entries(c.history[indicator === "index" ? "food" : "inflation"]).map(([ym, value]) => ({ ym, value })).sort((a, b) => a.ym.localeCompare(b.ym));
  if (c.status !== "forecast") return { c, history, forecast: [], scenario: [] };
  const f = c.forecast;
  const forecast = f.months.map((ym, i) => {
    const pick = (band) => f[indicator === "index" ? "index" : "inflation"][band][i];
    return { ym, mid: pick("mid"), lo80: pick("lo80"), lo50: pick("lo50"), hi50: pick("hi50"), hi80: pick("hi80") };
  });
  const scenario = state.futuresScenario === "baseline" ? [] : f.months.map((ym, i) => {
    const pp = rampPp(data, state, i + 1);
    if (indicator === "inflation") return { ym, value: f.inflation.mid[i] + pp };
    const prior = c.history.food[addMonths(ym, -12)];
    return { ym, value: f.index.mid[i] + (prior ?? 0) * pp / 100 };
  });
  return { c, history, forecast, scenario };
}

function drawChart(ui, data, state, host) {
  const { escapeHtml } = ui;
  const country = state.futuresCountry;
  const { c, history, forecast, scenario } = seriesFor(data, country, state);
  const indicator = state.futuresIndicator;
  const since = state.futuresRange === "all" ? "0000" : "2018-01";
  // A series that ends before the chosen window (Yemen) shows its full history instead of an empty chart.
  let shown = history.filter((d) => d.ym >= since);
  if (!shown.length) shown = history;
  const width = Math.max(560, host.clientWidth || 860), height = 340, margin = { top: 16, right: 18, bottom: 28, left: 46 };
  const months = [...shown.map((d) => d.ym), ...forecast.map((d) => d.ym)];
  const x = d3.scaleUtc().domain([ymDate(months[0]), ymDate(months.at(-1))]).range([margin.left, width - margin.right]);
  const values = [...shown.map((d) => d.value), ...forecast.flatMap((d) => [d.lo80, d.hi80]), ...scenario.map((d) => d.value)].filter((v) => v != null);
  const y = d3.scaleLinear().domain([Math.min(...values), Math.max(...values)]).nice().range([height - margin.bottom, margin.top]);
  const svg = d3.select(host).html("").append("svg").attr("class", "fx-chart").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img")
    .attr("aria-label", `${country}: observed and forecast food ${indicator === "index" ? "CPI index" : "inflation"}`);
  svg.append("g").attr("class", "chart-axis").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).ticks(6).tickSizeOuter(0));
  svg.append("g").attr("class", "chart-axis").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(width - margin.left - margin.right)).tickSizeOuter(0)).call((g) => g.selectAll(".tick line").attr("stroke", "rgba(16,47,70,.08)"));
  if (indicator === "inflation" && y.domain()[0] < 0) svg.append("line").attr("x1", margin.left).attr("x2", width - margin.right).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "#9fb0bc").attr("stroke-dasharray", "2 3");
  const line = d3.line().x((d) => x(ymDate(d.ym))).y((d) => y(d.value));
  if (forecast.length) {
    const area = (lo, hi) => d3.area().x((d) => x(ymDate(d.ym))).y0((d) => y(d[lo])).y1((d) => y(d[hi]));
    const joined = [{ ym: history.at(-1).ym, lo80: history.at(-1).value, hi80: history.at(-1).value, lo50: history.at(-1).value, hi50: history.at(-1).value, mid: history.at(-1).value }, ...forecast];
    svg.append("path").datum(joined).attr("d", area("lo80", "hi80")).attr("fill", "rgba(17,106,171,.12)");
    svg.append("path").datum(joined).attr("d", area("lo50", "hi50")).attr("fill", "rgba(17,106,171,.2)");
    svg.append("line").attr("x1", x(ymDate(history.at(-1).ym))).attr("x2", x(ymDate(history.at(-1).ym))).attr("y1", margin.top).attr("y2", height - margin.bottom).attr("stroke", "#5f7686").attr("stroke-dasharray", "3 3");
    svg.append("text").attr("class", "fx-rule-label").attr("x", x(ymDate(history.at(-1).ym)) - 6).attr("y", margin.top + 10).attr("text-anchor", "end").text(`Last observed ${ymLabel(history.at(-1).ym)}`);
    svg.append("path").datum([{ ym: history.at(-1).ym, value: history.at(-1).value }, ...forecast.map((d) => ({ ym: d.ym, value: d.mid }))]).attr("d", line).attr("fill", "none").attr("stroke", "#116aab").attr("stroke-width", 2).attr("stroke-dasharray", "6 4");
  }
  svg.append("path").datum(shown).attr("d", line).attr("fill", "none").attr("stroke", "#116aab").attr("stroke-width", 2);
  if (scenario.length) svg.append("path").datum([{ ym: history.at(-1).ym, value: history.at(-1).value }, ...scenario]).attr("d", line).attr("fill", "none").attr("stroke", "#b7852f").attr("stroke-width", 2.2).attr("stroke-dasharray", "2 4");
  // Hover: nearest month, with its status spelled out.
  const tip = d3.select(host).append("div").attr("class", "chart-tooltip").style("display", "none");
  const all = [...shown.map((d) => ({ ...d, status: "Observed (FAOSTAT)" })), ...forecast.map((d) => ({ ym: d.ym, value: d.mid, band: d, status: "Modelled forecast" }))];
  const unit = indicator === "index" ? "" : "%";
  svg.append("rect").attr("x", margin.left).attr("y", margin.top).attr("width", width - margin.left - margin.right).attr("height", height - margin.top - margin.bottom).attr("fill", "transparent")
    .on("pointermove", (event) => {
      const [px] = d3.pointer(event);
      const target = all.reduce((best, d) => Math.abs(x(ymDate(d.ym)) - px) < Math.abs(x(ymDate(best.ym)) - px) ? d : best, all[0]);
      const sc = scenario.find((d) => d.ym === target.ym);
      tip.style("display", "block").style("left", `${event.clientX + 14}px`).style("top", `${event.clientY + 12}px`).html(
        `<strong>${ymLabel(target.ym)}</strong><br>${escapeHtml(target.status)}: ${target.value.toFixed(1)}${unit}` +
        (target.band ? `<br>80% interval: ${target.band.lo80.toFixed(1)} to ${target.band.hi80.toFixed(1)}${unit}` : "") +
        (sc ? `<br>Scenario (hypothetical): ${sc.value.toFixed(1)}${unit}` : ""));
    })
    .on("pointerleave", () => tip.style("display", "none"));
  const scenarioName = state.futuresScenario === "adverse" ? "Adverse scenario" : `Policy response (${100 - (state.futuresMitigation ?? 50)}% of shock remains)`;
  $("#fx-legend").innerHTML = [
    `<span><i class="fx-swatch" style="background:#116aab"></i>Observed</span>`,
    forecast.length ? `<span><i class="fx-swatch fx-dash" style="color:#116aab"></i>Forecast (modelled)</span><span><i class="fx-swatch" style="background:rgba(17,106,171,.2)"></i>50% and 80% intervals</span>` : "",
    scenario.length ? `<span><i class="fx-swatch fx-dot" style="color:#b7852f"></i>${escapeHtml(scenarioName)} - hypothetical</span>` : "",
  ].filter(Boolean).join("");
  return { c };
}

// Early-warning rules, computed on observed data only and spelled out next to each signal.
function warningRows(c) {
  if (c.status !== "forecast") {
    return [{ level: "gap", title: "Data gap", text: `${c.statusReason} Early-warning rules are not evaluated on stale data.` }];
  }
  const infl = c.history.inflation;
  const months = Object.keys(infl).sort();
  const latest = months.at(-1);
  const now = infl[latest], threeAgo = infl[addMonths(latest, -3)];
  const rows = [];
  rows.push(now >= 10 ? { level: "high", title: "Food inflation high", text: `${now.toFixed(1)}% in ${ymLabel(latest)} (rule: at or above 10% year on year).` }
    : now >= 5 ? { level: "watch", title: "Food inflation elevated", text: `${now.toFixed(1)}% in ${ymLabel(latest)} (rule: at or above 5% year on year).` }
    : { level: "ok", title: "Food inflation within range", text: `${now.toFixed(1)}% in ${ymLabel(latest)} (below the 5% watch threshold).` });
  if (threeAgo != null) {
    const accel = now - threeAgo;
    rows.push(accel >= 2 ? { level: "watch", title: "Price acceleration", text: `Food inflation rose ${accel.toFixed(1)} pp in three months (rule: 2 pp or more).` }
      : { level: "ok", title: "No acceleration signal", text: `Three-month change ${accel >= 0 ? "+" : ""}${accel.toFixed(1)} pp (threshold 2 pp).` });
  }
  return rows;
}

function downloadCsv(ui, data, state) {
  const country = state.futuresCountry;
  const { c, forecast, scenario } = seriesFor(data, country, { ...state, futuresIndicator: "index" });
  const inflationView = seriesFor(data, country, { ...state, futuresIndicator: "inflation" });
  const rows = [["country_iso3", "country_name", "indicator_code", "indicator_name", "observation_date", "frequency", "value", "unit", "index_base_year", "observation_status", "lo80", "lo50", "hi50", "hi80", "source_name", "source_url", "retrieval_date", "forecast_generated"]];
  const push = (code, name, ym, value, unit, status, band = {}) => rows.push([c.iso3, country, code, name, `${ym}-01`, "monthly", value, unit, "2015", status, band.lo80 ?? "", band.lo50 ?? "", band.hi50 ?? "", band.hi80 ?? "", data.source.name, data.source.url, data.source.retrievedAt, data.generatedAt]);
  Object.entries(c.history.food).sort().forEach(([ym, v]) => push("23013", "Food CPI index", ym, v, "index", "observed"));
  Object.entries(c.history.inflation).sort().forEach(([ym, v]) => push("23014", "Food price inflation, year on year", ym, v, "percent", "observed"));
  forecast.forEach((d) => push("23013", "Food CPI index", d.ym, d.mid, "index", "model_forecast", d));
  inflationView.forecast.forEach((d) => push("23014", "Food price inflation, year on year", d.ym, d.mid, "percent", "model_forecast", d));
  scenario.forEach((d) => push("23013", "Food CPI index", d.ym, Math.round(d.value * 10) / 10, "index", `hypothetical_scenario_${state.futuresScenario}`));
  inflationView.scenario.forEach((d) => push("23014", "Food price inflation, year on year", d.ym, Math.round(d.value * 10) / 10, "percent", `hypothetical_scenario_${state.futuresScenario}`));
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  ui.downloadBlob(new Blob(["﻿" + csv], { type: "text/csv" }), `food-price-outlook-${c.iso3.toLowerCase()}-${data.generatedAt}.csv`);
}

export function renderFuturesPage(ui) {
  const { state, escapeHtml, icon, COUNTRIES } = ui;
  loadForecasts().then((data) => {
    if (state.page !== "futures") return;
    state.futuresCountry ||= (COUNTRIES.includes(state.country) ? state.country : "Saudi Arabia");
    state.futuresIndicator ||= "inflation";
    state.futuresScenario ||= "baseline";
    state.futuresMitigation ??= 50;
    state.futuresRange ||= "recent";
    const c = data.countries[state.futuresCountry];
    const hasForecast = c.status === "forecast";
    const actions = `<div class="tm-actions">
      <button class="button button-outline" type="button" id="fx-csv">${icon("download", 16)}Download CSV</button>
      <button class="button button-outline" type="button" id="fx-print">${icon("printer", 16)}Print outlook</button></div>`;
    const seg = (id, options, active) => `<div class="chart-toolbar" role="group" id="${id}">${options.map(([value, label]) => `<button type="button" data-value="${value}" aria-pressed="${value === active}">${escapeHtml(label)}</button>`).join("")}</div>`;
    const warn = warningRows(c);
    const model = hasForecast ? c.model : null;
    const flagged = c.flagCounts ? Object.entries(c.flagCounts).filter(([f]) => f !== "A").reduce((a, [, n]) => a + n, 0) : 0;
    $("#page-content").innerHTML = `${ui.heading("Food Price Outlook", "Observed food consumer prices and a 12-month statistical forecast per country, with backtested accuracy, prediction intervals and clearly labelled hypothetical scenarios.", "FUTURES · PHASE 1", actions)}
    <div class="fx-controls">
      <label class="tm-country">Country <select id="fx-country">${COUNTRIES.map((name) => `<option value="${escapeHtml(name)}" ${name === state.futuresCountry ? "selected" : ""}>${escapeHtml(name)}${data.countries[name].status !== "forecast" ? " (no forecast)" : ""}</option>`).join("")}</select></label>
      ${seg("fx-indicator", [["inflation", "Food inflation % y/y"], ["index", "Food CPI index"]], state.futuresIndicator)}
      ${seg("fx-scenario", [["baseline", "Baseline"], ["adverse", "Adverse"], ["policy", "Policy response"]], state.futuresScenario)}
      ${seg("fx-range", [["recent", "Since 2018"], ["all", "Full history"]], state.futuresRange)}
    </div>
    ${state.futuresScenario === "policy" ? `<div class="fx-slider"><label for="fx-mitigation">Hypothetical mitigation of the adverse shock: <strong id="fx-mitigation-value">${state.futuresMitigation}%</strong></label><input type="range" id="fx-mitigation" min="0" max="100" step="10" value="${state.futuresMitigation}"><span class="fx-slider-note">Illustrates a chosen dampening of the shock (for example through trade diversification or targeted support). It is not a measured policy effect.</span></div>` : ""}
    ${state.futuresScenario !== "baseline" ? `<p class="fx-scenario-note">${icon("flask-conical", 15)} ${state.futuresScenario === "adverse" ? `The adverse scenario raises year-on-year food inflation by up to <strong>${data.scenario.adverseShockPp} pp</strong> after 12 months - the median GCC rise seen from 2019-20 levels to the 2021-22 global food price surge, derived from this same FAOSTAT series.` : `The policy-response scenario keeps ${100 - state.futuresMitigation}% of the adverse shock (${data.scenario.adverseShockPp} pp at 12 months) after hypothetical mitigation.`} Scenario lines are hypothetical illustrations, not predictions.</p>` : ""}
    ${ui.card(`${escapeHtml(state.futuresCountry)}: ${state.futuresIndicator === "index" ? "food CPI index (2015 = 100)" : "food price inflation, % change on a year earlier"}`, hasForecast ? `Monthly observations to ${ymLabel(c.latestObservation)}, then a ${data.horizonMonths}-month forecast generated ${ui.formatDate(data.generatedAt)}.` : "Monthly observations; this series is too outdated for a validated forecast.", `<div id="fx-chart-host" class="fx-chart-host"></div><div class="fx-legend" id="fx-legend"></div>`, "fx-card fx-chart-card")}
    ${!hasForecast ? ui.card("Why there is no forecast", "", `<p class="card-lead">${escapeHtml(c.statusReason)}</p><p class="card-lead">Current food security and price monitoring for ${escapeHtml(state.futuresCountry)} is maintained by:</p><ul class="narrative-list">${(c.alternatives || []).map((a) => `<li><a href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(a.name)} ↗</a></li>`).join("")}</ul>`, "fx-card") : ""}
    <div class="fx-grid">
      ${hasForecast ? ui.card("Model and accuracy", "Chosen by rolling-origin backtesting against a seasonal-naive benchmark.", `
        <dl class="fx-facts">
          <div><dt>Model</dt><dd>${escapeHtml(model.name)}</dd></div>
          <div><dt>Backtest design</dt><dd>${escapeHtml(model.backtest.design)}</dd></div>
          <div><dt>Error (RMSE, index points)</dt><dd>1 month ahead ${model.backtest.h1.rmse} · 6 months ${model.backtest.h6.rmse} · 12 months ${model.backtest.h12.rmse}</dd></div>
          <div><dt>Against seasonal naive</dt><dd>${Math.round(model.backtest.skillVsSeasonalNaive * 100)}% lower error (benchmark RMSE ${model.backtest.benchmarkSeasonalNaive.rmse})</dd></div>
          <div><dt>History used</dt><dd>${c.observations} monthly observations to ${ymLabel(c.latestObservation)}${flagged ? `; ${flagged} carry FAOSTAT estimate or imputation flags` : ""}</dd></div>
          <div><dt>Intervals</dt><dd>Empirical 50% and 80% bands from backtest errors per horizon; the point forecast is bias-corrected by the median backtest error</dd></div>
        </dl>`, "fx-card") : ""}
      ${ui.card("Early-warning signals", "Rule-based statistical signals on observed data - not confirmed emergencies; analyst verification is required.", `<div class="fx-alerts">${warn.map((w) => `<div class="fx-alert fx-alert-${w.level}"><strong>${escapeHtml(w.title)}</strong><span>${escapeHtml(w.text)}</span></div>`).join("")}</div>`, "fx-card")}
      ${ui.card("Data and method", "", `
        <dl class="fx-facts">
          <div><dt>Source</dt><dd><a href="${escapeHtml(data.source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(data.source.name)} ↗</a></dd></div>
          <div><dt>Retrieved</dt><dd>${ui.formatDate(data.source.retrievedAt)} (bulk download; raw regional extract kept in the repository)</dd></div>
          <div><dt>Latest observation</dt><dd>${ymLabel(c.latestObservation)}</dd></div>
          <div><dt>Forecast generated</dt><dd>${ui.formatDate(data.generatedAt)}</dd></div>
          <div><dt>Status labels</dt><dd>Every value is labelled observed, modelled forecast or hypothetical scenario - in the chart, the tooltip and the CSV export.</dd></div>
        </dl>
        <details class="fx-method"><summary>Methodology and limitations</summary>
          <p>Forecasts model the food CPI index (2015 = 100); inflation forecasts are derived from the index against the observed index a year earlier, so the two can never disagree. Models are refit at every backtest origin. Forecasts are suppressed where the series is outdated or too short (Yemen's FAOSTAT series ends in 2017). Intervals reflect past model errors only: they cannot anticipate unprecedented shocks. The adverse scenario size is derived from this same series (${escapeHtml(String(data.scenario.adverseShockPp))} pp, median GCC 2021-22 surge); scenario outputs are hypothetical illustrations, not measured policy effects, and none of this is an official FAO or government forecast.</p>
        </details>`, "fx-card")}
    </div>`;
    const host = $("#fx-chart-host");
    drawChart(ui, data, state, host);
    $("#fx-country").addEventListener("change", (event) => { state.futuresCountry = event.target.value; renderFuturesPage(ui); });
    [["fx-indicator", "futuresIndicator"], ["fx-scenario", "futuresScenario"], ["fx-range", "futuresRange"]].forEach(([id, key]) => $$(`#${id} button`).forEach((button) => button.addEventListener("click", () => { state[key] = button.dataset.value; renderFuturesPage(ui); })));
    $("#fx-mitigation")?.addEventListener("input", (event) => { state.futuresMitigation = Number(event.target.value); $("#fx-mitigation-value").textContent = `${state.futuresMitigation}%`; drawChart(ui, data, state, host); });
    $("#fx-csv").addEventListener("click", () => downloadCsv(ui, data, state));
    $("#fx-print").addEventListener("click", () => window.print());
    window.__fxResize ||= (() => { let timer; window.addEventListener("resize", () => { clearTimeout(timer); timer = setTimeout(() => { if (state.page === "futures" && $("#fx-chart-host")) drawChart(ui, loadedData, state, $("#fx-chart-host")); }, 150); }); return true; })();
    loadedData = data;
    ui.refreshIcons();
  }).catch((error) => {
    $("#page-content").innerHTML = ui.emptyMarkup("The outlook could not be loaded", `${error.message}. Reload the page to try again.`);
    ui.wireEmptyActions();
  });
}
let loadedData = null;
