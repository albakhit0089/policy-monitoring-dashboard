# GCC States & Yemen Policy Intelligence

Static, evidence-led dashboard for food and agriculture policy monitoring across Bahrain, Kuwait, Oman, Qatar, Saudi Arabia, the United Arab Emirates and Yemen, for FAO-SNG policy analysts, government counterparts, managers and donors. Plain HTML, CSS and JavaScript with D3; no bundler and no TypeScript. All libraries are self-hosted in `assets/vendor/` (see its README for versions and licences).

## Local development

Serve the folder over HTTP (the site fetches local JSON):

```sh
npx serve .
```

Checks (all run in CI):

```sh
npm run build            # icon subset, file/syntax/data checks, no external scripts, static summary present
npm run test:narrative   # narrative briefs: traceable numbers, linked citations, no count openings, .docx
npm run test:ai          # optional AI endpoint, with a stubbed Claude API
npm run preview-brief -- monthly all 2026-10   # print a brief as text
```

## Pages

- **This month**: the latest briefing. Period covered, data-through date and a partial-month flag; key messages and short theme sections from the narrative engine; a price–policy panel (FAOSTAT food price inflation with the selected country's trade, market and household-support measures marked on its line); what is new since the last visit; a watchlist of countries and policy areas (both kept in the browser); Word/PDF export and a shareable link.
- **Overview**: a 3D orientation scene (see below), three entry points (What's new, Explore a country, Compare), five headline cards each with the change on the previous period, monthly activity (the partial month is shaded and labelled), the share of measures by policy family, a domain-by-country heatmap, emerging themes (named domains with at least 10 measures in both periods, with both counts shown) and the latest measures.
- **Country Intelligence, Policy Trends, Policy Areas, Country Comparison, Food Prices & Diets, Policy Network, Policy Records, Reports, Methodology & Sources.** Country Comparison ignores the global Country filter, because countries are chosen on the page.

Filters sit in a chip bar ("Saudi Arabia · Short-term ×") with an **Edit filters** drawer. The page and every filter are encoded in the URL hash (for example `#records?country=Oman&year=2026`), so links, bookmarks and the back button restore the view. FAPDA terms (policy family, short-term decision, long-term framework, domain, group, institution) show definitions on hover or keyboard focus.

## Narrative briefs (`narrative.js`)

Reports are written by a deterministic engine that turns computed signals into prose: Monthly policy briefing, Country policy brief, Regional policy analysis and Event brief. Each follows the same structure:

1. Key messages · 2. Context (CPI food inflation and its period, tagged supply shocks, seasonal factors) · 3. Policy developments and analysis, by theme (what governments did, the instruments used, the objective, change on the previous period and on peers, 2–4 illustrative measures linked to their sources) · 4. Policy coherence and gaps (including monitoring coverage) · 5. Implications · 6. Recommendations and areas for FAO support · 7. Annex of the measures referenced (date, country, institution, title, source) with a data note.

Signals: change on the previous period and the 12 months before, instruments a country had not used in the previous 12 months, institution clusters, measures coinciding with high food price inflation, trade restrictions and the share of household-support measures. Rules the engine keeps, and the tests check over 110 briefs: every number passes through a registry and is traceable to the data or a cited record; every measure named links to its source and appears in the annex; no brief opens with a count; sentences stay under 25 words (excluding quoted titles); interpretation is measured ("suggests", "is consistent with"); the disclaimer is kept.

Exports: Word (`docx.js`, a dependency-free .docx writer with a cover, numbered headings, live source links and an annex table with a source note), print/PDF, Markdown, plain text and a link that reopens the same brief.

### Optional AI-assisted draft

When `index.html` sets `<meta name="pi-ai-endpoint" content="https://…/api/policy-ai">` (empty by default, as on GitHub Pages), Reports offers **Draft with AI**. The browser sends only the record ids and the engine's computed indicators; `api/policy-ai.js` (draft mode) looks the records up in its own copy of the dataset, instructs Claude (`claude-opus-5-5`, with server-side fallback) to use only that evidence and cite record ids, removes any citation to an id outside the evidence, and labels the result "AI-assisted draft – for analyst review". The deterministic brief is unaffected. The function needs `ANTHROPIC_API_KEY` and `ALLOWED_ORIGINS` on its host.

### Event tags

`data/events.json` lists events with `tags` (matched against record tags taken from the workbooks' "Middle East Conflict 2026" and "El Niño" Yes/No columns) and `recordIds` (record ids added by analysts; ids are shown in the record drawer). An Event brief uses the same narrative structure over the tagged measures. Example entries: Middle East conflict 2026, Hormuz crisis 2026 (records whose text names the Strait of Hormuz), El Niño 2026.

## Data

- `data/gcc-yemen-summary.json` (~70 KB gzipped) loads first: dictionary-encoded records for charts and filters, without descriptions or sources, and titles only for the latest measures.
- `data/gcc-yemen-measures.json` (full records) loads only on This month, Policy Records, Country Intelligence, Policy Network, Reports, and on the first search keystroke.
- `index.html` carries a generated plain-HTML summary (coverage, counts by country, latest measures with source links) for readers without JavaScript and for link previews.

Regenerate from workbooks (`npm install` once for the parser):

```sh
npm run build-data -- --roots "../Monthly Monitoring 2023" "../Monthly Monitoring 2024" "../Monthly Monitoring 2025" "../Monthly Monitoring 2026"
# or add new months to the existing local data/measures.json:
node scripts/build-data.cjs --merge --roots "../Monthly Monitoring 2026 new months"
```

`scripts/build-data.cjs` and `scripts/lib/normalize.cjs` handle deduplication (exact, and near-identical descriptions for the same country and date), dates, country names, classification, **institution normalisation** (spelling variants merged into one canonical name per country, with an optional `institutionBranch` such as a regional branch; the raw spelling is kept in the local source file) and **short titles** (deterministic: first clause, actor + action + object, at most 12 words, no ellipsis; the full text stays in `description`). The run reports distinct-institution counts before and after normalisation and refreshes the static summary in `index.html`. Workbooks and `data/measures.json` are not committed.

FAOSTAT indicators (`data/food-indicators.json`):

```sh
npm run build-indicators -- --prices "Prices_E_All_Data_(Normalized).csv" --diet "Cost_Affordability_Healthy_Diet_(CoAHD)_E_All_Data_(Normalized).csv"
node scripts/build-cpi.cjs "FAOSTAT_data_en_11-12-2026.csv"   # monthly consumer price indices; months that only repeat the previous year are dropped
```

## 3D, used selectively

3D is used for orientation only, never for bars or columns that compare values.

- **Overview scene** (`scene3d.js`, Three.js): a tilted view of the Arabian Peninsula. Countries have one uniform height and are shaded by measures in the last 12 months; neighbours are grey; schematic shipping lanes run through the Strait of Hormuz and Bab el-Mandeb; 14 main ports are hover markers. Selecting a country flies the camera in and opens its country page. **Skip to 2D** switches to the D3 map (remembered).
- **Fallbacks**: with `prefers-reduced-motion` or without WebGL, a static image of the scene (`assets/scene-poster.png`) is shown and Three.js is not loaded; the 2D map stays available.
- **Policy Network**: an optional rotatable 3D force graph (3d-force-graph); the 2D view is the default.
- Three.js and 3d-force-graph load only on the pages that use them. Headline cards tilt slightly toward the pointer (not on touch or with reduced motion).

## Languages

Interface strings live in `i18n.js` with an EN/AR toggle in the top bar; the choice is remembered. The Arabic strings are drafts marked for translator review, and cover the interface shell (navigation, filters, entry points, headline cards, definitions); page headings and chart labels inside pages are still English, and policy records stay in English as published. The stylesheet uses logical properties so the layout mirrors right-to-left; charts stay left-to-right.

## Methodology

Counts and trends come from the included records and the current filters; nothing is inferred. Policy measures are summaries for monitoring and analysis, not legal texts or legal interpretations. Always consult the original source.
