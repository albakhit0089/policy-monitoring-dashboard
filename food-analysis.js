// Pure calculations over data/food-indicators.json, shared by the prices page and reports.

export const CURRENCY = { Bahrain: "BHD", Kuwait: "KWD", Oman: "OMR", Qatar: "QAR", "Saudi Arabia": "SAR", "United Arab Emirates": "AED", Yemen: "YER" };
const DAYS_PER_MONTH = 30.4;

// Format a local-currency amount with sensible precision (BHD/KWD/OMR use small units).
export function formatLocal(value, country, { digits } = {}) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  const code = CURRENCY[country] || "";
  const places = digits ?? (["BHD", "KWD", "OMR"].includes(code) ? 3 : value >= 100 ? 0 : 2);
  return `${code} ${value.toLocaleString("en-GB", { minimumFractionDigits: places, maximumFractionDigits: places })}`;
}
export const perMonth = (daily) => daily * DAYS_PER_MONTH;

const pctChange = (from, to) => (from && to !== undefined && to !== null) ? (to - from) / from * 100 : null;
const median = (values) => {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function itemLookup(food) {
  return new Map(food.prices.items.map((item) => [item.code, item]));
}

// Cost of a healthy diet (PPP $/person/day) by country with first/latest values and change.
export function dietSummary(food) {
  const rows = food.diet.countries.map((country) => {
    const byYear = food.diet.cohd[country] || {};
    const years = Object.keys(byYear).map(Number).filter((year) => byYear[year].ppp !== undefined).sort((a, b) => a - b);
    const firstYear = years[0], latestYear = years.at(-1);
    const first = byYear[firstYear]?.ppp, latest = byYear[latestYear]?.ppp;
    const pua = food.diet.pua[country] || {};
    const puaYears = Object.keys(pua).map(Number).sort((a, b) => a - b);
    const lcuFirst = byYear[firstYear]?.lcu, lcuLatest = byYear[latestYear]?.lcu;
    return { country, firstYear, latestYear, first, latest, change: pctChange(first, latest), lcuFirst, lcuLatest, lcuChange: pctChange(lcuFirst, lcuLatest), points: years.map((year) => [year, byYear[year].ppp]), puaLatest: puaYears.length ? { year: puaYears.at(-1), value: pua[puaYears.at(-1)] } : null };
  });
  const years = [...new Set(rows.flatMap((row) => row.points.map(([year]) => year)))].sort((a, b) => a - b);
  const regional = years.map((year) => {
    const values = rows.map((row) => row.points.find(([y]) => y === year)?.[1]).filter((value) => value !== undefined);
    return [year, values.reduce((sum, value) => sum + value, 0) / values.length];
  });
  const ranked = [...rows].sort((a, b) => b.latest - a.latest);
  return { rows, regional, regionalChange: pctChange(regional[0]?.[1], regional.at(-1)?.[1]), highest: ranked[0], lowest: ranked.at(-1), firstYear: years[0], latestYear: years.at(-1) };
}

// Healthy diet cost composition (PPP $/person/day by food group) for the single year FAOSTAT publishes.
export function dietComponents(food) {
  const entries = Object.entries(food.diet.components.ppp || {});
  const groups = [...new Set(entries.flatMap(([, parts]) => Object.keys(parts)))];
  return { year: food.diet.components.year, groups, rows: entries.map(([country, parts]) => ({ country, parts, total: Object.values(parts).reduce((sum, value) => sum + value, 0) })) };
}

// Price change for every series between its first and latest available year.
export function priceChanges(food, currency = "lcu") {
  const items = itemLookup(food);
  const swingKeys = new Set(food.prices.swings.map((swing) => `${swing.country}|${swing.code}`));
  return food.prices.series.map((series) => {
    const values = series[currency];
    const years = Object.keys(values).map(Number).sort((a, b) => a - b);
    if (years.length < 2) return null;
    const item = items.get(series.code);
    // FAOSTAT sometimes repeats one value across all years; that signals carried-forward data, not stable prices.
    const flat = years.every((year) => values[year] === values[years[0]]);
    return { flat, country: series.country, code: series.code, item: item?.name || series.code, group: item?.group || "Other", firstYear: years[0], latestYear: years.at(-1), first: values[years[0]], latest: values[years.at(-1)], change: pctChange(values[years[0]], values[years.at(-1)]), swing: swingKeys.has(`${series.country}|${series.code}`), imputed: series.imputed.length > 0 };
  }).filter(Boolean);
}

// Median local-currency producer price change per country.
export function countryPriceSummary(food) {
  const changes = priceChanges(food, "lcu");
  const countries = [...new Set(changes.map((change) => change.country))];
  return countries.map((country) => {
    const all = changes.filter((change) => change.country === country);
    const rows = all.filter((change) => !change.flat);
    return { country, series: all.length, assessed: rows.length, flatSeries: all.length - rows.length, medianChange: median(rows.map((row) => row.change)), medianUsdChange: median(priceChanges(food, "usd").filter((row) => row.country === country && rows.some((lcu) => lcu.code === row.code)).map((row) => row.change)), increased: rows.filter((row) => row.change > 0).length, firstYear: Math.min(...all.map((row) => row.firstYear)), latestYear: Math.max(...all.map((row) => row.latestYear)) };
  }).sort((a, b) => (b.medianChange ?? -Infinity) - (a.medianChange ?? -Infinity));
}

// Median change by food group across all countries.
export function groupPriceSummary(food) {
  // Yemen is excluded: currency depreciation dominates its local-currency changes.
  const changes = priceChanges(food, "lcu").filter((change) => !change.flat && change.country !== "Yemen");
  const groups = [...new Set(changes.map((change) => change.group))];
  return groups.map((group) => {
    const rows = changes.filter((change) => change.group === group);
    return { group, series: rows.length, medianChange: median(rows.map((row) => row.change)) };
  }).filter((row) => row.series >= 3).sort((a, b) => b.medianChange - a.medianChange);
}

// Items priced in the most countries, for cross-country comparison.
export function comparableItems(food, minimumCountries = 3) {
  const items = itemLookup(food);
  const counts = new Map();
  food.prices.series.forEach((series) => counts.set(series.code, (counts.get(series.code) || 0) + 1));
  return [...counts.entries()].filter(([, count]) => count >= minimumCountries).sort((a, b) => b[1] - a[1] || items.get(a[0]).name.localeCompare(items.get(b[0]).name)).map(([code, count]) => ({ ...items.get(code), countries: count }));
}

export function priceCountries(food) {
  return [...new Set(food.prices.series.map((series) => series.country))];
}

export { median, pctChange };

// Latest available producer price per kg for one series, in USD and local currency.
export function latestPricePerKg(series) {
  const years = Object.keys(series.usd).map(Number).sort((x, y) => x - y);
  const year = years.at(-1);
  if (!year) return null;
  return { year, usd: series.usd[year] / 1000, lcu: series.lcu[year] !== undefined ? series.lcu[year] / 1000 : null };
}
