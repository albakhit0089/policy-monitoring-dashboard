// Prints a generated brief as plain text, for reviewing the narrative engine.
// node scripts/preview-brief.mjs monthly [all|Country] [YYYY-MM]
// node scripts/preview-brief.mjs country <Country> [last12|YYYY|all]
// node scripts/preview-brief.mjs event <event-id>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { buildBrief, toText } = await import(pathToFileURL(path.join(root, "narrative.js")).href);
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const records = read("data/gcc-yemen-measures.json").records;
const food = read("data/food-indicators.json");
const events = read("data/events.json").events;
const [kind = "monthly", a, b] = process.argv.slice(2);
const scope = kind === "monthly" ? { kind, country: a || "all", month: b } : kind === "event" ? { kind, event: a } : { kind, country: a || "all", period: b || "last12" };
const report = buildBrief({ records, food, events, scope });
console.log(`${report.title} — ${report.subtitle}\n`);
console.log(toText(report));
console.log(`\nAnnex: ${report.annex.length} measures referenced.`);
