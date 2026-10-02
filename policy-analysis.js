// Content analysis of policy records: classifies each measure's description into policy approaches
// so reports can describe what governments are doing, not only how many measures they recorded.

export const APPROACHES = [
  { key: "production", label: "Domestic production and investment", phrase: "expanding domestic production through farm projects, investment and new capacity", pattern: /\binvest|production capacity|new (farm|plant|factory|facility|project)|greenhouse|expansion of|expand(ing|ed)? (production|cultivation|capacity)|self-sufficien|local production|domestic production/i },
  { key: "technology", label: "Research, innovation and technology", phrase: "agricultural research, innovation and technology adoption", pattern: /research|innovat|technolog|digital|smart (farm|agri|irrig)|artificial intelligence|\bAI\b|new variet|seed|genetic|hydroponic|vertical farm|precision/i },
  { key: "water", label: "Water and irrigation", phrase: "water conservation, irrigation efficiency and alternative water sources", pattern: /water|irrigat|desalin|groundwater|aquifer|dam\b|rainwater/i },
  { key: "cooperation", label: "International agreements and cooperation", phrase: "international agreements, memoranda of understanding and partnerships", pattern: /agreement|memorandum|\bMoU\b|bilateral|partnership with|cooperation (with|between|agreement)|signed/i },
  { key: "supply", label: "Supply security and strategic reserves", phrase: "securing food supply through strategic reserves, storage and supply chains", pattern: /strategic (reserve|stock|food)|food reserve|storage|silo|supply chain|stockpil|food security system|supply of (wheat|rice|food)|ensure (food )?supply/i },
  { key: "trade", label: "Trade and import measures", phrase: "trade measures such as import rules, export facilitation and customs controls", pattern: /\bimport|\bexport|tariff|customs|quota|re-export|trade (facilitation|agreement|exchange)/i },
  { key: "markets", label: "Markets, prices and consumer protection", phrase: "market regulation, price monitoring and consumer protection", pattern: /\bprice|consumer protection|market (regulation|monitoring|stability)|farmers'? market|retail|cost of living|inflation|anti-monopol|fair trad/i },
  { key: "finance", label: "Subsidies, credit and financial support", phrase: "subsidies, concessional credit and financial support to producers", pattern: /subsid|\bloan|credit|financing|financial support|grant(s|ed)? |incentive|compensat|insurance|fund(ing)? (for|to|of)/i },
  { key: "climate", label: "Climate, environment and natural resources", phrase: "climate adaptation, environmental protection and natural resource management", pattern: /climate|emission|desertif|afforest|mangrove|biodivers|land degradation|rangeland|environmental protection|carbon|renewable energy|solar|tree planting|reforest/i },
  { key: "safety", label: "Food safety and standards", phrase: "food safety inspection, standards and certification", pattern: /food safety|inspect|standard|certif|halal|contamin|recall|laborator|pesticide residue|traceab/i },
  { key: "livestock", label: "Livestock and animal health", phrase: "livestock development and animal health", pattern: /livestock|poultry|camel|sheep|goat|cattle|veterin|animal (health|disease|feed)|vaccin|fodder|feed\b/i },
  { key: "fisheries", label: "Fisheries and aquaculture", phrase: "fisheries management and aquaculture development", pattern: /fish|aquacult|shrimp|marine|seafood/i },
  { key: "capacity", label: "Training, extension and awareness", phrase: "training, extension services and public awareness", pattern: /training|workshop|capacity[- ]building|extension service|awareness|campaign|educat/i },
  { key: "social", label: "Nutrition, food assistance and social protection", phrase: "nutrition, food assistance and support to vulnerable households", pattern: /nutrition|school (meal|feeding)|social protection|vulnerable|humanitarian|food (aid|assistance|basket)|cash (transfer|assistance)|malnutrition|poor families|low-income/i },
  { key: "governance", label: "Laws, strategies and institutions", phrase: "laws, national strategies and institutional reform", pattern: /\blaw\b|decree|regulation|resolution|legislat|national strategy|strategic plan|policy framework|establish(ed|ment of)? (a|the) (new )?(authority|council|centre|center|committee)/i },
];
// Domain/group wording that confirms a measure really belongs to an approach (used to pick good examples).
const DOMAIN_HINTS = {
  production: /production|productive|investment|value chain|processing|farm/i, technology: /research|technolog|innovation/i, water: /water|irrigation/i,
  cooperation: /cooperation|agreement|partnership|international|regional/i, supply: /reserve|stock|storage|supply|procurement|market management/i,
  trade: /trade|import|export|tariff/i, markets: /market|price|consumer/i, finance: /credit|financ|subsid|input|support to/i,
  climate: /climate|ecosystem|habitat|natural resource|environment|biodiversity/i, safety: /safety|standard|quality/i,
  livestock: /livestock|animal|veterinar/i, fisheries: /fish|aquaculture/i, capacity: /training|extension|capacity|technical assistance/i,
  social: /social|nutrition|health|assistance|feeding/i, governance: /institution|legal|legislat|regulat|strateg|planning|governance/i,
};
const FOOD_TERMS = /agri|farm|food|crop|harvest|livestock|fish|irrigat|date palm|wheat|seed|poultry|dairy|fodder|vegetable|fruit|grain|nutrition|cultivat/gi;
// Institution names whose words would otherwise trigger themes (e.g. Oman's "Ministry of Agriculture, Fisheries and Water
// Resources" is not evidence that a measure concerns fisheries or water).
const INSTITUTION_NAMES = [
  /(?:Ministry|Directorate(?: General)?) of Agricultur\w*(?: Wealth)?,? Fisheries(?: Wealth)?,?(?: and)? Water Resources?/gi,
  /Ministry of Agricultur\w*,? Irrigation,? and Fisheries/gi,
  /Ministry of Agricultur\w* and (?:Irrigation|Fisheries)/gi,
  /Ministry of Environment,? Water,? and Agriculture/gi,
  /Ministry of (?:Climate Change and Environment|Environment and Climate Change)/gi,
  /Ministry of Municipalit(?:y|ies)(?: Affairs)? and (?:Environment|Agriculture)/gi,
  /Abu Dhabi Agriculture and Food Safety Authority/gi,
  /Public Authority (?:for|of) Agricultur\w* Affairs and Fish(?:eries)? Resources/gi,
  /Ministry of (?:Water and Electricity|Energy and Water|Energy and Infrastructure)/gi,
];
const clean = (text) => INSTITUTION_NAMES.reduce((value, pattern) => value.replace(pattern, "the ministry"), String(text || ""));
const BY_KEY = Object.fromEntries(APPROACHES.map((approach) => [approach.key, approach]));
const cache = new WeakMap();
const DAY = 86400000;
const time = (record) => new Date(`${record.date}T00:00:00Z`).getTime();

export function approachesOf(record) {
  if (!cache.has(record)) { const text = clean(record.description); cache.set(record, APPROACHES.filter((approach) => approach.pattern.test(text)).map((approach) => approach.key)); }
  return cache.get(record);
}
export const approachLabel = (key) => BY_KEY[key]?.label || key;
export const approachPhrase = (key) => BY_KEY[key]?.phrase || key;

// Share of records touching each approach (a record can touch several).
export function approachProfile(records) {
  const total = records.length || 1;
  return APPROACHES.map((approach) => {
    const rows = records.filter((record) => approachesOf(record).includes(approach.key));
    return { key: approach.key, label: approach.label, count: rows.length, share: rows.length / total, countries: new Set(rows.map((record) => record.country)).size, rows };
  }).sort((a, b) => b.count - a.count);
}

// Approaches a subset emphasises more than the comparison set (ratio of shares).
export function distinctiveApproaches(subset, comparison, { minCount = 5, minRatio = 1.3 } = {}) {
  const base = Object.fromEntries(approachProfile(comparison).map((row) => [row.key, row.share]));
  return approachProfile(subset).filter((row) => row.count >= minCount && base[row.key] > 0 && row.share / base[row.key] >= minRatio).map((row) => ({ ...row, ratio: row.share / base[row.key] })).sort((a, b) => b.ratio - a.ratio);
}

// Change in each approach's share between the latest 12 months and the 12 months before.
export function approachShifts(records) {
  const dated = records.filter((record) => record.date);
  if (!dated.length) return [];
  const end = Math.max(...dated.map(time));
  const recent = dated.filter((record) => time(record) > end - 365 * DAY);
  const previous = dated.filter((record) => time(record) <= end - 365 * DAY && time(record) > end - 730 * DAY);
  if (recent.length < 20 || previous.length < 20) return [];
  const attention = (rows) => { const counts = {}; let total = 0; rows.forEach((record) => approachesOf(record).forEach((key) => { counts[key] = (counts[key] || 0) + 1; total += 1; })); return Object.fromEntries(APPROACHES.map((approach) => [approach.key, total ? (counts[approach.key] || 0) / total : 0])); };
  const now = attention(recent), before = attention(previous);
  return APPROACHES.map((approach) => ({ key: approach.key, label: approach.label, recentShare: now[approach.key], previousShare: before[approach.key], points: (now[approach.key] - before[approach.key]) * 100 })).sort((a, b) => b.points - a.points);
}

// Representative measures: long-term frameworks first, then the most recent, spread across countries.
function strength(record, key) {
  if (!key) return 1;
  const pattern = new RegExp(BY_KEY[key].pattern.source, "gi");
  return (clean(record.description).match(pattern) || []).length;
}
export function examples(records, key, count = 2) {
  const rows = records.filter((record) => record.date && (!key || approachesOf(record).includes(key)))
    .map((record) => {
      const food = Math.min((record.description.match(FOOD_TERMS) || []).length, 3);
      const domainFit = key && DOMAIN_HINTS[key]?.test(`${record.domain} ${record.group}`) ? 3 : 0;
      return { record, food, score: Math.min(strength(record, key), 3) + (record.type === "framework" ? 2 : 0) + domainFit + food };
    })
    .filter((entry, _, all) => entry.food > 0 || !all.some((other) => other.food > 0))
    .sort((a, b) => b.score - a.score || b.record.date.localeCompare(a.record.date)).map((entry) => entry.record);
  const picked = [];
  const seen = new Set();
  for (const row of rows) { if (seen.has(row.country) && rows.some((other) => !seen.has(other.country) && !picked.includes(other))) continue; picked.push(row); seen.add(row.country); if (picked.length === count) break; }
  return picked;
}
