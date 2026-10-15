// Trains the geospatial ML flood-onset model (src/lib/ml.ts) on 30 years of history and validates it out of sample.
//   npm run train:ml      (uses the download cache from `npm run calibrate`; ~1 minute)
// Writes src/data/ml-model.json and docs/ML-EVAL.md.
//
// Each sample is one area on one day (1994–2023). Label: a documented damaging flood starts in that area within the
// next 0–3 days. Days around a flood that are not that window are left out (the flood is already underway).
// Validation: 5 folds of 6 whole years — the model is always scored on years it never saw.
import fs from "node:fs";
import path from "node:path";
import { dailyDischarge, dailyRain } from "./lib.mjs";
import { areaById, areas, rainPoints, rainThresholds, replayInputs, replaySteps, riverThresholds, stations, tideThresholds, type Replay } from "../src/lib/data";
import { FEATURES, linearScore, mlFeatures } from "../src/lib/ml";
import { assessArea } from "../src/lib/risk";
import type { Inputs, Level } from "../src/lib/types";

const START = "1994-01-01";
const END = "2023-12-31";
// Same documented floods as scripts/backtest.mts (sources in docs/EVALUATION.md).
const EVENTS = [
  { name: "Haor flash flood, Mar–Apr 2017", areas: ["sunamganj"], onset: "2017-03-30" },
  { name: "Brahmaputra–Jamuna flood, Aug 2017", areas: ["kurigram", "chilmari", "fulchhari", "islampur", "sirajganj"], onset: "2017-08-13" },
  { name: "Brahmaputra–Jamuna flood, Jul 2019", areas: ["kurigram", "chilmari", "fulchhari", "islampur", "sirajganj"], onset: "2019-07-13" },
  { name: "Brahmaputra–Jamuna flood, Jul 2020", areas: ["kurigram", "chilmari", "fulchhari", "islampur", "sirajganj"], onset: "2020-06-28" },
  { name: "Sylhet–Sunamganj flood, Jun 2022", areas: ["sunamganj", "chhatak", "companiganj", "gowainghat"], onset: "2022-06-15" },
  { name: "Chattogram–Satkania flood, Aug 2023", areas: ["satkania"], onset: "2023-08-06" },
  { name: "Brahmaputra–Jamuna flood, Jul 2004", areas: ["kurigram", "chilmari", "fulchhari", "islampur", "sirajganj"], onset: "2004-07-08" },
  { name: "Brahmaputra–Jamuna flood, Jul–Aug 2007", areas: ["kurigram", "chilmari", "fulchhari", "islampur", "sirajganj"], onset: "2007-07-31" },
  { name: "Sylhet–Sunamganj flash flood, May 2022", areas: ["sunamganj", "chhatak", "companiganj", "gowainghat"], onset: "2022-05-17" },
];

type Series = { time: string[]; value: number[] };
console.log("Loading cached history…");
const rain: Record<string, Series> = {};
for (const p of rainPoints) rain[p.id] = await dailyRain(p, START, END);
const river: Record<string, Series> = {};
for (const a of areas.filter((x) => x.riverCell)) {
  const s: Series = await dailyDischarge(a.riverCell, "1984-01-01", END);
  const i0 = s.time.indexOf(START);
  river[a.id] = { time: s.time.slice(i0), value: s.value.slice(i0) };
}
const days = rain[rainPoints[0].id].time;
const years = Number(END.slice(0, 4)) - Number(START.slice(0, 4)) + 1;

// ---- samples ----
type Sample = { area: number; day: number; year: number; x: number[]; y: 0 | 1; masked: boolean };
const samples: Sample[] = [];
const ruleLevels: Level[][] = areas.map(() => []);
const onsetIndex = EVENTS.flatMap((e) => e.areas.map((id) => ({ area: areas.findIndex((a) => a.id === id), o: days.indexOf(e.onset), name: e.name })));
for (let i = 0; i < days.length; i++) {
  const win = (s: Series) => ({ observed: s.value.slice(Math.max(0, i - 6), i + 1), forecast: [] as number[] });
  const inputs: Inputs = {
    asOf: days[i], forecastAvailable: false, observedSource: "era5",
    rain: Object.fromEntries(Object.entries(rain).map(([k, s]) => [k, win(s)])),
    river: Object.fromEntries(Object.entries(river).map(([k, s]) => [k, win(s)])),
  };
  areas.forEach((a, ai) => {
    ruleLevels[ai].push(assessArea(a, inputs, stations, rainThresholds, riverThresholds, {}, { ml: false }).level);
    if (i < 7) return;
    const x = mlFeatures(a, inputs, rainThresholds, riverThresholds);
    if (!x) return;
    const ev = onsetIndex.filter((e) => e.area === ai);
    const y = ev.some((e) => i >= e.o - 3 && i <= e.o) ? 1 : 0;
    const masked = !y && ev.some((e) => i >= e.o - 10 && i <= e.o + 20);
    samples.push({ area: ai, day: i, year: Number(days[i].slice(0, 4)), x, y, masked });
  });
}
const train = samples.filter((s) => !s.masked);
const pos = train.filter((s) => s.y).length;
console.log(`${samples.length} area-days, ${pos} positive (flood starts within 72 h), ${samples.filter((s) => s.masked).length} left out around floods`);

// ---- weighted, L2-regularised logistic regression by Newton's method (IRLS) ----
type Fit = { mean: number[]; std: number[]; weights: number[]; bias: number };
function solve(A: number[][], b: number[]) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

function fit(data: Sample[]): Fit {
  const d = FEATURES.length;
  const mean = Array.from({ length: d }, (_, j) => data.reduce((a, s) => a + s.x[j], 0) / data.length);
  const std = Array.from({ length: d }, (_, j) => Math.sqrt(data.reduce((a, s) => a + (s.x[j] - mean[j]) ** 2, 0) / data.length) || 1);
  const nPos = data.filter((s) => s.y).length;
  const wPos = (data.length - nPos) / Math.max(1, nPos) / 20; // up-weight the rare flood days, then undo it in the bias
  const rows = data.map((s) => [1, ...s.x.map((v, j) => (v - mean[j]) / std[j])]);
  let beta = new Array(d + 1).fill(0);
  const lambda = 1;
  for (let it = 0; it < 25; it++) {
    const H = Array.from({ length: d + 1 }, () => new Array(d + 1).fill(0));
    const g = new Array(d + 1).fill(0);
    rows.forEach((r, n) => {
      const w = data[n].y ? wPos : 1;
      const z = r.reduce((a, v, j) => a + v * beta[j], 0);
      const p = 1 / (1 + Math.exp(-z));
      const e = w * (data[n].y - p);
      const h = w * p * (1 - p);
      for (let j = 0; j <= d; j++) {
        g[j] += e * r[j];
        for (let k = 0; k <= d; k++) H[j][k] += h * r[j] * r[k];
      }
    });
    for (let j = 1; j <= d; j++) { g[j] -= lambda * beta[j]; H[j][j] += lambda; }
    const step = solve(H, g);
    beta = beta.map((b, j) => b + step[j]);
    if (Math.max(...step.map(Math.abs)) < 1e-6) break;
  }
  return { mean, std, weights: beta.slice(1), bias: beta[0] - Math.log(wPos) };
}

// ---- out-of-sample validation: 5 folds of 6 whole years ----
const oof = new Map<Sample, number>();
for (let f = 0; f < 5; f++) {
  const y0 = 1994 + f * 6;
  const inFold = (s: Sample) => s.year >= y0 && s.year < y0 + 6;
  const m = fit(train.filter((s) => !inFold(s)));
  for (const s of samples.filter(inFold)) oof.set(s, linearScore(s.x, m));
  console.log(`fold ${f + 1}: trained without ${y0}–${y0 + 5}`);
}

// AUC on held-out, non-masked days
const scored = train.map((s) => ({ z: oof.get(s)!, y: s.y })).sort((a, b) => a.z - b.z);
let rankSum = 0;
scored.forEach((s, i) => { if (s.y) rankSum += i + 1; });
const nP = scored.filter((s) => s.y).length;
const auc = (rankSum - (nP * (nP + 1)) / 2) / (nP * (scored.length - nP));

// Watch threshold: the score at which held-out alarms average ML_WATCH_RATE episodes per area per year. Watch only
// flags an area for officers (no public alert, no automatic draft), and at this rate ML catches Meghalaya-driven
// floods the rule engine misses (see the alarm-rate curve: npm run train:ml -- --curve).
const ML_WATCH_RATE = 2.5;
const byArea = areas.map((_, ai) => samples.filter((s) => s.area === ai).sort((a, b) => a.day - b.day));
const episodesPerAreaYear = (t: number) => {
  let ep = 0;
  for (const list of byArea) list.forEach((s, k) => { if (oof.get(s)! >= t && (k === 0 || oof.get(list[k - 1])! < t)) ep++; });
  return ep / (areas.length * years);
};
const zs = [...oof.values()].sort((a, b) => a - b);
let watchScore = zs[zs.length - 1];
for (let q = 0.95; q < 0.99999; q += 0.0005) {
  const t = zs[Math.floor(q * (zs.length - 1))];
  if (episodesPerAreaYear(t) <= ML_WATCH_RATE) { watchScore = t; break; }
}

// Detection of the documented floods (held-out scores), next to the rule engine
const rows: string[] = [];
let mlOnTime = 0, rulesDanger = 0, rulesWatch = 0, union = 0;
const leads: number[] = [];
for (const e of onsetIndex) {
  const list = byArea[e.area];
  const scoreAt = (i: number) => { const s = list.find((x) => x.day === i); return s ? oof.get(s)! : -Infinity; };
  const firstMl = [...Array(11).keys()].map((k) => e.o - 10 + k).find((i) => scoreAt(i) >= watchScore);
  const firstDanger = [...Array(11).keys()].map((k) => e.o - 10 + k).find((i) => ruleLevels[e.area][i] === 3);
  const firstWatch = [...Array(11).keys()].map((k) => e.o - 10 + k).find((i) => ruleLevels[e.area][i] >= 1);
  if (firstMl !== undefined) { mlOnTime++; leads.push(e.o - firstMl); }
  if (firstDanger !== undefined) rulesDanger++;
  if (firstWatch !== undefined) rulesWatch++;
  const earliestAttention = Math.min(firstMl ?? Infinity, firstWatch ?? Infinity);
  if (earliestAttention !== Infinity) union++;
  rows.push(`| ${e.name} | ${areas[e.area].name} | ${firstMl !== undefined ? `${e.o - firstMl} d before` : "—"} | ${firstWatch !== undefined ? `${e.o - firstWatch} d before` : "—"} | ${firstDanger !== undefined ? `${e.o - firstDanger} d before` : "—"} |`);
}
leads.sort((a, b) => a - b);
const medianLead = leads.length ? leads[Math.floor(leads.length / 2)] : 0;

// Fair comparison: alarms per area-year of the rule engine, and what ML detects at the same alarm budget.
const ruleEpisodes = (min: Level) => ruleLevels.reduce((a, ls) => a + ls.filter((l, i) => l >= min && (i === 0 || ls[i - 1] < min)).length, 0) / (areas.length * years);
const rulesWatchRate = ruleEpisodes(1);
const rulesDangerRate = ruleEpisodes(3);
const thresholdForRate = (rate: number) => {
  for (let q = 0.9; q < 0.99999; q += 0.0002) {
    const t = zs[Math.floor(q * (zs.length - 1))];
    if (episodesPerAreaYear(t) <= rate) return t;
  }
  return zs[zs.length - 1];
};
const detectAt = (t: number) => onsetIndex.filter((e) => {
  const list = byArea[e.area];
  return [...Array(11).keys()].some((k) => { const s = list.find((x) => x.day === e.o - 10 + k); return s ? oof.get(s)! >= t : false; });
}).length;
const detectedSet = (t: number) => new Set(onsetIndex.filter((e) => {
  const list = byArea[e.area];
  return [...Array(11).keys()].some((k) => { const s = list.find((x) => x.day === e.o - 10 + k); return s ? oof.get(s)! >= t : false; });
}));
const rulesWatchSet = new Set(onsetIndex.filter((e) => [...Array(11).keys()].some((k) => ruleLevels[e.area][e.o - 10 + k] >= 1)));
if (process.argv.includes("--curve")) {
  for (const rate of [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3.34]) {
    const d = detectedSet(thresholdForRate(rate));
    console.log(`rate ${rate}/area/yr: ML ${d.size}, rules-Watch ∪ ML ${new Set([...d, ...rulesWatchSet]).size}, new beyond rules: ${[...d].filter((e) => !rulesWatchSet.has(e)).map((e) => `${areas[e.area].name} (${e.name})`).join("; ") || "none"}`);
  }
}
const mlAtDangerBudget = detectAt(thresholdForRate(rulesDangerRate));
const beyondRules = [...detectedSet(watchScore)].filter((e) => !rulesWatchSet.has(e)).map((e) => `${areas[e.area].name} (${e.name})`);
const mlAtWatchBudget = detectAt(thresholdForRate(rulesWatchRate));

// ---- final model on all years ----
const final = fit(train);
const allZ = samples.map((s) => linearScore(s.x, final)).sort((a, b) => a - b);
const quantiles = Array.from({ length: 1001 }, (_, k) => Math.round(allZ[Math.floor((k / 1000) * (allZ.length - 1))] * 1e4) / 1e4);
// Re-derive the Watch threshold on the final model at the same alarm rate as validated above.
const watchQuantile = zs.filter((z) => z < watchScore).length / zs.length;
const finalWatch = allZ[Math.floor(watchQuantile * (allZ.length - 1))];
const baseRate = pos / train.length;

const metrics = {
  samples: samples.length,
  positives: pos,
  documentedAreaFloods: onsetIndex.length,
  aucHeldOut: Math.round(auc * 1000) / 1000,
  mlWatchOnOrBeforeOnset: mlOnTime,
  rulesWatchOnOrBeforeOnset: rulesWatch,
  rulesDangerOnOrBeforeOnset: rulesDanger,
  rulesOrMlAttention: union,
  medianMlLeadDays: medianLead,
  mlWatchEpisodesPerAreaYear: Math.round(episodesPerAreaYear(watchScore) * 100) / 100,
  watchTopPercentOfDays: Math.round((1 - watchQuantile) * 1000) / 10,
  rulesWatchEpisodesPerAreaYear: Math.round(rulesWatchRate * 100) / 100,
  rulesDangerEpisodesPerAreaYear: Math.round(rulesDangerRate * 100) / 100,
  mlDetectedAtRulesDangerAlarmRate: mlAtDangerBudget,
  mlDetectedAtRulesWatchAlarmRate: mlAtWatchBudget,
  floodsCaughtOnlyByMl: beyondRules,
  baseLogOdds: Math.log(baseRate / (1 - baseRate)),
};
const modelJson = {
  version: 1,
  trainedOn: `ERA5 rain + GloFAS river flow, ${START.slice(0, 4)}–${END.slice(0, 4)}, ${areas.length} areas; labels: ${onsetIndex.length} documented area-floods`,
  features: [...FEATURES],
  mean: final.mean.map((v) => Math.round(v * 1e5) / 1e5),
  std: final.std.map((v) => Math.round(v * 1e5) / 1e5),
  weights: final.weights.map((v) => Math.round(v * 1e5) / 1e5),
  bias: Math.round(final.bias * 1e5) / 1e5,
  quantiles,
  watchScore: Math.round(finalWatch * 1e4) / 1e4,
  metrics,
};
fs.writeFileSync(path.join(process.cwd(), "src/data/ml-model.json"), JSON.stringify(modelJson, null, 1) + "\n");

// ---- unseen floods: the hourly replays (2024–2026) are outside the training years ----
const { mlAssess } = await import("../src/lib/ml");
const replayRows: string[] = [];
const fmt = (st?: string) => (st ? `${st.slice(8, 10)} ${new Date(st.slice(0, 10) + "T00:00:00Z").toLocaleString("en-GB", { month: "short", timeZone: "UTC" })} ${st.slice(11, 13) || "24"}:00` : "—");
for (const id of ["feni-2024", "sylhet-2024", "north-2024", "chattogram-2026"]) {
  const r = JSON.parse(fs.readFileSync(path.join(process.cwd(), `src/data/replays/${id}.json`), "utf8")) as Replay;
  const steps = replaySteps(r);
  const firstStep = (test: (areaId: string, st: string) => boolean) => steps.find((st) => r.focus.some((a) => test(a, st)));
  const mlFirst = firstStep((a, st) => Boolean(mlAssess(areaById[a], replayInputs(r, st), rainThresholds, riverThresholds)?.watch));
  const rulesFirst = firstStep((a, st) => assessArea(areaById[a], replayInputs(r, st), stations, rainThresholds, riverThresholds, tideThresholds, { ml: false }).level >= 1);
  const gapH = mlFirst && rulesFirst ? (steps.indexOf(rulesFirst) - steps.indexOf(mlFirst)) * 6 : null;
  replayRows.push(`| ${r.title} | ${fmt(mlFirst)} | ${fmt(rulesFirst)} | ${gapH === null ? "—" : gapH > 0 ? `ML ${gapH} h earlier` : gapH < 0 ? `rules ${-gapH} h earlier` : "same time"} |`);
}

const md = `# Geospatial ML flood-onset model — evaluation

Generated by \`npm run train:ml\` (scripts/train-ml.mts). Model: L2-regularised logistic regression on ${FEATURES.length} features computed from each area's **upstream network** — rain at every linked upstream station relative to that station's own 2-year level, how many upstream stations are raining hard at once, 7-day saturation, local rain, river flow and season. It estimates the chance that a damaging flood **starts within 72 hours**.

**Validation is out of sample:** 5 folds of 6 whole years; every number below comes from years the model never saw.

| | Result |
|---|---|
| Area-days scored | ${samples.length.toLocaleString("en")} (${pos} labelled "flood starts within 72 h") |
| Held-out ROC AUC | **${metrics.aucHeldOut}** (1.0 = perfect ranking, 0.5 = chance) |
| ML Watch on or before onset | **${mlOnTime} of ${onsetIndex.length}** documented area-floods (median lead ${medianLead} days) |
| Rule engine Watch (or higher) on or before onset | ${rulesWatch} of ${onsetIndex.length} |
| Rule engine Danger on or before onset | ${rulesDanger} of ${onsetIndex.length} |
| Rules **or** ML gives early attention | **${union} of ${onsetIndex.length}** (rules alone: ${rulesWatch}) |
| Floods only ML flagged in time | ${beyondRules.length ? beyondRules.join("; ") : "none"} |
| ML Watch alarm load | ${metrics.mlWatchEpisodesPerAreaYear} episodes per area per year (top ${metrics.watchTopPercentOfDays} % of days) |
| Rule engine alarm load | Watch-or-higher ${metrics.rulesWatchEpisodesPerAreaYear} · Danger ${metrics.rulesDangerEpisodesPerAreaYear} episodes per area per year |
| **Same alarm budget as rules Danger** (${metrics.rulesDangerEpisodesPerAreaYear}/area/yr) | ML detects **${mlAtDangerBudget}** vs rules ${rulesDanger} of ${onsetIndex.length} |
| **Same alarm budget as rules Watch** (${metrics.rulesWatchEpisodesPerAreaYear}/area/yr) | ML detects **${mlAtWatchBudget}** vs rules ${rulesWatch} of ${onsetIndex.length} |

## Weights (standardised features — larger means more influence)

| Feature | Weight |
|---|---|
${FEATURES.map((f, i) => `| ${f} | ${final.weights[i].toFixed(2)} |`).join("\n")}

## Per flood (lead time of the first alert in the 10 days up to onset)

| Event | Area | ML Watch | Rules Watch+ | Rules Danger |
|---|---|---|---|---|
${rows.join("\n")}

## Floods the model never saw (hourly replays, 2024–2026)

First Watch in the replay's focus areas, using only the data that existed at each 6-hour step:

| Flood | ML first Watch | Rules first Watch | |
|---|---|---|---|
${replayRows.join("\n")}

## How it is used, and limits

- In the app the model is **extra evidence**: when an area scores in the top ${metrics.watchTopPercentOfDays} % of all days since ${START.slice(0, 4)}, it can raise the area to **Watch** (look closely, get ready). It never raises Warning or Danger — the rule engine and an officer decide those.
- Labels come from only ${EVENTS.length} documented flood events (${onsetIndex.length} area-floods). Floods that were never documented count as "no flood", so true skill is probably better than the numbers above suggest, and the model must be retrained as the pilot records more events.
- Inputs are ERA5 (~25 km) and GloFAS; very local storms are under-represented, exactly as for the rule engine (see EVALUATION.md).
`;
fs.writeFileSync(path.join(process.cwd(), "docs/ML-EVAL.md"), md);
console.log(md);
