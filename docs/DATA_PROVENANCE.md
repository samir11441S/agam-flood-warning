# Data & AI provenance

## Datasets

| Data | Source | Licence | Used for |
|---|---|---|---|
| Daily rainfall 1994–2023 (ERA5 reanalysis, `models=era5`) | [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api) (Copernicus ERA5) | CC BY 4.0 (Open-Meteo), Copernicus licence | Local rain thresholds (≈2-, 5- and 10-year return levels for 24 h, 72 h and 5-day totals) for 39 points (15 upstream stations + 24 areas); 30-year backtest |
| Daily river discharge 1984–2023 (GloFAS v4 reanalysis) | [Open-Meteo Flood API](https://open-meteo.com/en/docs/flood-api) (Copernicus GloFAS) | CC BY 4.0, Copernicus licence | River-flow thresholds for 9 river points; backtest; replays |
| Archived forecast-model rainfall 2020–2023 | [Open-Meteo Historical Forecast API](https://open-meteo.com/en/docs/historical-forecast-api) | CC BY 4.0 | Bias factor between forecast models and ERA5 (`modelScale`) |
| Hourly rain analysis and forecasts *as they were issued* (0–3 days ahead), 2024 and 2026 | [Open-Meteo Previous Runs API](https://open-meteo.com/en/docs/previous-runs-api) | CC BY 4.0 | Honest hourly replays: each 6-hour step only sees the analysis and forecasts that existed at that hour |
| Sea level incl. tides, Jul 2023 – Dec 2025, and tide prediction | [Open-Meteo Marine API](https://open-meteo.com/en/docs/marine-weather-api) (`sea_level_height_msl`) | CC BY 4.0 | Tide thresholds (95th / 99th percentile) at the river mouths for 6 coastal areas; replays and live mode |
| Live hourly rain (past 5 days + 3-day forecast), GloFAS river forecast, tide for the next 24 h | Open-Meteo Forecast, Flood and Marine APIs | CC BY 4.0 (free API is non-commercial; a paid key is supported) | Live mode |
| Residents' "water rising" reports | Telegram (🌊), SMS `PANI <area>`, or logged by officers | Collected by Agam | Community signal: 3 different reporters in 6 h raise the level to Warning |
| Map tiles | © OpenStreetMap contributors | ODbL | Background map |
| Area & station coordinates, rivers, travel times | Compiled by the team from public maps | — | `src/data/geo.json`. Travel times are **indicative estimates** and must be validated with BWDB/FFWC before operational use |
| Demo households, names, villages, volunteers | **Synthetic**, generated deterministically in `src/lib/households.ts` | — | Demo of prioritisation and dispatch only |
| Real household and volunteer lists (pilot) | Uploaded by a signed-in officer as CSV | Owned by the union committee | Sending alerts. Rows without a `consent` = yes column are skipped |

### Personal data

- **The demo uses no real personal data.** All demo households are synthetic. Names are generated from common name parts and do not refer to real people, and demo households have no phone numbers.
- In a real pilot, the household list belongs to the Union Disaster Management Committee and stays on their own server. Only signed-in officers can upload, view or delete it; every upload and deletion is in the audit log; rows without recorded consent are skipped; and the dashboard warns when a list is more than a year old. Agam only needs a name, a phone number, a village and vulnerability flags. Data is never sold and is deleted at the end of the pilot unless the union decides otherwise.
- Field-test answers (`/field-test`) are anonymous: no name or phone number is collected.

### Known data limitations

- ERA5 is a ~25 km grid. It smooths local cloudbursts and badly under-represents extreme orographic rain (e.g. Meghalaya). Thresholds are computed from the same dataset they are compared against, so the bias largely cancels. Forecast-model data is compared against thresholds scaled by a per-location bias factor.
- ERA5 is published with a ~5-day delay, so it is used only for thresholds and the backtest. Replays and live mode use the near-real-time hourly model analysis, with thresholds scaled by the bias factor. Satellite rain (GPM IMERG Early), BMD/IMD gauges or BWDB/FFWC telemetry would catch local cloudbursts better.
- Tide thresholds come from only 2.5 years of modelled sea level, so they are percentiles ("higher than 95% of hours"), not return levels.
- Travel times are estimates. We tried to learn them from 30 years of daily data and could not (see `docs/EVALUATION.md` §4).
- GloFAS grid cells do not resolve small flashy rivers (Muhuri, Feni, Gumti, Khowai, Haora), so those areas use rain signals only.

## Foundation models

| Model | Provider | Where | Purpose |
|---|---|---|---|
| `claude-opus-5-5` | Anthropic (Claude API) | `src/lib/claude-alert.ts` | Writes the Bangla SMS, voice-call script, optional dialect version, checklist and English official summary from verified facts. Structured JSON output. Server-side refusal fallback (`fallbacks: "default"`) enabled. |

The **risk decision is not made by an LLM.** Alert levels come from a transparent, rule-based engine (`src/lib/risk.ts`) using thresholds derived from data. Claude only words the message. Its output must pass seven automatic checks (correct level word, correct area, no invented numbers, SMS length, 999 included, checklist present, sender named), or the verified template is sent instead. A signed-in officer approves every alert before it goes out (two officers for Danger if the committee turns that on).

## Responsible-AI safeguards

1. **Numbers are guarded:** every number in an AI draft must come from the verified facts; otherwise the draft is rejected.
2. **Human in the loop:** nothing is sent without officer approval. The one exception is opt-in and Danger-only: if no officer answers within 45 minutes (after escalating to every officer), the verified template — never AI text — is sent automatically. Committees can switch this off.
3. **Accountability:** officers sign in with hashed PINs; sign-ins, drafts, approvals, rejections, uploads and sends are in an audit log; repeated wrong PINs lock sign-in for 10 minutes. Demo mode can never send to a real phone.
4. **Fail-safe:** if the AI is unavailable, refuses, or fails a check, the verified template is used, so alerts never depend on AI uptime.
5. **Dialect output is flagged experimental** and must be reviewed by a native speaker.
6. **Not an official warning:** the UI and docs state this clearly. Officers record the official FFWC/BMD status for each area, and messages are sent in the local committee's name. Agam supports official BMD/FFWC/DDM warnings and does not replace them.
