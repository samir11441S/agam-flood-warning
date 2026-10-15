// Geospatial ML flood-onset model. A small, explainable logistic regression trained on 30 years of ERA5 rain and
// 40 years of GloFAS river flow (scripts/train-ml.mts) to estimate how likely a damaging flood is to START in an
// area within the next 72 hours, from the state of its whole upstream network. It is extra evidence next to the
// rule engine: it can raise an area to Watch, never to Warning or Danger.
import model from "@/data/ml-model.json";
import type { Area, Inputs, RainThreshold, RiverThreshold } from "./types";

export const FEATURES = ["upstream_24h", "upstream_72h", "upstream_5d", "upstream_extent", "antecedent_7d", "local_72h", "river", "season_sin", "season_cos"] as const;

/** Human-readable names for the dashboard. */
export const FEATURE_LABELS: Record<(typeof FEATURES)[number], string> = {
  upstream_24h: "heaviest 24 h rain upstream",
  upstream_72h: "heaviest 72 h rain upstream",
  upstream_5d: "heaviest 5-day rain upstream",
  upstream_extent: "share of upstream stations raining hard",
  antecedent_7d: "7-day rain upstream (soil already wet)",
  local_72h: "local 72 h rain",
  river: "river flow",
  season_sin: "time of year",
  season_cos: "time of year",
};

export type MlModel = {
  version: number;
  trainedOn: string;
  features: string[];
  mean: number[];
  std: number[];
  weights: number[];
  bias: number;
  /** Scores of all historical area-days, sorted ascending, sampled at 1001 points (for "top x % of days"). */
  quantiles: number[];
  /** Score above which the model raises Watch. */
  watchScore: number;
  metrics: Record<string, unknown>;
};

const MODEL = model as MlModel;
export const mlModel = MODEL;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const last = (xs: number[], n: number) => xs.slice(Math.max(0, xs.length - n));
/** Ratios are compressed so one extreme storm does not dominate the linear model. */
const squash = (r: number) => Math.log1p(Math.min(Math.max(r, 0), 10));

function dayOfYear(asOf: string) {
  const d = Date.parse(asOf.slice(0, 10) + "T00:00:00Z");
  return Math.floor((d - Date.UTC(new Date(d).getUTCFullYear(), 0, 1)) / 86_400_000);
}

/**
 * The model's inputs for one area from the same Inputs the rule engine reads (live, replay or backtest).
 * Every rain amount is divided by that place's own 2-year level, so a number means "how unusual here".
 */
export function mlFeatures(area: Area, inputs: Inputs, rainT: Record<string, RainThreshold>, riverT: Record<string, RiverThreshold>): number[] | null {
  const scaleOf = (t: RainThreshold) => (inputs.observedSource === "model" ? t.modelScale : 1);
  const ups = area.upstream
    .map((u) => ({ s: inputs.rain[u.station], t: rainT[u.station] }))
    .filter((x): x is { s: Inputs["rain"][string]; t: RainThreshold } => Boolean(x.s && x.t && x.s.observed.length));
  if (!ups.length) return null;
  const r = ups.map(({ s, t }) => {
    const k = scaleOf(t);
    return {
      d1: sum(last(s.observed, 1)) / (t.d1.r2 * k),
      d3: sum(last(s.observed, 3)) / (t.d3.r2 * k),
      d5: sum(last(s.observed, 5)) / (t.d5.r2 * k),
      a7: sum(last(s.observed, 7)) / (t.d5.r2 * k * 1.4),
    };
  });
  const local = inputs.rain[`local:${area.id}`];
  const localT = rainT[`local:${area.id}`];
  const localR = local && localT ? sum(last(local.observed, 3)) / (localT.d3.r2 * scaleOf(localT)) : 0;
  const q = inputs.river[area.id];
  const qt = riverT[area.id];
  const riverR = q && qt && q.observed.length ? last(q.observed, 1)[0] / qt.q2 : 0;
  const doy = dayOfYear(inputs.asOf);
  return [
    squash(Math.max(...r.map((x) => x.d1))),
    squash(Math.max(...r.map((x) => x.d3))),
    squash(Math.max(...r.map((x) => x.d5))),
    r.filter((x) => x.d3 >= 0.7).length / r.length,
    squash(Math.max(...r.map((x) => x.a7))),
    squash(localR),
    squash(riverR),
    Math.sin((2 * Math.PI * doy) / 365.25),
    Math.cos((2 * Math.PI * doy) / 365.25),
  ];
}

/** Linear score (log-odds) for standardised features with the given weights. */
export function linearScore(x: number[], m: Pick<MlModel, "mean" | "std" | "weights" | "bias">) {
  let z = m.bias;
  for (let i = 0; i < x.length; i++) z += m.weights[i] * ((x[i] - m.mean[i]) / m.std[i]);
  return z;
}

export type MlResult = {
  /** Share of historical area-days (1994–2023) with a lower score, 0–100. */
  percentile: number;
  /** How many times the usual chance of a flood starting within 72 h. */
  relativeRisk: number;
  watch: boolean;
  /** The inputs that pushed the score up most. */
  drivers: { feature: string; label: string }[];
};

/** The relative risk at which the model raises Watch (for the evidence bar on the dashboard). */
export const mlWatchRelativeRisk = () => Math.round(Math.exp(MODEL.watchScore - Number(MODEL.metrics.baseLogOdds ?? 0)) * 10) / 10;

/** Scores an area. Null when the model has no upstream data for it. */
export function mlAssess(area: Area, inputs: Inputs, rainT: Record<string, RainThreshold>, riverT: Record<string, RiverThreshold>): MlResult | null {
  const x = mlFeatures(area, inputs, rainT, riverT);
  if (!x || !MODEL.weights.length) return null;
  const z = linearScore(x, MODEL);
  const q = MODEL.quantiles;
  let lo = 0;
  while (lo < q.length - 1 && q[lo + 1] <= z) lo++;
  const percentile = Math.round((lo / (q.length - 1)) * 1000) / 10;
  const contributions = x.map((v, i) => ({ i, c: MODEL.weights[i] * ((v - MODEL.mean[i]) / MODEL.std[i]) })).filter((d) => d.c > 0.3).sort((a, b) => b.c - a.c);
  const seen = new Set<string>();
  const drivers = contributions
    .map((d) => ({ feature: FEATURES[d.i], label: FEATURE_LABELS[FEATURES[d.i]] }))
    .filter((d) => (seen.has(d.label) ? false : (seen.add(d.label), true)))
    .slice(0, 3);
  const baseZ = Number(MODEL.metrics.baseLogOdds ?? 0);
  return { percentile, relativeRisk: Math.round(Math.exp(z - baseZ) * 10) / 10, watch: z >= MODEL.watchScore, drivers };
}
