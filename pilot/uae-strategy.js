// UAE national strategy tracker - PILOT, kept outside the dashboard until reviewed.
// Renders data/strategy/uae-tracker.json (computed by scripts/build-uae-strategy.cjs) and the sourced
// register data/strategy/uae-register.json. All analysis text comes from the build; this file only lays it out.

const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const safeUrl = (value) => { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } };
const day = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmt = (value, digits = 0) => Number(value).toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });

// Status vocabulary -> tone (colour + shape + label).
const TONE = { meets: "good", "on-track": "good", improving: "good", partly: "mid", mixed: "mid", concentrated: "bad", "at-risk": "bad", declining: "bad", exposed: "bad", "baseline-pending": "none", "no-outcome-data": "none", "no-data": "none" };
const MARK = { good: "#49806a", mid: "#b7852f", bad: "#a6483c", none: "#7d93a2" };
const CATEGORY_LABEL = { meets: "Meets benchmark", partly: "Just short", concentrated: "Concentrated" };
const chip = (status, label) => `<span class="st-chip st-${TONE[status] || "none"}">${esc(label)}</span>`;
const VERIFY_LABEL = { official: "Official", press: "Press-reported", pending: "Pending document" };

async function main() {
  const host = $("#pilot");
  try {
    const [tracker, register] = await Promise.all(["../data/strategy/uae-tracker.json", "../data/strategy/uae-register.json"].map(async (url) => {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`${url} could not be loaded (${response.status}).`);
      return response.json();
    }));
    render(host, tracker, register);
  } catch (error) {
    host.innerHTML = `<div class="empty-state"><h2>The tracker could not be loaded</h2><p>${esc(error.message)}</p></div>`;
  }
}

function render(host, t, register) {
  const pillars = register.pillars;
  const f = t.findings;
  const nfss = register.strategies.find((s) => s.id === "nfss2051");
  host.innerHTML = `
    <div class="page-heading"><div>
      <div class="eyebrow">National strategy tracker · Pilot · United Arab Emirates</div>
      <h1 class="page-title">Is the UAE on course for its food security strategy?</h1>
      <p class="page-subtitle">Five strategic pillars drawn from the National Food Security Strategy 2051, the Ne'ma food loss and waste roadmap and the Dubai Food Security Strategy. Each pillar is read against public FAO data and the monitored policy record: are we on track, where are we exposed, and what should be done next.</p>
    </div></div>

    <div class="content-grid">
      <section class="card span-12"><div class="card-header"><div><h2 class="card-title">Strategic reading at a glance</h2><p class="card-subtitle">Status of each pillar. Select one to read the analysis.</p></div></div>
        <div class="card-body"><nav class="glance" aria-label="Pillars">${pillars.map((pillar) => `<a href="#p-${pillar.id}"><h3>${esc(pillar.name)}</h3>${chip(f[pillar.id].status, f[pillar.id].statusLabel)}<p>${esc(pillar.question)}</p></a>`).join("")}</nav></div>
      </section>

      <section class="card span-12"><div class="card-header"><div><h2 class="card-title">What the strategies commit to</h2><p class="card-subtitle">Only sourced commitments are listed. Each carries its verification level; nothing press-reported is used to set a status.</p></div></div>
        <div class="card-body">
          <div class="headline-callout">${chip("no-data", "No current scoreboard")}<div><q>${esc(nfss.headline.quote)}</q><p>${esc(nfss.headline.analystNote)}</p></div></div>
          <div class="reg-grid">${register.strategies.map(registerCard).join("")}</div>
          ${(register.signals || []).length ? `<div class="signals"><h3>Strategy in revision</h3><p class="signals-intro">Developments in the monitored record that will change what this tracker measures.</p>${register.signals.map((signal) => `<div class="signal"><div class="signal-head"><span class="ver ver-${signal.verification}">${VERIFY_LABEL[signal.verification]}</span><time>${esc(day(signal.date))}</time></div><p>${esc(signal.text)}</p><p class="signal-impl"><strong>What it means for tracking:</strong> ${esc(signal.implication)}</p><p class="reg-source">Source: <a href="${esc(safeUrl(signal.source.url))}" target="_blank" rel="noopener noreferrer">${esc(signal.source.publisher)}</a></p></div>`).join("")}</div>` : ""}
        </div>
      </section>

      ${pillars.map((pillar) => pillarSection(pillar, f[pillar.id], t)).join("")}

      <section class="card span-12" id="headline"><div class="card-header"><div><h2 class="card-title">The headline target, rebuilt from official data</h2><p class="card-subtitle">${esc(t.headline.note)}</p></div></div>
        <div class="card-body"><div class="proxy-grid">${t.headline.dimensions.map((dimension) => `<div class="proxy-col"><h3>${esc(dimension.name)}</h3>${dimension.items.map((item) => `<div class="proxy-item"><span>${esc(item.label)}</span><strong>${esc(item.value)}</strong><small>${esc(item.period || "–")}</small></div>`).join("")}</div>`).join("")}</div></div>
      </section>

      <section class="card span-12"><div class="card-header"><div><h2 class="card-title">Government data that would complete the picture</h2><p class="card-subtitle">Public international data lag by one to two years and cannot show readiness. These items, held by the government, would turn the tracker into a live management tool.</p></div></div>
        <div class="card-body table-scroll"><table class="st-table"><thead><tr><th>Data</th><th>Likely holder</th><th>What it unlocks</th></tr></thead><tbody>${register.governmentDataNeeded.map((row) => `<tr><td>${esc(row.item)}</td><td>${esc(row.holder)}</td><td>${esc(row.unlocks)}</td></tr>`).join("")}</tbody></table></div>
      </section>

      <section class="card span-12"><div class="card-header"><div><h2 class="card-title">Sources and limitations</h2></div></div>
        <div class="card-body"><ul class="src-list">
          <li>Trade: ${esc(t.sources.trade)}.</li>
          <li>Food balances: ${esc(t.sources.balances)}.</li>
          <li>Food security indicators: ${esc(t.sources.foodSecurity)}.</li>
          <li>Prices: ${esc(t.sources.prices)}. Policy measures: ${esc(t.sources.records)}.</li>
          <li>${esc(t.basketNote)}</li>
          <li>Statuses are analytical readings of public data, prepared for analyst review. They do not represent an official FAO or UAE Government assessment of strategy performance.</li>
        </ul></div>
      </section>
    </div>
    <p class="pilot-foot">Pilot generated ${esc(day(t.generatedAt))} · Policy Intelligence, GCC States &amp; Yemen</p>`;
  drawDiversification($("#chart-supply"), t);
  drawProduction($("#chart-production"), t);
  window.addEventListener("resize", debounce(() => { drawDiversification($("#chart-supply"), t); drawProduction($("#chart-production"), t); }, 150));
}

function registerCard(strategy) {
  return `<article class="reg-card"><h3>${esc(strategy.name)}</h3><p class="reg-level">${esc(strategy.level)}</p>
    <ul class="reg-goals">${[...(strategy.structure || []), ...strategy.goals].map((goal) => `<li><span class="ver ver-${goal.verification}">${VERIFY_LABEL[goal.verification]}</span><span class="${goal.verification === "pending" ? "is-pending" : ""}">${esc(goal.text)}</span></li>`).join("")}</ul>
    ${strategy.analystNote ? `<p class="reg-source">${esc(strategy.analystNote)}</p>` : ""}
    <p class="reg-source">Source: <a href="${esc(safeUrl(strategy.source.url))}" target="_blank" rel="noopener noreferrer">${esc(strategy.source.publisher)}</a>, checked ${esc(day(strategy.source.checked))}</p></article>`;
}

function pillarSection(pillar, finding, t) {
  const evidence = t.implementation[pillar.id];
  const chart = pillar.id === "supply"
    ? `<div class="st-legend"><span><i class="lg-band"></i>Strategy benchmark: ${t.benchmark.min}–${t.benchmark.max} sources</span><span><i class="lg-dot" style="background:${MARK.good}"></i>Meets</span><span><i class="lg-dot" style="background:${MARK.mid}"></i>Just short</span><span><i class="lg-dot" style="background:${MARK.bad}"></i>Concentrated (&lt; 2)</span><span><i class="lg-ring"></i>${esc(t.diversification.categories[0].compareYear)} value</span></div><div id="chart-supply"></div>${supplyTable(t)}`
    : pillar.id === "production"
      ? `<div class="st-legend"><span><i class="lg-dot" style="background:#b9c7d1"></i>2015</span><span><i class="lg-dot" style="background:#116aab"></i>Latest (2023)</span><span>Share of domestic supply produced locally</span></div><div id="chart-production"></div>${productionTable(t)}`
      : "";
  return `<section class="card span-12 pillar" id="p-${pillar.id}"><div class="card-header"><div><h2 class="card-title">${esc(pillar.name)}</h2><p class="pillar-q">${esc(pillar.question)}</p></div>${chip(finding.status, finding.statusLabel)}</div>
    <div class="card-body"><div class="pillar-grid">
      <div class="pillar-analysis">${finding.analysis.map((text) => `<p>${esc(text)}</p>`).join("")}${chart}<p class="method"><strong>Method.</strong> ${esc(finding.method)}</p></div>
      <div class="pillar-side">
        <div class="side-box"><h4>Evidence of implementation</h4><p>${esc(finding.evidence)}</p>${evidence.institutions.length ? `<p><strong>Most active in the record:</strong> ${esc(evidence.institutions.map((item) => item.name).join("; "))}</p>` : ""}
          ${evidence.examples.length ? `<ul class="evidence-list">${evidence.examples.map((record) => `<li><a href="${esc(safeUrl(record.source))}" target="_blank" rel="noopener noreferrer">${esc(record.title)}</a><small>${esc(day(record.date))}${record.institution ? ` · ${esc(record.institution)}` : ""}${record.type === "framework" ? " · long-term framework" : ""}</small></li>`).join("")}</ul>` : ""}</div>
        <div class="side-box"><h4>Draft options for analyst review</h4>${finding.options.map((option) => `<div class="option"><strong>${esc(option.action)}</strong><p>${esc(option.why)}</p><p class="watch">Indicator to watch: ${esc(option.watch)}</p></div>`).join("")}<p class="reg-source">Lead institution in the record: ${esc(finding.owner)}</p></div>
      </div>
    </div></div></section>`;
}

function supplyTable(t) {
  const rows = [...t.diversification.categories].sort((a, b) => a.years[a.latest].effective - b.years[b.latest].effective);
  return `<details class="st-data"><summary>Data table</summary><div class="table-scroll"><table class="st-table"><thead><tr><th>Category</th><th>Effective suppliers ${esc(rows[0].compareYear)}</th><th>Effective suppliers ${esc(rows[0].latest)}</th><th>Leading supplier</th><th>Suppliers ≥ 5%</th><th>Imports (t)</th><th>Status</th></tr></thead><tbody>${rows.map((c) => { const y = c.years[c.latest], b = c.years[c.compareYear]; return `<tr><td>${esc(c.name)}${c.detail ? ` <small>(${esc(c.detail)})</small>` : ""}</td><td class="num">${fmt(b.effective, 1)}</td><td class="num">${fmt(y.effective, 1)}</td><td>${esc(y.top.partner)} ${fmt(y.top.share, 0)}%</td><td class="num">${y.over5}</td><td class="num">${fmt(y.totalT)}</td><td>${esc(CATEGORY_LABEL[c.status])}</td></tr>`; }).join("")}</tbody></table></div></details>`;
}
function productionTable(t) {
  return `<details class="st-data"><summary>Data table</summary><div class="table-scroll"><table class="st-table"><thead><tr><th>Item</th><th>Self-sufficiency ${esc(t.production.items[0].first)}</th><th>Self-sufficiency latest</th><th>Production (kt)</th><th>Domestic supply (kt)</th></tr></thead><tbody>${t.production.items.map((item) => { const a = item.years[item.first], b = item.years[item.latest]; return `<tr><td>${esc(item.name)}</td><td class="num">${fmt(a.selfSufficiency, 0)}%</td><td class="num">${fmt(b.selfSufficiency, 0)}%</td><td class="num">${fmt(b.production)}</td><td class="num">${fmt(b.supply)}</td></tr>`; }).join("")}</tbody></table></div></details>`;
}

// ---------- charts ----------
let tooltip;
function tip(event, html) {
  tooltip ||= Object.assign(document.body.appendChild(document.createElement("div")), { className: "chart-tooltip" });
  if (!html) { tooltip.style.display = "none"; return; }
  tooltip.innerHTML = html; tooltip.style.display = "block";
  const x = Math.min(event.clientX + 14, window.innerWidth - tooltip.offsetWidth - 8), y = Math.min(event.clientY + 14, window.innerHeight - tooltip.offsetHeight - 8);
  tooltip.style.left = `${x}px`; tooltip.style.top = `${y}px`;
}

function drawDiversification(host, t) {
  if (!host || !window.d3) return;
  const d3 = window.d3;
  const rows = [...t.diversification.categories].sort((a, b) => a.years[a.latest].effective - b.years[b.latest].effective);
  const width = Math.max(320, host.clientWidth || 700);
  const narrow = width < 520;
  const margin = { top: 22, right: 58, bottom: 34, left: narrow ? 108 : 150 };
  const rowH = 24, height = margin.top + margin.bottom + rows.length * rowH;
  const max = Math.max(t.benchmark.max + 1, ...rows.map((c) => Math.max(c.years[c.latest].effective, c.years[c.compareYear].effective)));
  const x = d3.scaleLinear().domain([0, Math.ceil(max)]).range([margin.left, width - margin.right]);
  const y = (i) => margin.top + i * rowH + rowH / 2;
  host.innerHTML = "";
  const svg = d3.select(host).append("svg").attr("class", "st-chart").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("aria-label", "Effective number of suppliers per basket category, latest year, with the 3 to 5 source benchmark");
  svg.append("g").attr("class", "grid").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).ticks(Math.ceil(max)).tickSize(-(height - margin.top - margin.bottom)).tickFormat("")).select(".domain").remove();
  svg.append("rect").attr("x", x(t.benchmark.min)).attr("width", x(t.benchmark.max) - x(t.benchmark.min)).attr("y", margin.top - 8).attr("height", height - margin.top - margin.bottom + 8).attr("fill", "rgba(73,128,106,.13)");
  [t.benchmark.min, t.benchmark.max].forEach((value) => svg.append("line").attr("x1", x(value)).attr("x2", x(value)).attr("y1", margin.top - 8).attr("y2", height - margin.bottom).attr("stroke", "#49806a").attr("stroke-dasharray", "4 3"));
  svg.append("text").attr("x", (x(t.benchmark.min) + x(t.benchmark.max)) / 2).attr("y", margin.top - 12).attr("text-anchor", "middle").attr("font-size", 11).attr("fill", "#2f6b55").text("Strategy benchmark");
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).ticks(Math.ceil(max)));
  svg.append("text").attr("x", width - margin.right).attr("y", height - 4).attr("text-anchor", "end").attr("font-size", 11).text("Effective number of suppliers →");
  const g = svg.append("g").selectAll("g").data(rows).join("g").attr("transform", (c, i) => `translate(0,${y(i)})`);
  g.append("text").attr("class", "cat-label").attr("x", margin.left - 10).attr("dy", "0.35em").attr("text-anchor", "end").text((c) => c.name);
  g.append("rect").attr("x", x(0)).attr("y", -6).attr("height", 12).attr("rx", 4).attr("width", (c) => Math.max(2, x(c.years[c.latest].effective) - x(0))).attr("fill", (c) => MARK[TONE[c.status]]);
  g.append("circle").attr("cx", (c) => x(c.years[c.compareYear].effective)).attr("r", 4.5).attr("fill", "white").attr("stroke", "#19455f").attr("stroke-width", 2);
  svg.append("text").attr("x", width - 4).attr("y", margin.top - 12).attr("text-anchor", "end").attr("font-size", 11).text(t.diversification.latestYear);
  g.append("text").attr("class", "val").attr("x", width - 4).attr("text-anchor", "end").attr("dy", "0.35em").text((c) => fmt(c.years[c.latest].effective, 1));
  // Hover target: the whole row, larger than the mark.
  g.append("rect").attr("x", 0).attr("y", -rowH / 2).attr("width", width).attr("height", rowH).attr("fill", "transparent")
    .on("mousemove", (event, c) => { const yv = c.years[c.latest], b = c.years[c.compareYear]; tip(event, `<strong>${esc(c.name)}${c.detail ? ` (${esc(c.detail)})` : ""}</strong><br>${esc(CATEGORY_LABEL[c.status])}: ${fmt(yv.effective, 1)} effective suppliers in ${esc(c.latest)} (${fmt(b.effective, 1)} in ${esc(c.compareYear)})<br>${yv.leading.slice(0, 3).map((item) => `${esc(item.partner)} ${fmt(item.share, 0)}%`).join(" · ")}<br>${fmt(yv.totalT)} t from ${yv.suppliers} countries`); })
    .on("mouseleave", (event) => tip(event, null));
}

function drawProduction(host, t) {
  if (!host || !window.d3) return;
  const d3 = window.d3;
  const items = [...t.production.items].sort((a, b) => b.years[b.latest].selfSufficiency - a.years[a.latest].selfSufficiency);
  const width = Math.max(320, host.clientWidth || 700);
  const narrow = width < 520;
  const margin = { top: 22, right: 58, bottom: 34, left: narrow ? 108 : 150 };
  const rowH = 24, height = margin.top + margin.bottom + items.length * rowH;
  const max = Math.max(100, ...items.flatMap((item) => [item.years[item.first].selfSufficiency, item.years[item.latest].selfSufficiency]));
  const x = d3.scaleLinear().domain([0, Math.ceil(max / 20) * 20]).range([margin.left, width - margin.right]);
  host.innerHTML = "";
  const svg = d3.select(host).append("svg").attr("class", "st-chart").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("aria-label", "Self-sufficiency ratio by item, 2015 and latest year");
  svg.append("g").attr("class", "grid").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).ticks(6).tickSize(-(height - margin.top - margin.bottom)).tickFormat("")).select(".domain").remove();
  svg.append("line").attr("x1", x(100)).attr("x2", x(100)).attr("y1", margin.top).attr("y2", height - margin.bottom).attr("stroke", "#19455f").attr("stroke-dasharray", "3 3");
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).ticks(6).tickFormat((v) => `${v}%`));
  const g = svg.append("g").selectAll("g").data(items).join("g").attr("transform", (item, i) => `translate(0,${margin.top + i * rowH + rowH / 2})`);
  g.append("text").attr("class", "cat-label").attr("x", margin.left - 10).attr("dy", "0.35em").attr("text-anchor", "end").text((item) => item.name);
  g.append("line").attr("x1", (item) => x(item.years[item.first].selfSufficiency)).attr("x2", (item) => x(item.years[item.latest].selfSufficiency)).attr("stroke", "#9fb3c0").attr("stroke-width", 2);
  g.append("circle").attr("cx", (item) => x(item.years[item.first].selfSufficiency)).attr("r", 5).attr("fill", "#b9c7d1").attr("stroke", "white").attr("stroke-width", 1.5);
  g.append("circle").attr("cx", (item) => x(item.years[item.latest].selfSufficiency)).attr("r", 5.5).attr("fill", "#116aab").attr("stroke", "white").attr("stroke-width", 1.5);
  svg.append("text").attr("x", width - 4).attr("y", margin.top - 12).attr("text-anchor", "end").attr("font-size", 11).text(items[0].latest);
  svg.append("text").attr("x", x(100)).attr("y", margin.top - 12).attr("text-anchor", "middle").attr("font-size", 11).attr("fill", "#19455f").text("100% = self-sufficient");
  g.append("text").attr("class", "val").attr("x", width - 4).attr("text-anchor", "end").attr("dy", "0.35em").text((item) => `${fmt(item.years[item.latest].selfSufficiency, 0)}%`);
  g.append("rect").attr("x", 0).attr("y", -rowH / 2).attr("width", width).attr("height", rowH).attr("fill", "transparent")
    .on("mousemove", (event, item) => { const a = item.years[item.first], b = item.years[item.latest]; tip(event, `<strong>${esc(item.name)}</strong><br>${fmt(a.selfSufficiency, 0)}% in ${esc(item.first)} → ${fmt(b.selfSufficiency, 0)}% in ${esc(item.latest)}<br>Production ${fmt(b.production)} kt of ${fmt(b.supply)} kt domestic supply`); })
    .on("mouseleave", (event) => tip(event, null));
}

function debounce(fn, ms) { let timer; return () => { clearTimeout(timer); timer = setTimeout(fn, ms); }; }

// d3 is loaded with `defer`; module scripts also run after parsing, but wait for it explicitly.
if (window.d3) main(); else window.addEventListener("DOMContentLoaded", main, { once: true });
