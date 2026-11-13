'use strict';

// Deterministic clean-up rules shared by build-data.cjs and the tests:
// institution names, short titles and near-duplicate detection.

// ---------- institutions ----------
const COUNTRY_ADJECTIVES = /^(saudi arabian|saudi|omani|emirati|uae|qatari|kuwaiti|bahraini|bahrain's|yemeni|yemen's)\s+(?=(ministry|minister|environment|public|general|national|agricultur|water|municipal|authority))/i;
const COUNTRY_SUFFIX = /\s+(of|in)\s+(saudi arabia|the kingdom|oman|the sultanate of oman|the uae|the united arab emirates|qatar|kuwait|bahrain|yemen)$|\s*\((saudi arabia|oman|uae|qatar|kuwait|bahrain|yemen)\)$/i;

// Canonical names for the main bodies, matched on the cleaned lower-case name (acronyms removed).
const ALIASES = {
  'Saudi Arabia': [
    [/^(ministry|minister) of environment,? water,?( and| none)* agriculture$/, 'Ministry of Environment, Water and Agriculture (MEWA)'],
    [/estidamah|research and development (center|centre) for sustainable agriculture|(center|centre) for (research and development (of|for) )?sustainable agriculture( research and development)?/, 'National Research and Development Center for Sustainable Agriculture (Estidamah)'],
    [/saudi reef|reef saudi|sustainable (agricultural )?rural (agricultural )?development program/, 'Sustainable Agricultural Rural Development Program (Saudi Reef)'],
    [/^saudi agricultural and livestock investment company$/, 'Saudi Agricultural and Livestock Investment Company (SALIC)'],
    [/^saudi water partnerships? company$/, 'Saudi Water Partnership Company (SWPC)'],
    [/^saudi water authority$/, 'Saudi Water Authority (SWA)'],
    [/^national water company$/, 'National Water Company (NWC)'],
    [/^national water efficiency and conservation (center|centre)$/, 'National Water Efficiency and Conservation Center'],
    [/^(saudi )?agricultural development fund$/, 'Agricultural Development Fund (ADF)'],
    [/^dava agricultural( co\.?| company)?$/, 'Dava Agricultural Company'],
    [/^tabuk agricultural development (co\.?|company)$/, 'Tabuk Agricultural Development Company (TADCO)'],
    [/^national (center|centre) for palms and dates$/, 'National Center for Palms and Dates (NCPD)'],
  ],
  Oman: [
    [/^ministry of agricultur(e|al wealth),? fisheries( wealth)?,?( and)? water resources$/, 'Ministry of Agriculture, Fisheries and Water Resources (MAFWR)'],
    [/^environment authority$/, 'Environment Authority'],
  ],
  'United Arab Emirates': [
    [/^abu dhabi agriculture and food safety authority$/, 'Abu Dhabi Agriculture and Food Safety Authority (ADAFSA)'],
    [/^ministry of climate change and environment$/, 'Ministry of Climate Change and Environment (MOCCAE)'],
    [/^dubai electricity and water authority$/, 'Dubai Electricity and Water Authority (DEWA)'],
    [/^dubai environment and climate change authority$/, 'Dubai Environment and Climate Change Authority (DECCA)'],
  ],
  Qatar: [
    [/^ministry of municipality$/, 'Ministry of Municipality (MoM)'],
    [/^ministry of environment and climate change$/, 'Ministry of Environment and Climate Change (MECC)'],
    [/^ministry of commerce and industry$/, 'Ministry of Commerce and Industry (MoCI)'],
  ],
  Kuwait: [
    [/^public authority for agricultur(e|al) affairs and fish(eries)? resources$/, 'Public Authority for Agriculture Affairs and Fish Resources (PAAAFR)'],
    [/^public authority for food and nutrition$/, 'Public Authority for Food and Nutrition (PAFN)'],
  ],
  Bahrain: [
    [/^(ministry of )?municipalit(y|ies)( affairs)? and agriculture( affairs)?( minister)?$/, 'Ministry of Municipalities Affairs and Agriculture'],
  ],
  Yemen: [
    [/^ministry of agriculture,? fisheries,?( and)? water resources$/, 'Ministry of Agriculture, Fisheries and Water Resources'],
    [/^general (authority for the development of tihama|tihama development authority)$/, 'General Authority for the Development of Tihama'],
  ],
};

const titleCase = (text) => text.toLowerCase().replace(/\b([a-z])/g, (char) => char.toUpperCase()).replace(/\b(And|Of|The|For|In|On|At|To)\b/g, (word) => word.toLowerCase());

function cleanInstitution(raw) {
  let text = String(raw || '').replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/\s*&\s*/g, ' and ').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text === text.toUpperCase() && /[A-Z]{4}/.test(text)) text = titleCase(text);
  else text = text.replace(/\b(MINISTRY OF [A-Z ,]+)/g, (part) => titleCase(part));
  text = text.replace(/^(the|he)\s+/i, '').replace(COUNTRY_ADJECTIVES, '').replace(COUNTRY_SUFFIX, '').replace(/,\s+and\s+/g, ' and ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
// Matching key: lower case, acronyms in brackets and punctuation removed.
const keyOf = (name) => name.toLowerCase().replace(/\s*\([^)]*\)\s*/g, ' ').replace(/[^a-z0-9, ]/g, ' ').replace(/\s+/g, ' ').trim().replace(/,$/, '');

// Branch or unit of a larger body, e.g. "MEWA's Qassim branch" or "the Livestock Sector at the Ministry of ...".
function splitBranch(name) {
  let match = name.match(/^(.+?)(?:'s|\s+[–-])\s+(?:(.+?)\s+)?(?:region(?:al)?\s+)?branch(?:\s+(?:in|of)\s+(?:the\s+)?(.+?))?$/i)
    || name.match(/^(.+?)\s+branch\s+(?:in|of)\s+(?:the\s+)?(.+?)$/i);
  if (match) return { parent: match[1].trim(), branch: (match[2] || match[3] || 'Regional branch').replace(/\s+(region|governorate)$/i, '').trim() };
  match = name.match(/^(.+?)\s+[–-]\s+(.+(?:sector|branch|department|directorate))$/i);
  if (match) return { parent: match[1].trim(), branch: match[2].trim() };
  match = name.match(/^(?:the\s+)?(.+?(?:sector|department|directorate|unit))\s+at\s+(?:the\s+)?(ministry .+)$/i);
  if (match) return { parent: match[2].trim(), branch: match[1].trim() };
  return { parent: name, branch: '' };
}

function aliasFor(country, name) {
  const key = keyOf(name);
  return (ALIASES[country] || []).find(([pattern]) => pattern.test(key))?.[1] || null;
}

// Normalise every record's institution; returns { before, after } distinct counts (per country).
function normalizeInstitutions(records) {
  const distinct = (field) => new Set(records.map((record) => `${record.country}|${record[field] || ''}`)).size;
  records.forEach((record) => { if (!record.institutionSource) record.institutionSource = record.institution || ''; });
  const before = distinct('institutionSource');
  // First pass: clean, split branches, apply explicit aliases.
  records.forEach((record) => {
    const cleaned = cleanInstitution(record.institutionSource);
    const { parent, branch } = splitBranch(cleaned);
    const parentClean = cleanInstitution(parent);
    const alias = aliasFor(record.country, parentClean);
    // A branch is only split off when its parent is a known body; otherwise the full name is kept.
    record.institution = alias || (branch ? cleaned : parentClean);
    record.institutionBranch = alias && branch ? branch : '';
    if (!record.institutionBranch) delete record.institutionBranch;
  });
  // Second pass: merge remaining spelling variants that share a key, using the most frequent form.
  const groups = new Map();
  records.forEach((record) => {
    const key = `${record.country}|${keyOf(record.institution)}`;
    const forms = groups.get(key) || new Map();
    forms.set(record.institution, (forms.get(record.institution) || 0) + 1);
    groups.set(key, forms);
  });
  const canonical = new Map([...groups].map(([key, forms]) => [key, [...forms].sort((a, b) => (/\([A-Z]/.test(b[0]) - /\([A-Z]/.test(a[0])) || b[1] - a[1] || a[0].length - b[0].length)[0][0]]));
  records.forEach((record) => { record.institution = canonical.get(`${record.country}|${keyOf(record.institution)}`) || record.institution; });
  return { before, after: distinct('institution') };
}

// ---------- short titles ----------
// Acronyms used to shorten long institution names in titles.
const SHORT_NAMES = [
  [/(?:the )?(?:saudi )?ministry of environment,? water,? and agriculture(?: \(mewa\))?/gi, 'MEWA'],
  [/(?:the )?(?:omani )?ministry of agricultur(?:e|al wealth),? fisheries(?: wealth)?,? and water resources(?: \((?:mafwr|moafwr)\))?/gi, 'MAFWR'],
  [/(?:the )?abu dhabi agriculture and food safety authority(?: \(adafsa\))?/gi, 'ADAFSA'],
  [/(?:the )?(?:uae )?ministry of climate change and environment(?: \(moccae\))?/gi, 'MOCCAE'],
  [/(?:the )?public authority for agricultur(?:e|al) affairs and fish(?:eries)? resources(?: \(paaafr\))?/gi, 'PAAAFR'],
  [/(?:the )?public authority for food and nutrition(?: \(pafn\))?/gi, 'PAFN'],
  [/(?:the )?national research and development (?:center|centre) for sustainable agriculture(?: \(estidamah\))?/gi, 'Estidamah'],
  [/(?:the )?sustainable agricultural rural development program(?:me)?(?: \(saudi reef\))?/gi, 'Saudi Reef'],
];
const CLAUSE_BREAKS = /,\s*(?:which|who|aiming|aimed|as part of|in line with|in order|with the aim|with a view|targeting|including|in partnership|in collaboration|in cooperation|in coordination|under the|following|according to|bringing|marking|making|showcasing|reaching|providing|offering|enabling|allowing|creating|positioning|reflecting|supporting|highlighting|to support|to enhance|to strengthen|to boost|to promote|to improve|to ensure)\b|;|\s[–—]\s|\s+as part of\s|\s+in line with\s|\s+in order to\s|\s+with the aim\s|\s+aimed at\s|\s+aiming to\s/i;
const APPOSITIVE = /,\s+(?:known|located|hosted|where|which|who|one of|an?|the|in (?:direct )?(?:coordination|cooperation|partnership|collaboration) with|together with|alongside|represented by|operating|through|under|in|on|with|led by|organi[sz]ed by|supported by|funded by|backed by)\b[^,]{0,90},/i;
const TRAILING_STOP = /\s+(?:and|or|of|the|a|an|in|on|for|with|to|by|at|from|its|their|as|that|this|which|under|into|across|between|per|over)$/i;
const LEADING_FILLER = /^(?:on|in|during|as of|starting|from)\s+(?:\d{1,2}\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december)?\s*\d{0,4},?\s+/i;

function shortTitle(description, { maxWords = 12 } = {}) {
  let text = String(description || '').replace(/\s+/g, ' ').trim();
  text = (text.split(/(?<=[.!?])\s+(?=[A-Z])/u)[0] || text).replace(/[.!?]+$/, '');
  text = text.replace(LEADING_FILLER, '');
  SHORT_NAMES.forEach(([pattern, short]) => { text = text.replace(pattern, short); });
  text = text.replace(/\s*\([^)]{1,40}\)/g, '');
  // Drop comma-enclosed asides ("X, in coordination with Y, has ...") so actor, action and object stay together.
  for (let guard = 0; guard < 3 && text.split(' ').length > maxWords; guard += 1) {
    const match = text.match(APPOSITIVE);
    // Only an aside followed by a lower-case verb ("..., has signed") is removed; otherwise the comma is a list.
    if (!match || !/^\s*[a-z]/.test(text.slice(match.index + match[0].length))) break;
    const next = text.slice(0, match.index) + ' ' + text.slice(match.index + match[0].length);
    text = next.replace(/\s+/g, ' ');
  }
  const clause = text.split(CLAUSE_BREAKS)[0].trim();
  if (clause.split(' ').length >= 4) text = clause;
  let words = text.split(' ').filter(Boolean);
  if (words.length > maxWords) {
    words = words.slice(0, maxWords);
    let joined = words.join(' ').replace(/[,:;]+$/, '');
    while (TRAILING_STOP.test(joined)) joined = joined.replace(TRAILING_STOP, '');
    text = joined;
  }
  text = text.replace(/[,:;]+$/, '').trim();
  // An opening quote cut off by the word limit would otherwise dangle.
  if ((text.match(/["“”]/g) || []).length % 2) text = text.replace(/\s*["“”][^"“”]*$/, '').trim() || text.replace(/["“”]/g, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ---------- near-duplicates ----------
const STOP = new Set('the a an of and in on for to with by at from is are was were has have its their this that as be will'.split(' '));
const wordsOf = (text) => new Set(String(text || '').toLowerCase().replace(/[^a-z0-9؀-ۿ ]/g, ' ').split(/\s+/).filter((word) => word.length > 2 && !STOP.has(word)));
function similarity(a, b) {
  const x = wordsOf(a), y = wordsOf(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  x.forEach((word) => { if (y.has(word)) shared += 1; });
  return shared / Math.min(x.size, y.size);
}
// Same country and date with near-identical wording (90% of the shorter description's words shared).
function dedupeNear(records, threshold = 0.9) {
  const groups = new Map();
  records.forEach((record) => { const key = `${record.country}|${record.date || ''}`; groups.set(key, [...(groups.get(key) || []), record]); });
  const removed = [];
  const keep = new Set(records);
  groups.forEach((rows) => {
    rows.sort((a, b) => (b.type === 'framework') - (a.type === 'framework') || (b.source ? 1 : 0) - (a.source ? 1 : 0) || b.description.length - a.description.length);
    for (let i = 0; i < rows.length; i += 1) {
      if (!keep.has(rows[i])) continue;
      for (let j = i + 1; j < rows.length; j += 1) {
        if (keep.has(rows[j]) && similarity(rows[i].description, rows[j].description) >= threshold) { keep.delete(rows[j]); removed.push({ kept: rows[i].id, removed: rows[j].id }); }
      }
    }
  });
  return { records: records.filter((record) => keep.has(record)), removed };
}

module.exports = { cleanInstitution, normalizeInstitutions, shortTitle, similarity, dedupeNear, splitBranch };
