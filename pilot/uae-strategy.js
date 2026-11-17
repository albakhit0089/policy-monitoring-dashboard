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
    // The double-click version (uae-strategy-standalone.html) carries its data inline.
    const inline = window.__UAE_PILOT__;
    const [tracker, register] = inline ? [inline.tracker, inline.register] : await Promise.all(["../data/strategy/uae-tracker.json", "../data/strategy/uae-register.json"].map(async (url) => {
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
      <div class="eyebrow">Food security monitor · Pilot · United Arab Emirates</div>
      <h1 class="page-title">What needs attention now, and are commitments being delivered?</h1>
      <p class="page-subtitle">Supplier-risk alerts matched to the UAE's own import dependence, a short decision brief, and a commitment-to-action tracker that separates announcements from delivery. The strategy pillars below give the longer-term reading.</p>
    </div><div class="heading-actions"><a class="button button-outline" href="#brief">Decision brief</a></div></div>

    <div class="content-grid">
      ${situationCard(t)}
      ${alertsSection(t)}
      ${briefSection(t)}
      ${commitmentsSection(t)}
      <div class="span-12 section-divider"><h2>Strategy pillars in depth</h2><p>The longer-term reading of each strategy pillar against FAO data. Trade data run to ${esc(t.diversification.latestYear)}.</p></div>
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
  $("#brief-word")?.addEventListener("click", () => downloadBrief(t.brief));
  $("#brief-print")?.addEventListener("click", () => { document.body.classList.add("print-brief"); window.print(); setTimeout(() => document.body.classList.remove("print-brief"), 500); });
  drawDiversification($("#chart-supply"), t);
  drawProduction($("#chart-production"), t);
  window.addEventListener("resize", debounce(() => { drawDiversification($("#chart-supply"), t); drawProduction($("#chart-production"), t); }, 150));
}

// ---------- situation, alerts, brief, commitments ----------
const LEVEL = { critical: ["bad", "Critical"], high: ["bad", "High"], watch: ["mid", "Watch"], clear: ["good", "Clear"] };
const COMMIT = { delivering: ["good", "Delivering"], moving: ["mid", "Moving"], announcements: ["mid", "Announcements only"], stalled: ["bad", "Stalled"], "no-action": ["none", "No action found"] };
const toneChip = ([tone, label]) => `<span class="st-chip st-${tone}">${esc(label)}</span>`;
const sourceLink = (source) => source?.url ? `<a href="${esc(safeUrl(source.url))}" target="_blank" rel="noopener noreferrer">${esc(source.label)}</a>` : esc(source?.label || "");
const signed = (value) => `${value >= 0 ? "+" : ""}${fmt(value, 0)}%`;

function situationCard(t) {
  const s = t.situation;
  return `<section class="card span-12 situation"><div class="card-header"><div><h2 class="card-title">Situation: day ${s.day} of the Strait of Hormuz disruption</h2><p class="card-subtitle">Since ${esc(s.startLabel)}. The single largest risk to UAE food supply today; the alerts below are read against it.</p></div>${toneChip(LEVEL.critical)}</div>
    <div class="card-body"><div class="kpi-strip">${s.kpis.map((kpi) => `<div class="kpi-tile"><span>${esc(kpi.label)}</span><strong>${esc(kpi.value)}</strong><small>${kpi.source ? sourceLink(kpi.source) : esc(kpi.period)}${kpi.source ? ` · ${esc(kpi.period)}` : ""}${kpi.computed ? " · computed" : ""}</small></div>`).join("")}</div></div></section>`;
}

function alertsSection(t) {
  return `<section class="card span-12" id="alerts"><div class="card-header"><div><h2 class="card-title">Supplier-risk alerts</h2><p class="card-subtitle">Events in supplier countries and world markets, matched to how much the UAE depends on each origin. Every fact links to its source; exposure and price signals are computed.</p></div></div>
    <div class="card-body"><div class="alert-list">${t.alerts.map(alertCard).join("")}</div>
    <p class="method"><strong>Levels.</strong> Critical and high need a response now; watch means monitor; clear means checked with no current restriction found. Price signals compare the latest World Bank month with ${esc(t.alerts.find((a) => a.price)?.price.baselineLabel || "the month before the crisis")}, three months and a year earlier; an alert is never rated below its price signal.</p></div></section>`;
}
function alertCard(alert) {
  const refs = Object.fromEntries(alert.sources.map((source, i) => [source.key, i + 1]));
  const suppliers = alert.exposure.map((e) => `<div class="supplier-bar" role="img" aria-label="${esc(e.name)} import origins ${esc(e.year)}">${e.leading.map((item, i) => `<i style="width:${item.share}%;background:${i === 0 ? "#19455f" : ["#5f90b8", "#8fb3cf", "#b7cfe1"][i - 1]}" title="${esc(item.partner)} ${fmt(item.share, 0)}%"></i>`).join("")}</div><p class="supplier-legend">${esc(e.name)} imports ${esc(e.year)}: ${e.leading.map((item) => `${esc(item.partner)} ${fmt(item.share, 0)}%`).join(" · ")}</p>`).join("");
  const price = alert.price ? `<div class="price-tiles"><div><span>Since ${esc(alert.price.baselineLabel)}</span><strong>${signed(alert.price.sinceBaseline)}</strong></div><div><span>3 months</span><strong>${signed(alert.price.threeMonth)}</strong></div><div><span>12 months</span><strong>${signed(alert.price.twelveMonth)}</strong></div></div>` : "";
  return `<article class="alert-card alert-${alert.level}"><header>${toneChip(LEVEL[alert.level])}<h3>${esc(alert.title)}</h3></header>
    <div class="alert-grid"><div>
      <h4>What happened</h4><ul class="fact-list">${alert.facts.map((fact) => `<li>${esc(fact.text)} <sup>${fact.src.map((key) => `<a href="#src-${esc(alert.id)}-${refs[key]}">${refs[key]}</a>`).join(",")}</sup></li>`).join("")}</ul>
      <h4>UAE exposure</h4>${alert.exposureText.map((text) => `<p>${esc(text)}</p>`).join("")}${suppliers}${price}
    </div><div class="alert-action">
      <h4>Suggested response (draft)</h4><p>${esc(alert.response)}</p>
      <h4>Indicator to watch</h4><p class="watch">${esc(alert.watch)}</p>
      <ol class="src-mini">${alert.sources.map((source, i) => `<li id="src-${esc(alert.id)}-${i + 1}">${sourceLink(source)} <span class="src-type">${esc(source.type)}</span></li>`).join("")}</ol>
    </div></div></article>`;
}

function briefSection(t) {
  return `<section class="card span-12" id="brief"><div class="card-header"><div><h2 class="card-title">Decision brief</h2><p class="card-subtitle">One to two pages for officials and FAO meetings. Draft for analyst review.</p></div><div class="brief-actions"><button class="button button-primary" id="brief-word" type="button">Download Word</button><button class="button button-outline" id="brief-print" type="button">Print / PDF</button></div></div>
    <div class="card-body"><article class="brief-doc"><h3>${esc(t.brief.title)}</h3><p class="brief-sub">${esc(t.brief.subtitle)}</p>${t.brief.sections.map((section, i) => `<h4>${i + 1}. ${esc(section.title)}</h4>${section.blocks.map((block) => block.type === "list" ? `<ul>${block.items.map((item) => `<li>${partsHtml(item, t.brief)}</li>`).join("")}</ul>` : `<p>${partsHtml(block.parts, t.brief)}</p>`).join("")}`).join("")}<p class="brief-note">${t.brief.annexNote.map(esc).join(" ")}</p></article></div></section>`;
}
function partsHtml(parts, brief) {
  return parts.map((part) => { if (typeof part === "string") return esc(part); const record = brief.annex.find((row) => row.id === part.cite); return record ? `“<a href="${esc(safeUrl(record.source))}" target="_blank" rel="noopener noreferrer">${esc(record.title)}</a>” (${esc(day(record.date))})` : ""; }).join("");
}
async function downloadBrief(brief) {
  try {
    const { buildDocx } = window.PilotDocx || await import("../docx.js");
    const report = { ...brief, partial: false, cited: new Map(brief.annex.map((row) => [row.id, row])) };
    const blob = new Blob([buildDocx(report)], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `uae-food-security-decision-brief-${brief.date}.docx` });
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  } catch (error) { alert(`The Word file could not be created: ${error.message}`); }
}

const STAGES = [["preparatory", "Preparatory", "#dbe7f0"], ["announced", "Announced", "#b7cfe1"], ["adopted", "Agreed or adopted", "#8fb3cf"], ["financed", "Financed", "#5f90b8"], ["operational", "Operational", "#2f6b9e"], ["results", "Results reported", "#133f63"]];
function commitmentsSection(t) {
  return `<section class="card span-12" id="commitments"><div class="card-header"><div><h2 class="card-title">Commitments: from announcement to delivery</h2><p class="card-subtitle">Each commitment with the measures that implement it, sorted by how far they have moved: from preparatory activity and announcements to agreements, financing, operations and reported results.</p></div></div>
    <div class="card-body"><div class="st-legend">${STAGES.map(([, label, color]) => `<span><i style="background:${color}"></i>${esc(label)}</span>`).join("")}</div>
    <div class="commit-list">${t.commitments.map((c) => {
      const total = Object.values(c.stages).reduce((sum, value) => sum + value, 0) || 1;
      return `<article class="commit"><div class="commit-head"><div><h3>${esc(c.name)}</h3><p class="reg-level"><span class="ver ver-${c.verification}">${VERIFY_LABEL[c.verification]}</span> ${esc(c.basis)}</p></div>${toneChip(COMMIT[c.status])}</div>
        <div class="stage-bar" role="img" aria-label="${esc(c.name)}: ${STAGES.map(([id, label]) => `${label} ${c.stages[id]}`).join(", ")}">${STAGES.map(([id, label, color]) => c.stages[id] ? `<i style="width:${(c.stages[id] / total * 100).toFixed(1)}%;background:${color}" title="${esc(label)}: ${c.stages[id]}"></i>` : "").join("")}</div>
        <p class="commit-status">${esc(c.statusText)}${c.followThrough !== null && c.measures >= 5 ? ` ${fmt(c.followThrough, 0)}% of the ${c.measures} related measures since ${esc(day(c.since))} went beyond an announcement.` : ""}</p>
        ${c.latestDelivery ? `<p class="commit-latest"><strong>Latest delivery:</strong> <a href="${esc(safeUrl(c.latestDelivery.source))}" target="_blank" rel="noopener noreferrer">${esc(c.latestDelivery.title)}</a> <small>${esc(day(c.latestDelivery.date))} · ${esc(c.latestDelivery.stage)}</small></p>` : ""}
        ${c.outsideEvidence.map((item) => `<p class="commit-latest"><strong>Outside the record:</strong> ${esc(item.text)} <small>${sourceLink(item.source)}</small></p>`).join("")}
      </article>`; }).join("")}</div>
    <p class="method"><strong>Method.</strong> Measures are matched to each commitment from their wording and staged by keywords (for example "inaugurated" = operational, "approved" or "signed" = agreed or adopted). Statements of intent ("will", "plans to", a memorandum "to explore") never count as operations or results. Indicative: an analyst should review the matches.</p></div></section>`;
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
