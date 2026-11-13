export const DATA_URL = "./data/gcc-yemen-measures.json";
export const COUNTRIES = [
  "Bahrain",
  "Kuwait",
  "Oman",
  "Qatar",
  "Saudi Arabia",
  "United Arab Emirates",
  "Yemen",
];

export const SUMMARY_URL = "./data/gcc-yemen-summary.json";
const TYPE_LABELS = { decision: "Short-term policy decision", framework: "Long-term policy framework" };

const REGION = new Set(COUNTRIES);
const searchableText = (record) => [record.country, record.title, record.description || "", record.typeLabel, record.family, record.group, record.domain, record.institution].join(" ").toLocaleLowerCase();

async function fetchJson(url, label) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${label} request failed (${response.status})`);
  return response.json();
}

// Charts and filters start from the compact summary (no descriptions or source links).
// Records keep `description` undefined until loadFullRecords() has run.
export async function loadSummaryRecords() {
  const payload = await fetchJson(SUMMARY_URL, "Data");
  const at = Object.fromEntries(payload.columns.map((name, i) => [name, i]));
  const value = (row, field) => payload.dict[field] ? payload.dict[field][row[at[field]]] : row[at[field]];
  const records = payload.rows.map((row) => {
    const date = row[at.date] || null;
    const type = value(row, "type");
    const record = { id: row[at.id], type, typeLabel: TYPE_LABELS[type], family: value(row, "family"), group: value(row, "group"), domain: value(row, "domain"), domainCode: row[at.domainCode], country: value(row, "country"), date, year: date ? Number(date.slice(0, 4)) : null, title: row[at.title], institution: value(row, "institution") };
    if (row[at.institutionBranch]) record.institutionBranch = row[at.institutionBranch];
    if (row[at.tags]) record.tags = row[at.tags].split(" ");
    return record;
  }).filter((record) => REGION.has(record.country));
  if (records.length !== payload.recordCount) console.warn(`Regional allowlist retained ${records.length} of ${payload.recordCount} records.`);
  records.dataThrough = payload.dataThrough;
  return records;
}

// Adds description and source to the summary records, once.
let fullPromise = null;
export function loadFullRecords(records) {
  fullPromise ||= fetchJson(DATA_URL, "Policy records").then((payload) => {
    const byId = new Map(payload.records.map((record) => [record.id, record]));
    records.forEach((record) => {
      const full = byId.get(record.id);
      if (!full) return;
      record.description = full.description;
      record.source = full.source;
    });
    return records;
  }).catch((error) => { fullPromise = null; throw error; });
  return fullPromise;
}

export function filterRecords(records, filters = {}) {
  const keyword = (filters.keyword || "").trim().toLocaleLowerCase();
  return records.filter((record) => {
    if (filters.country && filters.country !== "all" && record.country !== filters.country) return false;
    if (filters.year && filters.year !== "all" && String(record.year) !== String(filters.year)) return false;
    if (filters.month && filters.month !== "all" && record.date?.slice(5, 7) !== String(filters.month).padStart(2, "0")) return false;
    if (filters.from && (!record.date || record.date < filters.from)) return false;
    if (filters.to && (!record.date || record.date > filters.to)) return false;
    if (filters.type && filters.type !== "all" && record.type !== filters.type) return false;
    if (filters.family && filters.family !== "all" && record.family !== filters.family) return false;
    if (filters.group && filters.group !== "all" && record.group !== filters.group) return false;
    if (filters.domain && filters.domain !== "all" && record.domain !== filters.domain) return false;
    if (filters.institution && filters.institution !== "all" && record.institution !== filters.institution) return false;
    if (keyword && !searchableText(record).includes(keyword)) return false;
    return true;
  });
}

export function getOptions(records) {
  const distinct = (key) => [...new Set(records.map((record) => record[key]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
  return {
    years: distinct("year").sort((a, b) => Number(b) - Number(a)),
    families: distinct("family"),
    groups: distinct("group"),
    domains: distinct("domain"),
    institutions: distinct("institution"),
  };
}

export function groupCount(records, keyFn) {
  const counts = new Map();
  records.forEach((record) => {
    const key = keyFn(record);
    if (key === null || key === undefined || key === "") return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

export function monthKey(record) {
  return record.date ? record.date.slice(0, 7) : null;
}

export const FOOD_DATA_URL = "./data/food-indicators.json";
let foodIndicatorsPromise = null;

export function loadFoodIndicators() {
  foodIndicatorsPromise ||= fetch(FOOD_DATA_URL, { cache: "no-cache" }).then((response) => {
    if (!response.ok) throw new Error(`Food indicator request failed (${response.status})`);
    return response.json();
  }).catch((error) => { foodIndicatorsPromise = null; throw error; });
  return foodIndicatorsPromise;
}

// Analyst-defined events (data/events.json): records are tagged by id or by workbook flag.
let eventsPromise = null;
export function loadEvents() {
  eventsPromise ||= fetch("./data/events.json", { cache: "no-cache" }).then((response) => {
    if (!response.ok) throw new Error(`Events request failed (${response.status})`);
    return response.json();
  }).then((payload) => payload.events || []).catch((error) => { eventsPromise = null; throw error; });
  return eventsPromise;
}
