import { areas, rainPoints } from "./data";
import { om } from "./open-meteo";
import type { Inputs } from "./types";

type DailyResponse = { daily: { time: string[]; river_discharge?: (number | null)[] } };
type HourlyResponse = { hourly: { time: string[]; precipitation: (number | null)[] } };

const PAST_DAYS = 7;
const BLOCKS = 5;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(om(url));
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

/**
 * Live inputs. Rain is hourly: "observed" = rolling 24-hour blocks ending at the current hour in Bangladesh
 * (model analysis), "forecast" = the next three 24-hour blocks. River flow (GloFAS) is daily.
 */
export async function fetchLiveInputs(): Promise<Inputs> {
  const lat = rainPoints.map((p) => p.lat).join(",");
  const lon = rainPoints.map((p) => p.lon).join(",");
  const rainRes = await getJson<HourlyResponse[]>(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=precipitation&past_hours=${BLOCKS * 24}&forecast_hours=72&timezone=Asia%2FDhaka`,
  );
  // Current hour in Bangladesh (UTC+6, no daylight saving). Hourly values are totals of the preceding hour.
  const dhakaNow = new Date(Date.now() + 6 * 3600_000).toISOString();
  const nowHour = `${dhakaNow.slice(0, 13)}:00`;
  const today = nowHour.slice(0, 10);
  const rain: Inputs["rain"] = {};
  rainRes.forEach((r, i) => {
    const v = r.hourly.precipitation.map((x) => x ?? 0);
    const end = r.hourly.time.indexOf(nowHour);
    if (end < 0) throw new Error(`Open-Meteo response does not include the current hour ${nowHour}`);
    const block = (to: number) => Math.round(v.slice(Math.max(0, to - 23), to + 1).reduce((a, b) => a + b, 0) * 10) / 10;
    const observed: number[] = [];
    for (let k = BLOCKS - 1; k >= 0; k--) observed.push(block(end - 24 * k));
    rain[rainPoints[i].id] = { observed, forecast: [1, 2, 3].map((k) => block(end + 24 * k)) };
  });

  const riverAreas = areas.filter((a) => a.riverCell);
  const qRes = await getJson<DailyResponse[]>(
    `https://flood-api.open-meteo.com/v1/flood?latitude=${riverAreas.map((a) => a.riverCell!.lat).join(",")}&longitude=${riverAreas.map((a) => a.riverCell!.lon).join(",")}&daily=river_discharge&past_days=${PAST_DAYS}&forecast_days=7`,
  );
  const river: Inputs["river"] = {};
  qRes.forEach((r, i) => {
    const v = (r.daily.river_discharge ?? []).map((x) => x ?? 0);
    const idx = r.daily.time.indexOf(today);
    river[riverAreas[i].id] = { observed: v.slice(0, idx + 1), forecast: v.slice(idx + 1) };
  });

  const tideAreas = areas.filter((a) => a.tideCell);
  const tide: Record<string, number> = {};
  const tRes = await getJson<{ hourly: { time: string[]; sea_level_height_msl: (number | null)[] } }[]>(
    `https://marine-api.open-meteo.com/v1/marine?latitude=${tideAreas.map((a) => a.tideCell!.lat).join(",")}&longitude=${tideAreas.map((a) => a.tideCell!.lon).join(",")}&hourly=sea_level_height_msl&forecast_days=3&timezone=Asia%2FDhaka`,
  ).catch(() => []);
  tRes.forEach((r, i) => {
    const from = r.hourly.time.indexOf(nowHour);
    const next = r.hourly.sea_level_height_msl.slice(Math.max(0, from), from + 24).filter((v): v is number => v !== null);
    if (from >= 0 && next.length) tide[tideAreas[i].id] = Math.max(...next);
  });

  return { asOf: `${today}T${nowHour.slice(11, 13)}`, rain, river, tide, forecastAvailable: true, observedSource: "model" };
}
