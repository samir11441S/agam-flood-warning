# Evaluation

Every number here can be reproduced with the scripts in `scripts/`. We report our misses as clearly as our hits.

## 1. Did forecasts see the Feni 2024 rain coming? (motivation)

We used the Open-Meteo **Previous Runs API**, which stores forecasts as they were issued, to check what four global models predicted for Udaipur, Tripura (23.53 N, 91.48 E):

| Model | Forecast for 20 Aug, issued 1 day earlier | Issued 2 days earlier | Model's own analysis for 20 Aug |
|---|---|---|---|
| ECMWF IFS 0.25° | 29 mm | 37 mm | 176 mm |
| GFS | 35 mm | 14 mm | 15 mm |
| DWD ICON | 24 mm | 15 mm | 27 mm |
| JMA | 30 mm | 24 mm | 56 mm |
| Open-Meteo best match | 24 mm | 15 mm | 197 mm |

**Conclusion:** no model forecast the extreme rain even one day ahead. Agam treats **observed upstream rain** as the primary signal and forecasts as supporting evidence.

## 2. Replays: what would Agam have said, hour by hour?

`npm run replay-report -- <replay-id> --steps` prints the level per area **every 6 hours**. Each step uses only:
- hourly rain from the near-real-time model analysis as archived at the time (Previous Runs API), as rolling 24 h / 72 h / 5-day totals ending at that hour, compared against thresholds scaled by the per-location bias factor (exactly like live mode);
- rain forecasts as they were issued that day;
- the tide predicted for the next 24 hours at the river mouth (tides are predictable in advance);
- daily river flow up to the previous full day (GloFAS reanalysis; archived river forecasts are not available).

| Replay | First Watch | First Warning | First Danger | What triggered Danger |
|---|---|---|---|---|
| **Feni, Aug 2024** | 17 Aug 06:00 | 17 Aug 18:00 | **19 Aug 12:00** — Feni Sadar, Sonagazi | 192 mm in 72 h at Belonia (S. Tripura) **plus a spring tide** at the river mouth (3.52 m vs. its usual high of 3.23 m; 19 Aug 2024 was a full moon): rain that cannot drain |
| | | | **20 Aug 12:00** — Parshuram, Fulgazi, Chhagalnaiya, Burichang, Chauddagram | 172 mm in 24 h at Santirbazar (≈5-year level 124 mm); 176 mm in 24 h at Udaipur for the Gumti |
| Sylhet, Jun 2024 | 13 Jun 18:00 | 16 Jun 06:00 | 18 Jun 18:00 | Extreme rain over Meghalaya; Surma flow above its 5-year level on 19–20 Jun |
| Jamuna, Jul 2024 | 30 Jun 24:00 | 1 Jul 24:00 | 3 Jul 24:00 | Brahmaputra–Jamuna flow above its 5-year flood flow |
| Chattogram, Jul 2026 | 5 Jul 06:00 | 8 Jul 18:00 | 10 Jul 06:00 (Hathazari) | 5-day rain over the Halda hills above its 5-year level |

**Chattogram 2026 is a partial miss, and we say so.** Flooding began on 5 July after days of steady rain, high tides, and sluice gates blocked by fish enclosures and salt farms. Agam reached Watch on 5 July but Warning only on 8 July. Rain data cannot see blocked drains, so **residents' "water rising" reports** (Telegram, SMS "PANI") are now a signal: three reports in six hours raise the level to Warning by themselves.

After the rain stops, Danger is held as Warning for 72 h, because flood water stays high.

## 3. 30-year backtest (observations only)

`npm run backtest` runs the engine on every day from 1994 to 2023 for all 24 areas (ERA5, daily, no forecasts, no tides) and checks it against **35 documented area-floods** (11 events). Onset dates come from humanitarian reports (ReliefWeb, OCHA, ADRC, Shelter Cluster) and are approximate.

| | Result |
|---|---|
| **Danger on or before onset** | **20 of 35** area-floods (57%) |
| Danger within 3 days after onset | 4 more (Sylhet Jun 2022) |
| Missed | 11: haor flash flood Mar–Apr 2017; Satkania Aug 2023; Brahmaputra–Jamuna Jul–Aug 2007 (5 areas); Sylhet May 2022 (4 areas) |
| Alarm load | median **0.6 Danger episodes per area per year** |

**Why the misses happen — and what fixes them:**
- **Pre-monsoon flash floods in Sylhet (Apr 2017, May 2022):** ERA5 (~25 km) under-represents extreme rain over the Meghalaya hills. Fix: hourly satellite rain (NASA IMERG) and Indian (IMD) gauges.
- **2007 Brahmaputra:** a basin-wide flood that builds over weeks; our upstream point (Dhubri) and river cell did not cross their 5-year levels in the window. Fix: watch more upstream points in Assam and use GloFAS forecasts in live mode (which the backtest does not use).
- **Very local storms (Satkania 2023):** too small for a 25 km grid.

The "0.6 per year" figure is an **upper bound on false alarms**, not a false-alarm rate: we do not have a complete list of every local flood since 1994, and some of those episodes were real floods.

Full tables: [EVALUATION-results.md](EVALUATION-results.md).

## 4. Can we learn travel times from data? (No — and that is useful to know)

`npm run travel-times` looked for the delay between upstream rain and river rises over 30 monsoons. Every river came out at "0 days": daily ERA5 + GloFAS cannot resolve travel times (the river cell responds to same-day regional rain). **Travel times therefore stay labelled "estimate" in the app** until they are checked against BWDB hourly water-level records — the first task of a pilot. ([travel-times-check.json](travel-times-check.json))

## 5. Alert-writing safety checks

Every AI-written alert is checked automatically (`validateAlert` in `src/lib/alerts.ts`):

1. The alert level word is present in the SMS and the voice script.
2. The area name is present in both.
3. No numbers appear that are not in the verified facts.
4. The SMS is at most 200 characters (3 Bangla SMS segments).
5. 999 is included for Warning and Danger.
6. The checklist has at least 3 actions.
7. The voice call names the sender — the local disaster-management committee.

If any check fails twice, the verified template is sent and the officer sees why. Then a human approves (one officer, or two for Danger if the two-person rule is on).

## 6. Comprehension in the field

The `/field-test` page plays the alert to a resident, asks six questions in Bangla (what, when, what to do, who sent it, clarity, trust) and stores the answers anonymously. Officers download the results as CSV. **Target: ≥ 80% of residents answer the first four questions correctly.** Protocol: [FIELD-TEST.md](FIELD-TEST.md).

## Limitations (stated honestly)

- **Hourly data in replays and live mode; daily data in the 30-year backtest** (30 years of hourly data is too large for the free API).
- **Two rain datasets:** thresholds and the backtest use ERA5 (a consistent 30-year record); replays and live mode use the near-real-time model analysis with thresholds scaled by a bias factor estimated over 2020–2023.
- **Tide thresholds** come from only 2.5 years (Jul 2023 – Dec 2025) of modelled sea level.
- **Coarse grids:** ERA5 (~25 km) smooths local cloudbursts; GloFAS does not resolve small rivers, so flash-flood areas rely on rain, tides and community reports.
- **Travel times** are estimates (see §4).
- **Ground truth** is limited to documented events with approximate onset dates.
