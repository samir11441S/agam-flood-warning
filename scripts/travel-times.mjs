// Learns how long upstream rain takes to show up as a river rise, from 30 years of data (1994–2023, monsoon months):
// for each area with a river cell, the lag (in days) that best correlates upstream daily rain with the daily rise
// in river flow. Writes docs/travel-times-check.json and prints a comparison with the hand estimates in geo.json.
// Result (2026-10): every lag came out 0 days — daily ERA5 + GloFAS cannot resolve travel times (the river cell
// responds to same-day regional rain). Travel times therefore stay labelled as estimates until checked against
// BWDB hourly water-level records.
import fs from "node:fs";
import path from "node:path";
import { ROOT, geo, dailyRain, dailyDischarge } from "./lib.mjs";

const START = "1994-01-01";
const END = "2023-12-31";
const MAX_LAG = 6;

function corr(a, b) {
  const n = a.length;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db);
}

const stations = Object.fromEntries(geo.stations.map((s) => [s.id, s]));
const out = { method: `Lag (days, 0–${MAX_LAG}) maximising the correlation between upstream daily rain and the daily rise in GloFAS river flow, June–September ${START.slice(0, 4)}–${END.slice(0, 4)}.`, areas: {} };

for (const area of geo.areas.filter((a) => a.riverCell)) {
  const q = await dailyDischarge(area.riverCell, "1984-01-01", END);
  const qByDate = new Map(q.time.map((t, i) => [t, q.value[i]]));
  for (const up of area.upstream) {
    const r = await dailyRain(stations[up.station], START, END);
    const scores = [];
    for (let lag = 0; lag <= MAX_LAG; lag++) {
      const xs = [], ys = [];
      for (let i = 1 + lag; i < r.time.length; i++) {
        const month = Number(r.time[i].slice(5, 7));
        if (month < 6 || month > 9) continue;
        const today = qByDate.get(r.time[i]);
        const yesterday = qByDate.get(r.time[i - 1]);
        if (today === undefined || yesterday === undefined) continue;
        xs.push(r.value[i - lag]);
        ys.push(today - yesterday);
      }
      scores.push(corr(xs, ys));
    }
    const best = scores.indexOf(Math.max(...scores));
    out.areas[area.id] = { station: up.station, learnedDays: best, correlation: Math.round(scores[best] * 100) / 100, estimatedHours: up.hours };
    console.log(`${area.name.padEnd(16)} ← ${stations[up.station].name.padEnd(26)} learned lag ≈ ${best} day(s) (r=${scores[best].toFixed(2)})   hand estimate ${up.hours[0]}–${up.hours[1]} h`);
  }
}
fs.writeFileSync(path.join(ROOT, "docs/travel-times-check.json"), JSON.stringify(out, null, 2));
console.log("wrote docs/travel-times-check.json");
