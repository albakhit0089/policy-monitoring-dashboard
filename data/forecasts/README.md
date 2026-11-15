# Food Price Outlook — data pipeline and methodology (Futures, phase 1)

This module adds a forward-looking food price page to the dashboard: 12-month food CPI forecasts per
GCC country, with backtested accuracy, empirical prediction intervals and clearly labelled hypothetical
scenarios. It follows the phased plan of the Agrifood Futures 2035 brief: phase 1 is the food price
forecasting MVP only; nothing is published that cannot be validated.

## Pipeline

| Step | Script | What it does |
| --- | --- | --- |
| Fetch | `scripts/fetch-faostat-cp.cjs` | Downloads the official FAOSTAT CP bulk file, extracts the seven countries (all columns and flags kept), and refuses to overwrite the committed extract if the download is truncated or loses months. |
| Raw input | `data/sources/faostat-cp-region.csv` | The retained raw extract (provenance; 6,270 rows). Retrieved 2026-11-15 from <https://bulks-faostat.fao.org/production/> (zip sha256 begins `93aeb871c7c698bd`). |
| Build | `scripts/build-forecasts.cjs` | Parses, validates continuity, fits and backtests models, writes `data/forecasts/food-cpi.json`. |
| Gate | `scripts/validate-forecasts.cjs` | Fails the build on schema breaches, disordered intervals, inflation/index inconsistency, forecasts without enough history, or a Yemen forecast. Runs in `npm run build` (CI). |
| Refresh | `.github/workflows/update-forecasts.yml` | Monthly; opens a pull request, never commits to `main` directly. |

## Method

- **Target series**: FAOSTAT food CPI index (2015 = 100), monthly, 2000-01 → 2026-06 (318 observations
  per GCC country, no gaps). Food inflation is *derived* from the index forecast against the observed
  index a year earlier, so index and inflation can never disagree (the FAOSTAT inflation item matches
  this derivation to two decimals across all 2,034 historical observations — verified in validation).
- **Models**: Holt-Winters additive with damped trend and monthly seasonality (grid-searched
  parameters), against seasonal naïve with drift; the plain seasonal naïve is the benchmark. The
  published model per country is whichever backtests better.
- **Backtesting**: rolling origin, 36 origins, horizons 1–12, models refit at every origin. Reported as
  MAE/RMSE at horizons 1, 6 and 12, plus skill versus seasonal naïve (29–76 % lower RMSE across
  countries in the current build).
- **Intervals**: empirical 50 % and 80 % bands from the backtest error quantiles per horizon; the point
  forecast is bias-corrected by the median backtest error.
- **Suppression rule**: no forecast is published for a series with under 120 contiguous monthly
  observations or one that stops before the common latest month. This excludes **Yemen** (FAOSTAT
  series ends 2017-06); the page links FEWS NET and FAO GIEWS FPMA instead and evaluates no
  early-warning rules on stale data.
- **Scenarios** (hypothetical, labelled as such everywhere): the adverse scenario ramps year-on-year
  food inflation up by 9.6 pp over 12 months — the median GCC rise from 2019–20 levels to the 2021–22
  global food price surge, derived from this same series (per-country values in the JSON). The policy
  response scenario keeps a user-chosen share of that shock. Neither is a prediction or a measured
  policy effect, and nothing here is an official FAO or government forecast.

## Data-source inventory (checked 2026-11-15)

| Source | Status | Finding |
| --- | --- | --- |
| FAOSTAT CP bulk (monthly CPI) | **Confirmed, in use** | Six GCC countries complete 2000-01→2026-06; Yemen ends 2017-06. |
| IMF WEO datamapper API | Confirmed reachable | Country CPI/GDP forecasts; candidate for phase 2 context panels (headline, not food, inflation). |
| World Bank Commodity Markets (pink sheet xlsx) | Confirmed reachable | Global benchmarks (wheat, rice, fertilizer, energy); phase 2 driver panel. Global prices, not local retail. |
| FAO GIEWS FPMA API | Confirmed reachable | Market-level prices incl. Yemen; phase 2 Yemen coverage candidate. |
| FEWS NET Yemen | Confirmed reachable | Qualitative outlooks; linked from the page, never reinterpreted as price forecasts. |
| GCC-STAT MARSA dataset pages | Reachable, **no API found** | HTML dataset pages; downloadable resources need manual verification before use. Pending. |
| HDX HAPI (WFP prices) | **Blocked (403)** | Needs a registered app identifier; pending. |
| UN WPP, OECD–FAO Outlook | Reachable, not yet needed | Long-term (2030/2035) phases only. |

## Output schema (`food-cpi.json`)

Per country: `iso3`, `status` (`forecast` or `insufficient_data` with `statusReason`), `history.food`
and `history.inflation` keyed by `YYYY-MM`, `latestObservation`, `observations`, `flagCounts`
(FAOSTAT flags A/E/I/X), `model` (name, parameters, backtest design and metrics), `forecast`
(12 months × bands `mid/lo80/lo50/hi50/hi80` for index and derived inflation). Top level: source with
retrieval date, generation date, horizon, scenario derivation. The page's CSV export carries one row
per value with `observation_status` set to `observed`, `model_forecast` or `hypothetical_scenario_*`.

## Phased plan (remaining)

1. **Phase 2 — drivers and context**: IMF WEO headline inflation and World Bank commodity benchmarks
   as context panels; FPMA for Yemen market prices; HDX HAPI once an app identifier is registered.
2. **Phase 3 — medium term (2030)**: import-exposure and commodity-pass-through scenarios using
   official external forecasts as inputs.
3. **Phase 4 — long term (2035)**: OECD–FAO Outlook and UN WPP population-linked demand under a
   structural scenario framework (not extended time-series extrapolation), per the brief.
