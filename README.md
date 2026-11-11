# GCC States & Yemen Policy Intelligence

Static evidence-led dashboard for food and agriculture policy monitoring across Bahrain, Kuwait, Oman, Qatar, Saudi Arabia, the United Arab Emirates, and Yemen. The dashboard publishes and loads only `data/gcc-yemen-measures.json`; the full multi-country source dataset (`data/measures.json`) is generated locally and is not committed or published. The shared `data-service.js` applies the regional allowlist before filtering or aggregation.

## Local development

Use a static HTTP server (the site fetches local JSON):

```sh
npx serve .
```

Run the validation build:

```sh
npm run build
npm run test:ai
```

This validates required static files, JavaScript syntax, unique IDs, and that the published dataset contains exactly the permitted countries. There is no client bundler or TypeScript project; this site is intentionally plain HTML/CSS/JavaScript with D3.

## Regenerate data

Install the local workbook parser once:

```sh
npm install
```

Then supply the local workbook folders:

```sh
npm run build-data -- --roots "../Monthly Monitoring 2023" "../Monthly Monitoring 2024" "../Monthly Monitoring 2025" "../Monthly Monitoring 2026"
```

The generator rewrites the complete `data/measures.json` and a separate GCC/Yemen-only `data/gcc-yemen-measures.json`. It does not delete or edit the Excel workbooks. Workbook files and `data/measures.json` are ignored by Git. When `data/measures.json` is present locally, `npm run build` also cross-checks the regional records against it. Deduplication, date conversion, country normalisation and classification are handled in `scripts/build-data.cjs`.

## Food price and healthy diet indicators

The **Food Prices & Diets** page and the reports use `data/food-indicators.json`, built from the FAOSTAT bulk downloads (normalized CSV) for Producer Prices and for the Cost and Affordability of a Healthy Diet (https://bulks-faostat.fao.org/production/):

```sh
npm run build-indicators -- --prices "Prices_E_All_Data_(Normalized).csv" --diet "Cost_Affordability_Healthy_Diet_(CoAHD)_E_All_Data_(Normalized).csv"
```

The script keeps GCC States and Yemen, uses official annual prices from 2018 and fills missing or carried-forward annual values with the average of at least six monthly FAOSTAT prices. It drops live-weight ("biological") meat duplicates and non-food items, recomputes USD values that contradict official currency pegs, and records coverage and quality notes that the dashboard displays alongside the figures. The UAE does not report producer prices to FAOSTAT, and Yemen has no healthy diet cost estimate from FAO or the World Bank.

## Pages and reports

- **Policy Network**: focus country orb, dimension cards (domains, institutions, groups, families), a fan of the top linked items with 12-month trends, and a detail panel with activity, recent records and a computed summary.
- **Reports**: regional analysis, country brief, food prices and affordability brief, policy domain report and monthly update, all computed from the current filters, with Print/PDF, Word and Markdown export.

## AI endpoint (optional, not used by the dashboard)

`api/policy-ai.js` is a Claude-based serverless function kept for future use. The dashboard interface no longer includes an AI assistant.

## Methodology

Counts and trends are calculated from the included records and current filters. There are no compliance scores or fabricated comparisons. Policy measures are summaries for monitoring and analysis, not legal texts or legal interpretations. Always consult the original source.
