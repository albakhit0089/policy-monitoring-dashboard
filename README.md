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

The **Food Prices & Diets** page and the reports use `data/food-indicators.json`, built from two FAOSTAT exports: Producer Prices (PP, `.xlsx`) and Cost and Affordability of a Healthy Diet (CAHD, as JSON records with `country, year, item, unit, value, flag`):

```sh
npm run build-indicators -- --prices "<FAOSTAT PP export>.xlsx" --diet "<healthy-diet>.json"
```

The script keeps GCC States and Yemen only, drops live-weight ("biological") meat duplicates and non-food items, recomputes USD values that contradict official currency pegs, and records coverage and quality notes (repeated values, large swings, missing countries) that the dashboard displays alongside the figures.

## Pages and reports

- **Policy Network**: focus country orb, dimension cards (domains, institutions, groups, families), a fan of the top linked items with 12-month trends, and a detail panel with activity, recent records and a computed summary.
- **Reports**: regional analysis, country brief, food prices and affordability brief, policy domain report and monthly update, all computed from the current filters, with Print/PDF, Word and Markdown export.

## GitHub Pages and AI

GitHub Pages hosts the static dashboard at the repository root. It cannot execute `api/policy-ai.js`. To enable generated AI answers, deploy this repository to Vercel, configure `ANTHROPIC_API_KEY` and optionally `CLAUDE_MODEL` (defaults to `claude-opus-5-5`) and comma-separated `ALLOWED_ORIGINS` as server-side environment variables, then set the `policy-ai-endpoint` meta content in `index.html` to the deployed `/api/policy-ai` URL. The browser never receives the API key. Until configured, the assistant clearly labels results as local evidence matches rather than AI-generated analysis.

The API performs allowlisted record retrieval on the server and asks Claude (via the official `@anthropic-ai/sdk`, streaming, with server-side refusal fallback) to answer only from the retrieved records with source IDs. Lexical retrieval is currently used; semantic embeddings/vector search are not configured. Verify generated analysis against the cited source links.

## Methodology

Counts and trends are calculated from the included records and current filters. There are no compliance scores or fabricated comparisons. Policy measures are summaries for monitoring and analysis, not legal texts or legal interpretations. Always consult the original source.
