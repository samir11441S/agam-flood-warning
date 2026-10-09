import geoJson from "@/data/geo.json";
import thresholdsJson from "@/data/thresholds.json";
import type { Area, Inputs, RainThreshold, RiverThreshold, Station, TideThreshold } from "./types";

export const areas = geoJson.areas as Area[];
export const stations = Object.fromEntries((geoJson.stations as Station[]).map((s) => [s.id, s]));
export const areaById = Object.fromEntries(areas.map((a) => [a.id, a]));
export const rainThresholds = thresholdsJson.rain as Record<string, RainThreshold>;
export const riverThresholds = thresholdsJson.river as Record<string, RiverThreshold>;
export const tideThresholds = ((thresholdsJson as { tide?: unknown }).tide ?? {}) as Record<string, TideThreshold>;

export const rainPoints = [
  ...(geoJson.stations as Station[]).map((s) => ({ id: s.id, lat: s.lat, lon: s.lon })),
  ...areas.map((a) => ({ id: `local:${a.id}`, lat: a.lat, lon: a.lon })),
];

export type Replay = {
  id: string;
  title: string;
  titleBn: string;
  focus: string[];
  from: string;
  to: string;
  observedSource?: "era5" | "model";
  rain: Record<string, { dates: string[]; values: number[]; hourly?: { start: string; values: number[] } }>;
  forecast: Record<string, Record<string, number[]>>;
  river: Record<string, { dates: string[]; values: number[] }>;
  tide?: Record<string, { start: string; values: (number | null)[] }>;
};

export function replayDates(r: Replay): string[] {
  const out: string[] = [];
  for (let t = Date.parse(r.from + "T00:00:00Z"); t <= Date.parse(r.to + "T00:00:00Z"); t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** Replay steps every 6 hours: "2024-08-20T06" = using data up to 06:00 local time on 20 Aug ("T24" = end of day). */
export const STEP_HOURS = [6, 12, 18, 24];

export function replaySteps(r: Replay): string[] {
  const hourly = Object.values(r.rain)[0]?.hourly;
  return replayDates(r).flatMap((d) => (hourly ? STEP_HOURS.map((h) => `${d}T${String(h).padStart(2, "0")}`) : [d]));
}

const addDaysIso = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);

/**
 * Inputs as they were known at `asOf`: a date ("2024-08-20" = end of that day) or a 6-hourly step ("2024-08-20T06").
 * With hourly data, "observed" is a series of rolling 24-hour blocks ending exactly at asOf, so the engine's
 * 24 h / 72 h / 5-day windows work unchanged but react within hours instead of at the end of the day.
 */
export function replayInputs(r: Replay, asOf: string): Inputs {
  const [date, hh] = asOf.split("T");
  const hour = hh === undefined ? 24 : Number(hh);
  const fullDays = hour === 24 ? date : addDaysIso(date, -1);
  const upTo = (s: { dates: string[]; values: number[] }, d: string) => s.values.slice(0, s.dates.indexOf(d) + 1).slice(-7);

  const rain: Inputs["rain"] = {};
  for (const [id, s] of Object.entries(r.rain)) {
    let observed: number[];
    if (s.hourly) {
      // Index of the hour that ends at asOf (values are totals of the preceding hour).
      const endTs = Date.parse(`${hour === 24 ? addDaysIso(date, 1) : date}T${String(hour % 24).padStart(2, "0")}:00:00Z`);
      const end = Math.round((endTs - Date.parse(s.hourly.start + ":00Z")) / 3600_000);
      observed = [];
      for (let k = 6; k >= 0; k--) {
        const to = end - 24 * k;
        if (to - 23 < 0) continue;
        observed.push(Math.round(s.hourly.values.slice(to - 23, to + 1).reduce((a, b) => a + b, 0) * 10) / 10);
      }
    } else {
      observed = upTo(s, date);
    }
    rain[id] = { observed, forecast: r.forecast[id]?.[date] ?? [] };
  }
  // River flow is a daily mean, known only once the day is over.
  const river: Inputs["river"] = {};
  for (const [id, s] of Object.entries(r.river)) river[id] = { observed: upTo(s, fullDays), forecast: [] };
  // Highest tide in the next 24 h (tide tables are predictable in advance, so this is fair to use).
  const tide: Record<string, number> = {};
  for (const [id, s] of Object.entries(r.tide ?? {})) {
    const from = Math.round((Date.parse(`${hour === 24 ? addDaysIso(date, 1) : date}T${String(hour % 24).padStart(2, "0")}:00:00Z`) - Date.parse(s.start + ":00Z")) / 3600_000);
    const next = s.values.slice(Math.max(0, from), from + 24).filter((v): v is number => v !== null);
    if (next.length) tide[id] = Math.max(...next);
  }
  return { asOf, rain, river, tide, forecastAvailable: true, observedSource: r.observedSource ?? "era5" };
}
