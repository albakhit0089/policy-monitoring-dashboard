# GCC States & Yemen Policy Intelligence

Static evidence-led dashboard for food and agriculture policy monitoring across Bahrain, Kuwait, Oman, Qatar, Saudi Arabia, the United Arab Emirates, and Yemen. The dashboard keeps the original full source dataset in `data/measures.json` and loads only `data/gcc-yemen-measures.json`. The shared `data-service.js` applies the regional allowlist before filtering or aggregation.

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

The generator rewrites the complete `data/measures.json` and a separate GCC/Yemen-only `data/gcc-yemen-measures.json`. It does not delete or edit the Excel workbooks. Workbook files are ignored by Git. Deduplication, date conversion, country normalisation and classification are handled in `scripts/build-data.cjs`.

## GitHub Pages and AI

GitHub Pages hosts the static dashboard at the repository root. It cannot execute `api/policy-ai.js`. To enable generated AI answers, deploy this repository to Vercel, configure `OPENAI_API_KEY` and optionally `OPENAI_MODEL` and comma-separated `ALLOWED_ORIGINS` as server-side environment variables, then set the `policy-ai-endpoint` meta content in `index.html` to the deployed `/api/policy-ai` URL. The browser never receives the API key. Until configured, the assistant clearly labels results as local evidence matches rather than AI-generated analysis.

The API performs allowlisted record retrieval on the server and asks the OpenAI Responses API to answer only from the retrieved records with source IDs. Lexical retrieval is currently used; semantic embeddings/vector search are not configured. Verify generated analysis against the cited source links.

## Methodology

Counts and trends are calculated from the included records and current filters. There are no compliance scores or fabricated comparisons. Policy measures are summaries for monitoring and analysis, not legal texts or legal interpretations. Always consult the original source.
