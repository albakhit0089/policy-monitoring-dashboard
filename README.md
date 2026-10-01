# Monthly Monitoring Dashboard

Interactive static dashboard for short-term policy decisions and long-term policy frameworks across food and agriculture in the Near East and North Africa. The application uses D3 v7 from cdnjs and runs directly from GitHub Pages. No server-side processing is used.

## Data generation

Raw Excel workbooks are not stored in this repository. To regenerate `data/measures.json` from local workbook folders:

1. Install Node.js 18 or later.
2. From this directory, install the one-time workbook parser dependency with `npm install`.
3. Pass one or more folders containing the monthly `.xlsx` files:

```sh
npm run build-data -- --roots "../Monthly Monitoring 2023" "../Monthly Monitoring 2024" "../Monthly Monitoring 2025" "../Monthly Monitoring 2026"
```

The script scans nested folders, reads only the `Policy Decisions (short term)` and `Policy Frameworks (long term)` sheets, finds fields from their header labels, converts Excel dates to ISO format, applies the country-name fixes and policy group mappings, and deduplicates matching records. It omits comments, FAPDA identifiers, lookup sheets, empty rows, and rows whose country cell contains an Excel error. The generated JSON is included with the static site so visitors do not need the original workbooks.

To verify the data, inspect the generated record count and compare the source workbook folders selected for the run. Duplicate monthly, annual, copied, and subject workbooks are expected and are deduplicated by type, country, date, and the first 160 characters of the description.

## Run locally

Open this directory with a static web server, for example:

```sh
npx serve .
```

The dashboard fetches `data/measures.json`, so opening `index.html` as a `file://` URL may be blocked by browser fetch security. No bundler or build step is used for the site.

## GitHub Pages

The repository is configured to deploy from `main` / root. In repository settings, choose **Pages > Build and deployment > Deploy from a branch**, select `main`, and select `/ (root)`.

## Data and wording

Only numeric counts, dates, shares, and year-over-year changes calculated from the included records are shown. No compliance or gap scores are produced. Records are presented as policy measures, not laws, legislation, or legal texts. The on-page disclaimer explains the scope and limits of the summaries.
