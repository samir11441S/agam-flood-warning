// Derives local flood thresholds from history: 30 years of rainfall (ERA5 via Open-Meteo)
// and 40 years of river discharge (GloFAS via Open-Meteo). Writes src/data/thresholds.json.
import fs from "node:fs";
import path from "node:path";
import { ROOT, geo, rainPoints, dailyRain, dailyDischarge, rollingSum, annualMaxima, quantile, fetchJson } from "./lib.mjs";

async function modelDailyRain(pt, start, end) {
  const url = `https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=${pt.lat}&longitude=${pt.lon}&daily=precipitation_sum&start_date=${start}&end_date=${end}&timezone=Asia%2FDhaka`;
  const j = await fetchJson(url, `model_${pt.lat}_${pt.lon}_${start}_${end}`);
  return j.daily.precipitation_sum.filter((v) => v != null);
}

const RAIN_START = "1994-01-01";
const RAIN_END = "2023-12-31";
const Q_START = "1984-01-01";
const Q_END = "2023-12-31";

const round = (v) => Math.round(v * 10) / 10;

function returnLevels(sortedMaxima) {
  return { r2: round(quantile(sortedMaxima, 0.5)), r5: round(quantile(sortedMaxima, 0.8)), r10: round(quantile(sortedMaxima, 0.9)) };
}

const out = { generatedAt: new Date().toISOString(), source: {
  rain: `Open-Meteo Historical Weather API (models=era5, ERA5 reanalysis), daily precipitation ${RAIN_START}..${RAIN_END}`,
  discharge: `Open-Meteo Flood API (GloFAS v4 reanalysis), daily river discharge ${Q_START}..${Q_END}`,
  method: "Annual-maximum series; r2/q2 = median annual max (≈2-year return level), r5/q5 = 80th percentile (≈5-year), r10/q10 = 90th percentile (≈10-year). modelScale = p99(forecast-model daily rain) / p99(ERA5 daily rain) over 2020–2023 (Open-Meteo Historical Forecast API), clamped to 0.5–4; multiply rain thresholds by it when comparing forecast-model data.",
}, rain: {}, river: {}, tide: {} };

// Forecast models and ERA5 have different rain climatologies (ERA5 badly under-represents
// orographic extremes such as Meghalaya). Thresholds applied to model data are scaled by the
// ratio of the two datasets' 99th-percentile daily rain over the 2020–2023 overlap.
const OVERLAP_START = "2020-01-01";
const OVERLAP_END = "2023-12-31";
const p99 = (values) => quantile([...values].sort((a, b) => a - b), 0.99);

for (const pt of rainPoints()) {
  console.log("rain", pt.id);
  const s = await dailyRain(pt, RAIN_START, RAIN_END);
  const d3 = { time: s.time, value: rollingSum(s.value, 3) };
  const d5 = { time: s.time, value: rollingSum(s.value, 5) };
  const overlapEra5 = s.value.filter((_, i) => s.time[i] >= OVERLAP_START);
  const model = await modelDailyRain(pt, OVERLAP_START, OVERLAP_END);
  const modelScale = Math.min(4, Math.max(0.5, Math.round((p99(model) / Math.max(1, p99(overlapEra5))) * 100) / 100));
  out.rain[pt.id] = { d1: returnLevels(annualMaxima(s)), d3: returnLevels(annualMaxima(d3)), d5: returnLevels(annualMaxima(d5)), modelScale };
}

for (const a of geo.areas.filter((a) => a.riverCell)) {
  console.log("river", a.id);
  const s = await dailyDischarge(a.riverCell, Q_START, Q_END);
  const levels = returnLevels(annualMaxima(s));
  out.river[a.id] = { q2: levels.r2, q5: levels.r5, q10: levels.r10, mean: round(s.value.reduce((x, y) => x + y, 0) / s.value.length) };
}

// Tide: daily highest sea level (tide + surge) at each river mouth, Jul 2023 – Dec 2025 (Open-Meteo Marine API).
out.source.tide = "Open-Meteo Marine API sea_level_height_msl, hourly 2023-07-01..2025-12-31; p95/p99 of daily maxima";
for (const a of geo.areas.filter((x) => x.tideCell)) {
  console.log("tide", a.id);
  const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${a.tideCell.lat}&longitude=${a.tideCell.lon}&hourly=sea_level_height_msl&start_date=2023-07-01&end_date=2025-12-31&timezone=Asia%2FDhaka`;
  const j = await fetchJson(url, `tide_${a.tideCell.lat}_${a.tideCell.lon}_2023-07-01_2025-12-31`);
  const maxByDay = new Map();
  j.hourly.time.forEach((t, i) => {
    const v = j.hourly.sea_level_height_msl[i];
    if (v == null) return;
    const d = t.slice(0, 10);
    maxByDay.set(d, Math.max(maxByDay.get(d) ?? -Infinity, v));
  });
  const sorted = [...maxByDay.values()].sort((x, y) => x - y);
  out.tide[a.id] = { p95: Math.round(quantile(sorted, 0.95) * 100) / 100, p99: Math.round(quantile(sorted, 0.99) * 100) / 100 };
}

fs.writeFileSync(path.join(ROOT, "src/data/thresholds.json"), JSON.stringify(out, null, 2));
console.log("wrote src/data/thresholds.json");
