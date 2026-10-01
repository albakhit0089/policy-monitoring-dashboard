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

const REGION = new Set(COUNTRIES);
const searchableText = (record) => [record.country, record.title, record.description, record.typeLabel, record.family, record.group, record.domain, record.institution].join(" ").toLocaleLowerCase();

export async function loadRegionalData() {
  const response = await fetch(DATA_URL, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Data request failed (${response.status})`);
  const payload = await response.json();
  const records = (payload.records || []).filter((record) => REGION.has(record.country));
  if (records.length !== payload.recordCount) {
    console.warn(`Regional allowlist retained ${records.length} of ${payload.recordCount} records.`);
  }
  return records;
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
