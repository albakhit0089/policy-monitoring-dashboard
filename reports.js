// Reports page: narrative technical briefs from the deterministic engine (narrative.js), with Word, PDF,
// Markdown and text exports, a shareable link, and an optional AI-assisted draft when an endpoint is configured.
import { buildBrief, COUNTRIES, toHtml, toMarkdown, toText } from "./narrative.js?v=pi-20261115";
import { buildDocx } from "./docx.js?v=pi-20261115";
import { loadEvents } from "./data-service.js?v=pi-20261115";

export const REPORT_TYPES = {
  monthly: "Monthly policy briefing",
  country: "Country policy brief",
  regional: "Regional policy analysis",
  event: "Event brief",
};
const FIELDS = { monthly: ["month", "country"], country: ["country", "period"], regional: ["period"], event: ["event"] };
const $ = (selector) => document.querySelector(selector);
const monthName = (key) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
// The AI draft is offered only when index.html names an endpoint (empty on GitHub Pages).
const aiEndpoint = () => document.querySelector('meta[name="pi-ai-endpoint"]')?.content?.trim() || "";

export function reportScopeFromHash() {
  const query = location.hash.split("?")[1];
  if (!query) return null;
  const params = Object.fromEntries(new URLSearchParams(query));
  return REPORT_TYPES[params.type] ? params : null;
}

export async function renderReportsPage(ui, food) {
  const { state, escapeHtml } = ui;
  const events = await loadEvents().catch(() => []);
  const months = [...new Set(state.records.map((record) => record.date?.slice(0, 7)).filter(Boolean))].sort().reverse();
  const partial = ui.partialMonth();
  const years = [...new Set(state.records.map((record) => record.year).filter(Boolean))].sort((a, b) => b - a);
  // Defaults: the latest complete month; a link (#reports?type=...) or an earlier choice overrides them.
  state.report = { type: "monthly", country: "all", month: months.find((key) => key !== partial) || months[0], period: "last12", event: events[0]?.id, ...state.report, ...(reportScopeFromHash() || {}) };
  const r = state.report;
  if (!REPORT_TYPES[r.type]) r.type = "monthly";
  const option = (value, label, selected) => `<option value="${escapeHtml(value)}" ${selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
  $("#page-content").innerHTML = `${ui.heading("Reports", "Narrative technical briefs drawn from the policy record and FAOSTAT indicators. Every measure cited links to its source; download a brief in Word, PDF or Markdown.", "REPORTING & EXPORT")}
  <div class="content-grid">
    <section class="card span-12 report-builder"><div class="card-header"><div><h2 class="card-title">Brief builder</h2><p class="card-subtitle" id="report-scope-label"></p></div></div><div class="card-body">
      <div class="report-form report-form-wide">
        <label>Brief type<select id="report-type">${Object.entries(REPORT_TYPES).map(([key, label]) => option(key, label, r.type === key)).join("")}</select></label>
        <label data-field="month">Month<select id="report-month">${months.map((key) => option(key, `${monthName(key)}${key === partial ? " (partial)" : ""}`, r.month === key)).join("")}</select></label>
        <label data-field="country">Country<select id="report-country"><option value="all">All countries</option>${COUNTRIES.map((country) => option(country, country, r.country === country)).join("")}</select></label>
        <label data-field="period">Period<select id="report-period">${[["last12", "Last 12 months"], ...years.map((year) => [String(year), String(year)]), ["all", "Whole record"]].map(([value, label]) => option(value, label, r.period === value)).join("")}</select></label>
        <label data-field="event">Event<select id="report-event">${events.length ? events.map((event) => option(event.id, event.name, r.event === event.id)).join("") : '<option value="">No events defined</option>'}</select></label>
      </div>
      <div class="report-actions">
        <button class="button button-primary" id="word-brief" type="button">${ui.icon("file-text")}Word (.docx)</button>
        <button class="button button-outline" id="print-report" type="button">${ui.icon("printer")}Print / Save PDF</button>
        <button class="button button-outline" id="md-brief" type="button">${ui.icon("file-code")}Markdown</button>
        <button class="button button-outline" id="copy-brief" type="button">${ui.icon("copy")}Copy text</button>
        <button class="button button-outline" id="copy-link" type="button">${ui.icon("link")}Copy link</button>
        ${aiEndpoint() ? `<button class="button button-outline" id="ai-draft" type="button">${ui.icon("sparkles")}Draft with AI</button>` : ""}
      </div>
    </div></section>
    <section class="card span-12"><div class="card-body"><div id="ai-draft-panel" hidden></div><article class="generated-report" id="generated-report" aria-live="polite"></article></div></section>
  </div>`;
  const read = () => { r.type = $("#report-type").value; r.month = $("#report-month").value; r.country = $("#report-country").value; r.period = $("#report-period").value; r.event = $("#report-event").value; };
  document.querySelectorAll(".report-form select").forEach((control) => control.addEventListener("change", () => { read(); generate(ui, food, events); }));
  $("#print-report").addEventListener("click", () => { document.body.classList.add("printing-report"); window.print(); setTimeout(() => document.body.classList.remove("printing-report"), 500); });
  $("#word-brief").addEventListener("click", () => ui.downloadBlob(new Blob([buildDocx(state.currentReport)], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), `${slug(state.currentReport)}.docx`));
  $("#md-brief").addEventListener("click", () => ui.downloadBlob(new Blob([toMarkdown(state.currentReport)], { type: "text/markdown;charset=utf-8" }), `${slug(state.currentReport)}.md`));
  $("#copy-brief").addEventListener("click", () => copy(ui, `${state.currentReport.title}: ${state.currentReport.subtitle}\n\n${toText(state.currentReport)}`, "Brief copied."));
  $("#copy-link").addEventListener("click", () => copy(ui, shareLink(r), "Link copied. It opens this brief with the same scope."));
  $("#ai-draft")?.addEventListener("click", () => draftWithAi(ui));
  generate(ui, food, events);
  ui.refreshIcons();
}

function generate(ui, food, events) {
  const r = ui.state.report;
  document.querySelectorAll(".report-form [data-field]").forEach((label) => { label.hidden = !FIELDS[r.type].includes(label.dataset.field); });
  // A country brief needs one country.
  const all = $("#report-country option[value='all']");
  all.hidden = all.disabled = r.type === "country";
  if (r.type === "country" && r.country === "all") { r.country = "Saudi Arabia"; $("#report-country").value = r.country; }
  const scope = { kind: r.type, country: r.type === "regional" || r.type === "event" ? "all" : r.country, month: r.month, period: r.period, event: r.event };
  const target = $("#generated-report");
  $("#ai-draft-panel").hidden = true;
  try {
    const report = buildBrief({ records: ui.state.records, food, events, scope });
    ui.state.currentReport = report;
    $("#report-scope-label").textContent = `${report.title}: ${report.subtitle}`;
    target.innerHTML = toHtml(report);
  } catch (error) {
    target.innerHTML = `<div class="empty-state"><h2>This brief could not be generated</h2><p>${ui.escapeHtml(error.message)}</p></div>`;
  }
  // Keep the address bar in step with the brief, so a reload or bookmark reopens it.
  history.replaceState(null, "", `#reports?${scopeParams(r)}`);
}

function scopeParams(r) {
  const params = new URLSearchParams({ type: r.type });
  FIELDS[r.type].forEach((field) => { if (r[field]) params.set(field, r[field]); });
  return params;
}
const shareLink = (r) => `${location.origin}${location.pathname}#reports?${scopeParams(r)}`;
function slug(report) { return `${report.title} ${report.subtitle}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90); }
async function copy(ui, text, message) { try { await navigator.clipboard.writeText(text); ui.showToast(message); } catch { ui.showToast("Clipboard access is unavailable.", "error"); } }

// Optional AI-assisted draft: only the engine's indicators and evidence ids are sent; the draft is shown
// separately, labelled for analyst review, with every cited id checked against the dataset.
async function draftWithAi(ui) {
  const report = ui.state.currentReport;
  const panel = $("#ai-draft-panel");
  panel.hidden = false;
  panel.innerHTML = `<div class="ai-draft"><strong>AI-assisted draft – for analyst review</strong><p class="muted">Drafting from ${report.evidenceIds.length} records and the computed indicators…</p></div>`;
  try {
    const response = await fetch(aiEndpoint(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "draft", scope: `${report.title}: ${report.subtitle}`, indicators: report.indicators, recordIds: report.evidenceIds }) });
    const body = await response.json();
    if (!response.ok || body.error) throw new Error(body.error || `Request failed (${response.status})`);
    const byId = new Map(ui.state.records.map((record) => [record.id, record]));
    const unknown = (body.cited || []).filter((id) => !byId.has(id));
    const html = ui.escapeHtml(body.draft).replace(/\[([a-f0-9]{16})\]/g, (match, id) => byId.has(id) && ui.safeUrl(byId.get(id).source) ? `<a href="${ui.escapeHtml(ui.safeUrl(byId.get(id).source))}" target="_blank" rel="noopener noreferrer" title="${ui.escapeHtml(byId.get(id).title)}">[source]</a>` : "").replace(/^#+\s*(.+)$/gm, "<h4>$1</h4>").replace(/\n{2,}/g, "</p><p>");
    panel.innerHTML = `<div class="ai-draft"><strong>${ui.escapeHtml(body.label)}</strong><p class="muted">Generated by ${ui.escapeHtml(body.model || "Claude")} from the cited records only.${body.removedCitations ? ` ${body.removedCitations} citation(s) to records outside the evidence were removed.` : ""}${unknown.length ? ` ${unknown.length} cited id(s) are not in this dataset.` : ""}${body.truncated ? " The draft was cut short." : ""}</p><div class="ai-draft-text"><p>${html}</p></div></div>`;
  } catch (error) {
    panel.innerHTML = `<div class="ai-draft"><strong>AI-assisted draft unavailable</strong><p>${ui.escapeHtml(error.message)}. The deterministic brief below is unaffected.</p></div>`;
  }
}
