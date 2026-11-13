// Tests for the narrative engine (narrative.js) and the Word export (docx.js), run over many real scopes:
// 1. no number in a brief is absent from the data (computed facts, cited records, or the brief's own dates);
// 2. every cited measure links to its original source and appears in the annex;
// 3. no brief opens with a count, and no key message is a count;
// 4. prose sentences stay short (under 25 words, excluding the quoted titles of cited measures);
// 5. the disclaimer is present in every export, and the .docx is a well-formed package.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (file) => import(pathToFileURL(path.join(root, file)).href);
const { buildBrief, toHtml, toMarkdown, toText, COUNTRIES } = await load("narrative.js");
const { buildDocx } = await load("docx.js");
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const records = read("data/gcc-yemen-measures.json").records;
const food = read("data/food-indicators.json");
const events = read("data/events.json").events;

const months = [...new Set(records.map((record) => record.date.slice(0, 7)))].sort().slice(-12);
const scopes = [
  ...months.flatMap((month) => ["all", ...COUNTRIES].map((country) => ({ kind: "monthly", country, month }))),
  ...COUNTRIES.map((country) => ({ kind: "country", country, period: "last12" })),
  ...["last12", "2025", "2024", "all"].map((period) => ({ kind: "regional", country: "all", period })),
  ...events.map((event) => ({ kind: "event", event: event.id })),
];
const DISCLAIMER = /summaries compiled for monitoring and analysis, not legal texts/;
const numbersIn = (text) => (String(text).match(/\d+(?:[.,]\d+)*/g) || []).map((token) => token.replace(/,/g, ""));
const failures = [];
let briefs = 0, sentences = 0, longSentences = 0;

for (const scope of scopes) {
  const label = JSON.stringify(scope);
  const report = buildBrief({ records, food, events, scope, today: "2026-11-13" });
  briefs += 1;
  const text = toText(report);
  const cited = [...report.cited.values()];

  // 1. Every number is traceable.
  const allowed = new Set([...report.facts, ...cited.flatMap((record) => [...numbersIn(record.title), ...numbersIn(record.date), String(Number(record.date.slice(8, 10)))]), ...report.sections.map((_, i) => String(i + 1))]);
  const stray = numbersIn(text).filter((token) => !allowed.has(token));
  if (stray.length) failures.push(`${label}: numbers not traceable to the data: ${[...new Set(stray)].join(", ")}`);

  // 2. Every cited measure links to its source and is in the annex.
  cited.forEach((record) => {
    if (!/^https?:\/\//.test(record.source || "")) failures.push(`${label}: cited record ${record.id} has no source URL`);
    if (!report.annex.some((row) => row.id === record.id && row.source === record.source)) failures.push(`${label}: cited record ${record.id} missing from the annex`);
  });
  const html = toHtml(report);
  const citeLinks = [...html.matchAll(/<a class="cite" href="([^"]*)"/g)].map((match) => match[1]);
  if (citeLinks.some((href) => !/^https?:\/\//.test(href))) failures.push(`${label}: an in-text citation has no link`);

  // 3. Not opening with a count.
  const firstMessage = toText({ ...report, sections: [report.sections[0]] }).split("\n")[1] || "";
  if (/^-?\s*(\d|(In|During)\s+\w+\s+\d{4},\s+\d+\s+(policy\s+)?measures)/.test(firstMessage) || /\bmeasures were recorded\b/.test(firstMessage) && !/No food or agriculture/.test(firstMessage)) failures.push(`${label}: opens with a count: ${firstMessage.slice(0, 90)}`);
  report.sections[0].blocks.flatMap((block) => block.items || [block.parts]).forEach((parts) => {
    const message = parts.filter((part) => typeof part === "string").join("").trim();
    if (/^\d/.test(message)) failures.push(`${label}: a key message starts with a number: ${message.slice(0, 80)}`);
  });

  // 4. Sentence length (prose only; quoted titles of cited measures are excluded).
  report.sections.forEach((section) => section.blocks.forEach((block) => (block.items || (block.parts ? [block.parts] : [])).forEach((parts) => {
    const prose = parts.map((part) => typeof part === "string" ? part : "CITED").join("");
    prose.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.trim()).forEach((sentence) => {
      sentences += 1;
      const words = sentence.replace(/\([^)]*\)/g, "").split(/\s+/).filter(Boolean).length;
      if (words > 25) { longSentences += 1; if (longSentences <= 5) console.warn(`  long sentence (${words} words) in ${scope.kind}: ${sentence.slice(0, 140)}`); }
    });
  })));

  // 5. Disclaimer and a valid Word package.
  if (!DISCLAIMER.test(html) || !DISCLAIMER.test(toMarkdown(report))) failures.push(`${label}: disclaimer missing`);
  const docx = buildDocx(report);
  assert.equal(String.fromCharCode(docx[0], docx[1]), "PK", `${label}: .docx is not a zip`);
  const asText = new TextDecoder().decode(docx);
  for (const part of ["[Content_Types].xml", "word/document.xml", "word/styles.xml", "word/_rels/document.xml.rels"]) assert.ok(asText.includes(part), `${label}: .docx lacks ${part}`);
  assert.ok(DISCLAIMER.test(asText), `${label}: .docx lacks the disclaimer`);
  assert.equal((asText.match(/TargetMode="External"/g) || []).length >= cited.length, true, `${label}: .docx is missing source hyperlinks`);
}

const longShare = longSentences / Math.max(1, sentences);
if (longShare > .05) failures.push(`${longSentences} of ${sentences} prose sentences exceed 25 words (${(longShare * 100).toFixed(1)}%; allowed 5%).`);
if (failures.length) {
  console.error(`Narrative tests failed (${failures.length}):`);
  failures.slice(0, 40).forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Narrative tests passed: ${briefs} briefs; every number traceable, every cited measure linked and in the annex, no count openings, ${sentences} prose sentences (${longSentences} over 25 words), disclaimer and .docx checked.`);
