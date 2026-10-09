import type { Area, Assessment, Inputs, Level, RainThreshold, RiverThreshold, Signal, Station, TideThreshold } from "./types";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const last = (xs: number[], n: number) => xs.slice(Math.max(0, xs.length - n));
const round = (v: number) => Math.round(v);

function rainLevel(d1: number, d3: number, d5: number, t: RainThreshold, scale: "upstream" | "local"): { level: Level; value: number; threshold: number; window: string } {
  const candidates: { level: Level; value: number; threshold: number; window: string }[] = [];
  const check = (value: number, levels: { r2: number; r5: number }, window: string) => {
    if (value >= levels.r5) candidates.push({ level: 3, value, threshold: levels.r5, window });
    else if (value >= levels.r2) candidates.push({ level: 2, value, threshold: levels.r2, window });
    else if (value >= 0.7 * levels.r2) candidates.push({ level: 1, value, threshold: levels.r2, window });
  };
  check(d1, t.d1, "24h");
  check(d3, t.d3, "72h");
  check(d5, t.d5, "5 days");
  if (candidates.length === 0) return { level: 0, value: d3, threshold: t.d3.r2, window: "72h" };
  const best = candidates.reduce((a, b) => (b.level > a.level || (b.level === a.level && b.value / b.threshold > a.value / a.threshold) ? b : a));
  // Local rain alone causes waterlogging more often than flash floods, so it is capped one level lower.
  if (scale === "local") best.level = Math.max(0, best.level - 1) as Level;
  return best;
}

function scaled(t: RainThreshold, f: number): RainThreshold {
  const s = (l: RainThreshold["d1"]) => ({ r2: l.r2 * f, r5: l.r5 * f, r10: l.r10 * f });
  return { d1: s(t.d1), d3: s(t.d3), d5: s(t.d5), modelScale: t.modelScale };
}

function shiftBack(inputs: Inputs, days: number): Inputs {
  const cut = (s: { observed: number[] }) => ({ observed: s.observed.slice(0, s.observed.length - days), forecast: [] });
  return {
    asOf: inputs.asOf,
    observedSource: inputs.observedSource,
    forecastAvailable: false,
    rain: Object.fromEntries(Object.entries(inputs.rain).map(([k, s]) => [k, cut(s)])),
    river: Object.fromEntries(Object.entries(inputs.river).map(([k, s]) => [k, cut(s)])),
  };
}

const HOLD_DAYS = 3;

export function assessArea(
  area: Area,
  inputs: Inputs,
  stations: Record<string, Station>,
  rainT: Record<string, RainThreshold>,
  riverT: Record<string, RiverThreshold>,
  tideT: Record<string, TideThreshold> = {},
): Assessment {
  const now = assessNow(area, inputs, stations, rainT, riverT, tideT);
  // Water keeps rising after the rain stops, so a Danger is held as a Warning for 72 h until an officer gives the all-clear.
  if (now.level < 2) {
    for (let k = 1; k <= HOLD_DAYS; k++) {
      const past = assessNow(area, shiftBack(inputs, k), stations, rainT, riverT, tideT);
      if (past.level === 3) return { ...now, level: 2, heldFromDaysAgo: k };
    }
  }
  return now;
}

function assessNow(
  area: Area,
  inputs: Inputs,
  stations: Record<string, Station>,
  rainT: Record<string, RainThreshold>,
  riverT: Record<string, RiverThreshold>,
  tideT: Record<string, TideThreshold>,
): Assessment {
  const signals: Signal[] = [];
  const forObserved = (t: RainThreshold) => (inputs.observedSource === "model" ? scaled(t, t.modelScale) : t);

  for (const up of area.upstream) {
    const s = inputs.rain[up.station];
    const t = rainT[up.station];
    if (!s || !t) continue;
    const st = stations[up.station];
    const r = rainLevel(sum(last(s.observed, 1)), sum(last(s.observed, 3)), sum(last(s.observed, 5)), forObserved(t), "upstream");
    signals.push({ kind: "upstream_rain", level: r.level, where: st.name, whereBn: st.nameBn, value: round(r.value), threshold: round(r.threshold), unit: "mm", window: r.window, etaHours: up.hours });
    if (inputs.forecastAvailable) {
      const ft = scaled(t, t.modelScale).d3;
      const fc3 = sum(s.forecast.slice(0, 3));
      const level: Level = fc3 >= ft.r5 ? 2 : fc3 >= ft.r2 ? 1 : 0;
      signals.push({ kind: "forecast_rain", level, where: st.name, whereBn: st.nameBn, value: round(fc3), threshold: round(level === 2 ? ft.r5 : ft.r2), unit: "mm", window: "next 72h" });
    }
  }

  const localKey = `local:${area.id}`;
  const local = inputs.rain[localKey];
  const localT = rainT[localKey];
  // Coarse grids can put an upazila in the same data cell as its upstream station: then "local rain"
  // is the same measurement again, so it is not shown or counted twice.
  const sameCellAsUpstream = local && area.upstream.some((u) => {
    const up = inputs.rain[u.station];
    return up && up.observed.length === local.observed.length && up.observed.every((v, i) => v === local.observed[i]);
  });
  if (local && localT && !sameCellAsUpstream) {
    const r = rainLevel(sum(last(local.observed, 1)), sum(last(local.observed, 3)), sum(last(local.observed, 5)), forObserved(localT), "local");
    signals.push({ kind: "local_rain", level: r.level, where: area.name, whereBn: area.nameBn, value: round(r.value), threshold: round(r.threshold), unit: "mm", window: r.window });
  }

  const q = inputs.river[area.id];
  const qt = riverT[area.id];
  if (q && qt && q.observed.length) {
    const horizon = [...last(q.observed, 1), ...q.forecast.slice(0, 5)];
    const peak = Math.max(...horizon);
    const peakDay = horizon.indexOf(peak);
    const level: Level = peak >= qt.q5 ? 3 : peak >= qt.q2 ? 2 : peak >= 0.85 * qt.q2 ? 1 : 0;
    const crossing = horizon.findIndex((v) => v >= qt.q2);
    signals.push({
      kind: "river", level, where: area.river, whereBn: area.riverBn, value: round(peak), threshold: round(peak >= qt.q5 ? qt.q5 : qt.q2), unit: "m³/s",
      window: peakDay === 0 ? "now" : `peak in ${peakDay}d`,
      etaHours: crossing > 0 ? [crossing * 24 - 12, crossing * 24 + 12] : undefined,
    });
  }

  // High tide at the river mouth slows drainage. It never raises an alert by itself.
  const tide = inputs.tide?.[area.id];
  const tideHigh = tide !== undefined && tideT[area.id] !== undefined && tide >= tideT[area.id].p95;
  if (tideHigh) signals.push({ kind: "tide", level: 0, where: `${area.river} mouth`, whereBn: `${area.riverBn} নদীর মোহনা`, value: Math.round(tide * 100) / 100, threshold: tideT[area.id].p95, unit: "m", window: "next 24h" });

  // Residents and volunteers reporting rising water: strong evidence that data can miss (breaches, blocked drains).
  const reported = inputs.reports?.[area.id] ?? 0;
  if (reported > 0) signals.push({ kind: "community", level: reported >= 3 ? 2 : 1, where: area.name, whereBn: area.nameBn, value: reported, threshold: 3, unit: "reports", window: "last 6h" });

  let level = Math.max(0, ...signals.map((s) => s.level)) as Level;

  // Saturated catchment with more rain on the way: escalate one step.
  const wetUpstream = signals.some((s) => s.kind === "upstream_rain" && s.level >= 2);
  const moreComing = signals.some((s) => s.kind === "forecast_rain" && s.level >= 1);
  if (wetUpstream && moreComing && level < 3) level = (level + 1) as Level;
  // Heavy rain arriving while the sea is unusually high: water cannot drain, escalate one step.
  const raining = signals.some((s) => (s.kind === "upstream_rain" || s.kind === "local_rain") && s.level >= 1);
  if (tideHigh && raining && level > 0 && level < 3) level = (level + 1) as Level;

  const driving = signals.filter((s) => s.level === Math.max(...signals.map((x) => x.level)) && s.etaHours);
  const etaHours = level > 0 && driving.length
    ? ([Math.min(...driving.map((s) => s.etaHours![0])), Math.max(...driving.map((s) => s.etaHours![1]))] as [number, number])
    : null;

  signals.sort((a, b) => b.level - a.level || b.value / Math.max(1, b.threshold) - a.value / Math.max(1, a.threshold));
  return { areaId: area.id, level, signals, etaHours };
}
