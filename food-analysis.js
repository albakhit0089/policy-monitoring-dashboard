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

// Monthly consumer prices (FAOSTAT CP): latest food price inflation and how food prices moved against all prices.
export const cpiMonthName = (key) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const monthsBack = (key, count) => { const [y, m] = key.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 - count, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
export function cpiSummary(food) {
  if (!food.cpi) return null;
  const rows = Object.entries(food.cpi.countries).map(([country, entry]) => {
    const months = Object.keys(entry.inflation).sort();
    const latest = months.at(-1);
    const peakMonth = months.reduce((best, month) => entry.inflation[month] > entry.inflation[best] ? month : best, months[0]);
    const yearAgo = latest && monthsBack(latest, 12);
    const foodChange = pctChange(entry.food[yearAgo], entry.food[latest]);
    const generalChange = pctChange(entry.general[yearAgo], entry.general[latest]);
    return { country, latest, inflation: entry.inflation[latest], peakMonth, peak: entry.inflation[peakMonth], foodChange, generalChange, gap: foodChange !== null && generalChange !== null ? foodChange - generalChange : null, foodIndex: entry.food[latest], points: months.map((month) => [month, entry.inflation[month]]) };
  }).sort((a, b) => b.inflation - a.inflation);
  return { rows, latest: rows.map((row) => row.latest).sort().at(-1), first: food.cpi.months[0], highest: rows[0], lowest: rows.at(-1) };
}
// One or two sentences on food price inflation, for the prices page and reports.
export function cpiSentences(food, country = null) {
  const cpi = cpiSummary(food);
  if (!cpi) return [];
  const name = (value) => value === "United Arab Emirates" ? "the UAE" : value;
  const pct = (value) => `${value.toFixed(1)}%`;
  if (country) {
    const row = cpi.rows.find((item) => item.country === country);
    if (!row) return [`FAOSTAT's monthly consumer price indices do not cover ${name(country)}.`];
    const vsAll = row.gap === null ? "" : Math.abs(row.gap) < .5 ? ", in line with prices overall" : row.gap > 0 ? `, faster than prices overall (${pct(row.generalChange)})` : `, slower than prices overall (${pct(row.generalChange)})`;
    return [`Food prices in ${name(country)} were ${pct(row.inflation)} higher in ${cpiMonthName(row.latest)} than a year earlier${row.peakMonth !== row.latest && row.peak > row.inflation + 1 ? `, down from a peak of ${pct(row.peak)} in ${cpiMonthName(row.peakMonth)}` : ""}.${row.foodChange === null ? "" : ` Over the past 12 months the food price index ${row.foodChange >= 0 ? "rose" : "fell"} ${pct(Math.abs(row.foodChange))}${vsAll}.`}${row.latest !== cpi.latest ? ` More recent months are not yet reported.` : ""}`];
  }
  const rising = cpi.rows.filter((row) => row.inflation >= 3);
  const above = cpi.rows.filter((row) => row.gap !== null && row.gap > .5);
  // Countries report with different delays, so name the month wherever it differs from the latest.
  const late = cpi.rows.filter((row) => row.latest !== cpi.latest);
  const when = late.length ? `in the latest month available (${cpiMonthName(cpi.latest)}; ${late.map((row) => `${cpiMonthName(row.latest)} for ${name(row.country)}`).join(", ")})` : `in ${cpiMonthName(cpi.latest)}`;
  return [`Food price inflation ${when} ranged from ${pct(cpi.lowest.inflation)} in ${name(cpi.lowest.country)} to ${pct(cpi.highest.inflation)} in ${name(cpi.highest.country)}.${rising.length ? ` Food prices were rising markedly (3% or more a year) in ${rising.map((row) => name(row.country)).join(", ").replace(/, ([^,]*)$/, " and $1")}.` : ""}${above.length ? ` In ${above.map((row) => name(row.country)).join(", ").replace(/, ([^,]*)$/, " and $1")}, food prices rose faster than prices overall, so food took a larger share of household budgets.` : ""}`];
}

// GCC strategic commodities: staples and products central to Gulf food security that FAOSTAT prices in
// several GCC countries. Yemen is reported separately (rial depreciation dominates its local prices) and the
// UAE does not report producer prices.
export const GCC_PRICE_COUNTRIES = ["Bahrain", "Kuwait", "Oman", "Qatar", "Saudi Arabia"];
export const GCC_BASKET = [
  { group: "Cereals", codes: ["111", "115"] },
  { group: "Vegetables", codes: ["1234", "1232", "1510", "1253.02"] },
  { group: "Fruit", codes: ["1314", "1322", "1221"] },
  { group: "Livestock products", codes: ["2211", "2293", "231", "21121", "21115", "21117.01"] },
];
export function gccBasket(food, countries = GCC_PRICE_COUNTRIES) {
  const items = itemLookup(food);
  const changes = priceChanges(food, "lcu");
  return GCC_BASKET.map(({ group, codes }) => ({
    group,
    rows: codes.filter((code) => items.has(code)).map((code) => {
      const cells = Object.fromEntries(countries.map((country) => {
        const series = food.prices.series.find((entry) => entry.country === country && entry.code === code);
        const price = series && latestPricePerKg(series);
        const change = changes.find((entry) => entry.country === country && entry.code === code);
        return [country, price ? { ...price, change: change && !change.flat ? change.change : null, flat: !!change?.flat, firstYear: change?.firstYear, latestYear: change?.latestYear } : null];
      }));
      return { code, name: items.get(code).name, cells };
    }).filter((row) => Object.values(row.cells).some(Boolean)),
  })).filter((section) => section.rows.length);
}
// Median change of the basket by group, over series with measurable change.
export function gccBasketSummary(food, countries = GCC_PRICE_COUNTRIES) {
  return gccBasket(food, countries).map((section) => {
    const values = section.rows.flatMap((row) => Object.values(row.cells).filter((cell) => cell && cell.change !== null).map((cell) => cell.change));
    return { group: section.group, median: median(values), series: values.length };
  });
}
