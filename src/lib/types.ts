export type Level = 0 | 1 | 2 | 3;

export const LEVELS = [
  { en: "Normal", bn: "স্বাভাবিক", color: "#3f8f5a" },
  { en: "Watch", bn: "সতর্ক নজর", color: "#d4a017" },
  { en: "Warning", bn: "সতর্কতা", color: "#e0701f" },
  { en: "Danger", bn: "বিপদ", color: "#c62828" },
] as const;

export type Station = { id: string; name: string; nameBn: string; lat: number; lon: number; country: "IN" | "BD" };

export type Area = {
  id: string;
  name: string;
  nameBn: string;
  district: string;
  districtBn: string;
  lat: number;
  lon: number;
  hazard: "flash" | "riverine" | "both";
  river: string;
  riverBn: string;
  upstream: { station: string; hours: [number, number] }[];
  riverCell?: { lat: number; lon: number };
  /** Sea point at the river mouth: high tides slow drainage. */
  tideCell?: { lat: number; lon: number };
};

export type ReturnLevels = { r2: number; r5: number; r10: number };
export type RainThreshold = { d1: ReturnLevels; d3: ReturnLevels; d5: ReturnLevels; modelScale: number };
export type RiverThreshold = { q2: number; q5: number; q10: number; mean: number };
export type TideThreshold = { p95: number; p99: number };

/** Daily values; `observed` ends on the as-of date, `forecast` starts the day after. */
export type PointSeries = { observed: number[]; forecast: number[] };

export type Inputs = {
  asOf: string;
  rain: Record<string, PointSeries>;
  river: Record<string, PointSeries>;
  forecastAvailable: boolean;
  /** ERA5 reanalysis (replays) or forecast-model analysis (live), which need different thresholds. */
  observedSource: "era5" | "model";
  /** Highest sea level (m, tide + surge) expected in the next 24 h at the area's river mouth. */
  tide?: Record<string, number>;
  /** Number of distinct "water rising" reports from residents / volunteers in the last 6 hours (live only). */
  reports?: Record<string, number>;
};

export type SignalKind = "upstream_rain" | "local_rain" | "forecast_rain" | "river" | "tide" | "community";

export type Signal = {
  kind: SignalKind;
  level: Level;
  where: string;
  whereBn: string;
  value: number;
  threshold: number;
  unit: "mm" | "m³/s" | "m" | "reports";
  window: string;
  etaHours?: [number, number];
};

export type Assessment = {
  areaId: string;
  level: Level;
  signals: Signal[];
  etaHours: [number, number] | null;
  heldFromDaysAgo?: number;
};
