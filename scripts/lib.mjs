import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const geo = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/geo.json"), "utf8"));
const CACHE = path.join(ROOT, "scripts/.cache");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Open-Meteo's free tier rate-limits bursts, so every response is cached on disk and 429s back off.
export async function fetchJson(url, cacheKey) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, cacheKey.replace(/[^a-z0-9_.-]/gi, "_") + ".json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  for (let attempt = 0; attempt < 30; attempt++) {
    // Commercial use: set OPEN_METEO_API_KEY to use Open-Meteo's paid "customer-" servers.
    const key = process.env.OPEN_METEO_API_KEY;
    const u = new URL(url);
    if (key) { u.hostname = `customer-${u.hostname}`; u.searchParams.set("apikey", key); }
    const res = await fetch(u.toString());
    if (res.status === 429) {
      const wait = Math.min(300_000, 30_000 * (attempt + 1));
      console.log(`  rate-limited, waiting ${wait / 1000}s...`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const json = await res.json();
    fs.writeFileSync(file, JSON.stringify(json));
    await sleep(3000);
    return json;
  }
  throw new Error("gave up after repeated rate limits: " + url);
}

export function rainPoints() {
  const pts = geo.stations.map((s) => ({ id: s.id, lat: s.lat, lon: s.lon }));
  for (const a of geo.areas) pts.push({ id: `local:${a.id}`, lat: a.lat, lon: a.lon });
  return pts;
}

// Pinned to ERA5: the archive's default "best_match" silently switches to ECMWF IFS for recent
// years, which would mix two rain climatologies in one threshold.
export async function dailyRain(pt, start, end) {
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${pt.lat}&longitude=${pt.lon}&daily=precipitation_sum&start_date=${start}&end_date=${end}&timezone=Asia%2FDhaka&models=era5`;
  const j = await fetchJson(url, `era5_${pt.lat}_${pt.lon}_${start}_${end}`);
  return { time: j.daily.time, value: j.daily.precipitation_sum.map((v) => v ?? 0) };
}

export async function dailyDischarge(cell, start, end) {
  const url = `https://flood-api.open-meteo.com/v1/flood?latitude=${cell.lat}&longitude=${cell.lon}&daily=river_discharge&start_date=${start}&end_date=${end}`;
  const j = await fetchJson(url, `q_${cell.lat}_${cell.lon}_${start}_${end}`);
  return { time: j.daily.time, value: j.daily.river_discharge.map((v) => v ?? 0) };
}

export function rollingSum(values, n) {
  return values.map((_, i) => values.slice(Math.max(0, i - n + 1), i + 1).reduce((a, b) => a + b, 0));
}

export function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function annualMaxima(series) {
  const byYear = new Map();
  series.time.forEach((t, i) => {
    const y = t.slice(0, 4);
    byYear.set(y, Math.max(byYear.get(y) ?? 0, series.value[i]));
  });
  return [...byYear.values()].sort((a, b) => a - b);
}
