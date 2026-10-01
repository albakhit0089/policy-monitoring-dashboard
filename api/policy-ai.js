import { readFile } from "node:fs/promises";
import path from "node:path";

const COUNTRIES = new Set(["Bahrain", "Kuwait", "Oman", "Qatar", "Saudi Arabia", "United Arab Emirates", "Yemen"]);
const OUTSIDE_COUNTRIES = ["Algeria", "Egypt", "Iraq", "Jordan", "Lebanon", "Libya", "Mauritania", "Morocco", "Palestine", "Sudan", "Syrian Arab Republic", "Syria", "Tunisia"];
const MAX_BODY = 16_000;
const MAX_CANDIDATES = 10;
const STOP_WORDS = new Set(["what", "which", "were", "was", "the", "and", "for", "with", "from", "about", "into", "that", "this", "their", "they", "have", "has", "does", "did", "how", "when", "where", "compare", "summarise", "summarize", "please", "policy", "policies", "measures", "measure"]);
const SYNONYMS = {
  resilience: ["reserves", "storage", "supply", "logistics", "imports", "availability", "procurement"],
  reserve: ["stocks", "storage", "reserve", "availability"],
  water: ["irrigation", "desalination", "water", "drought"],
  wheat: ["cereal", "grain", "flour", "wheat"],
  fisheries: ["fish", "aquaculture", "fisheries"],
  trade: ["export", "import", "customs", "trade"],
  climate: ["drought", "adaptation", "renewable", "climate"],
  technology: ["digital", "innovation", "research", "technology"],
  nutrition: ["food security", "nutrition", "diet", "school feeding"],
  الامارات: ["united", "arab", "emirates"],
  الإمارات: ["united", "arab", "emirates"],
  السعودية: ["saudi", "arabia"],
  عمان: ["oman"],
  قطر: ["qatar"],
  البحرين: ["bahrain"],
  الكويت: ["kuwait"],
  اليمن: ["yemen"],
  ماء: ["water", "irrigation", "desalination"],
  المياه: ["water", "irrigation", "desalination"],
  الغذاء: ["food", "security", "nutrition", "reserves"],
  الزراعة: ["agriculture", "farming", "crops"],
  التجارة: ["trade", "imports", "exports"],
};
let cachedRecords;

function tokenize(text) {
  return String(text || "").toLocaleLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}
function applyRecordFilters(records, filters = {}) {
  return records.filter((record) => {
    if (filters.country && filters.country !== "all" && (!COUNTRIES.has(filters.country) || record.country !== filters.country)) return false;
    if (filters.year && filters.year !== "all" && String(record.year) !== String(filters.year)) return false;
    if (filters.month && filters.month !== "all" && record.date?.slice(5, 7) !== String(filters.month).padStart(2, "0")) return false;
    if (filters.type && filters.type !== "all" && record.type !== filters.type) return false;
    if (filters.family && filters.family !== "all" && record.family !== filters.family) return false;
    if (filters.group && filters.group !== "all" && record.group !== filters.group) return false;
    if (filters.domain && filters.domain !== "all" && record.domain !== filters.domain) return false;
    if (filters.institution && filters.institution !== "all" && record.institution !== filters.institution) return false;
    if (filters.from && (!record.date || record.date < filters.from)) return false;
    if (filters.to && (!record.date || record.date > filters.to)) return false;
    return true;
  });
}
function retrieve(question, records, filters) {
  const baseTerms = tokenize(question);
  const terms = [...new Set(baseTerms.flatMap((term) => [term, ...(SYNONYMS[term] || [])]))];
  const candidates = applyRecordFilters(records, filters);
  return candidates.map((record) => {
    const titleTerms = new Set(tokenize(record.title));
    const domainTerms = new Set(tokenize(`${record.domain} ${record.group} ${record.family}`));
    const bodyTerms = new Set(tokenize(`${record.description} ${record.institution}`));
    const score = terms.reduce((sum, term) => sum + (titleTerms.has(term) ? 4 : domainTerms.has(term) ? 3 : bodyTerms.has(term) ? 1 : 0), 0);
    return { record, score };
  }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score || String(b.record.date || "").localeCompare(String(a.record.date || ""))).slice(0, MAX_CANDIDATES).map((entry) => entry.record);
}
function sourceRecord(record) {
  return { id: record.id, country: record.country, date: record.date, title: record.title, domain: record.domain, institution: record.institution, source: record.source };
}
async function getRecords() {
  if (!cachedRecords) {
    const dataPath = path.join(process.cwd(), "data", "gcc-yemen-measures.json");
    const payload = JSON.parse(await readFile(dataPath, "utf8"));
    cachedRecords = (payload.records || []).filter((record) => COUNTRIES.has(record.country));
  }
  return cachedRecords;
}
function response(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8").send(JSON.stringify(body));
}
async function pipeResponseStream(upstream, res, evidence, permittedIds) {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.write(`event: sources\ndata: ${JSON.stringify(evidence.map(sourceRecord))}\n\n`);
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let answer = "";
  const consume = (block) => {
    const data = block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
    if (!data || data === "[DONE]") return;
    try {
      const event = JSON.parse(data);
      if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
        const safeDelta = event.delta.replace(/\[([a-f0-9]{16})\]/gi, (citation, id) => permittedIds.has(id) ? citation : "");
        answer += safeDelta;
        res.write(`event: delta\ndata: ${JSON.stringify({ text: safeDelta })}\n\n`);
      } else if (event.type === "response.failed" || event.type === "error") {
        res.write(`event: error\ndata: ${JSON.stringify({ error: "The policy analysis service ended unexpectedly." })}\n\n`);
      }
    } catch { /* Ignore non-JSON keepalive frames. */ }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value || new Uint8Array(), { stream: !done });
      const blocks = pending.split(/\r?\n\r?\n/);
      pending = blocks.pop() || "";
      blocks.forEach(consume);
      if (done) break;
    }
    if (pending.trim()) consume(pending);
    if (!answer) res.write(`event: error\ndata: ${JSON.stringify({ error: "The analysis service returned no answer." })}\n\n`);
    res.write("event: done\ndata: {}\n\n");
    res.end();
  } catch {
    res.write(`event: error\ndata: ${JSON.stringify({ error: "The response stream was interrupted." })}\n\n`);
    res.end();
  }
}

export default async function handler(req, res) {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || "https://albakhit0089.github.io,http://127.0.0.1:4173,http://localhost:4173").split(",").map((value) => value.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.includes(origin)) return response(res, 403, { error: "Origin not allowed." });
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return response(res, 405, { error: "Use POST for policy questions." });
  if (!process.env.OPENAI_API_KEY) return response(res, 503, { error: "Secure AI is not configured on this service." });
  let body = req.body;
  if (!body || typeof body !== "object") {
    let rawBody = "";
    for await (const chunk of req) {
      rawBody += chunk;
      if (rawBody.length > MAX_BODY) return response(res, 413, { error: "Question payload is too large." });
    }
    try { body = JSON.parse(rawBody || "{}"); } catch { return response(res, 400, { error: "Request must contain valid JSON." }); }
  }
  const question = String(body.question || "").trim();
  if (question.length < 3 || question.length > 2000) return response(res, 400, { error: "Question must be between 3 and 2,000 characters." });
  const outsideCountry = OUTSIDE_COUNTRIES.find((country) => new RegExp(`\\b${country}\\b`, "i").test(question));
  if (outsideCountry) return response(res, 200, { answer: `This dashboard covers GCC States and Yemen, so I can’t answer questions about ${outsideCountry}.`, sources: [] });
  const records = await getRecords();
  const sources = retrieve(question, records, body.filters || {});
  if (!sources.length) return response(res, 200, { answer: "I could not find supporting records for that question in the selected GCC States and Yemen dataset. Please adjust the filters or consult the original sources.", sources: [] });
  const evidence = sources.map((record) => ({ id: record.id, country: record.country, date: record.date, title: record.title, family: record.family, group: record.group, domain: record.domain, institution: record.institution, description: record.description, source: record.source }));
  const instructions = [
    "You are a policy research assistant for food and agriculture monitoring in GCC States and Yemen.",
    "Answer only from the supplied evidence records. Do not use external knowledge to add policy facts.",
    "If evidence is insufficient, explicitly say so. Never invent dates, institutions, statistics, sources, or record IDs.",
    "Cite claims using [record-id] markers matching the supplied IDs. Keep the answer concise and evidence-led.",
    "Respond in the language used in the question, including Arabic when the user asks in Arabic.",
    "Politely decline non-agriculture-policy questions and questions about countries outside Bahrain, Kuwait, Oman, Qatar, Saudi Arabia, United Arab Emirates, and Yemen.",
  ].join(" ");
  try {
    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4.1-mini", instructions, input: `Question:\n${question}\n\nRetrieved source records:\n${JSON.stringify(evidence)}`, max_output_tokens: 900, stream: body.stream === true }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!openAiResponse.ok) return response(res, 502, { error: "The policy analysis service is temporarily unavailable." });
    const permittedIds = new Set(evidence.map((record) => record.id));
    if (body.stream === true) return await pipeResponseStream(openAiResponse, res, evidence, permittedIds);
    const result = await openAiResponse.json();
    let answer = result.output_text || result.output?.flatMap((item) => item.content || []).map((part) => part.text || "").join("\n").trim();
    if (!answer) return response(res, 502, { error: "The analysis service returned no answer." });
    answer = answer.replace(/\[([a-f0-9]{16})\]/gi, (citation, id) => permittedIds.has(id) ? citation : "");
    if (!/\[[a-f0-9]{16}\]/i.test(answer)) answer += `\n\nSupporting records: ${evidence.map((record) => `[${record.id}]`).join(" ")}`;
    return response(res, 200, { answer, sources: evidence.map(sourceRecord) });
  } catch {
    return response(res, 502, { error: "The policy analysis request timed out or could not connect." });
  }
}
