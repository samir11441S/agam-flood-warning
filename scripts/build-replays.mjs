// Builds offline replay datasets for past floods. Each day of a replay only exposes data that
// existed on that day: observed rain up to the day (ERA5) and the rain forecast as it was issued
// that day (Open-Meteo Previous Runs API). River forecasts were not archived, so replays use
// observed river discharge only.
import fs from "node:fs";
import path from "node:path";
import { ROOT, geo, rainPoints, fetchJson } from "./lib.mjs";

export const EVENTS = [
  {
    id: "feni-2024", title: "Feni flash flood, August 2024", titleBn: "ফেনী আকস্মিক বন্যা, আগস্ট ২০২৪",
    focus: ["parshuram", "fulgazi", "chhagalnaiya", "feni_sadar", "sonagazi", "burichang", "chauddagram"],
    from: "2024-08-15", to: "2024-08-27",
  },
  {
    id: "sylhet-2024", title: "Sylhet–Sunamganj flood, June 2024", titleBn: "সিলেট-সুনামগঞ্জ বন্যা, জুন ২০২৪",
    focus: ["sunamganj", "chhatak", "companiganj", "gowainghat"],
    from: "2024-06-12", to: "2024-06-26",
  },
  {
    id: "north-2024", title: "Brahmaputra–Jamuna flood, July 2024", titleBn: "ব্রহ্মপুত্র-যমুনা বন্যা, জুলাই ২০২৪",
    focus: ["kurigram", "chilmari", "fulchhari", "islampur", "sirajganj"],
    from: "2024-06-28", to: "2024-07-14",
  },
  {
    id: "chattogram-2026", title: "Chattogram flash flood, July 2026", titleBn: "চট্টগ্রাম আকস্মিক বন্যা, জুলাই ২০২৬",
    focus: ["satkania", "lohagara", "chakaria", "hathazari"],
    from: "2026-06-30", to: "2026-07-14",
  },
];

const addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const chunks = (xs, n) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const r1 = (v) => Math.round((v ?? 0) * 10) / 10;

// "Observed" rain in a replay is the near-real-time model analysis as it was archived at the time
// (what an operator would have seen within hours), not ERA5, which is published ~5 days late.
// It is compared against thresholds scaled by modelScale, exactly like live mode.
async function observedRain(points, start, end) {
  const out = {};
  for (const group of chunks(points, 6)) {
    const url = `https://previous-runs-api.open-meteo.com/v1/forecast?latitude=${group.map((p) => p.lat).join(",")}&longitude=${group.map((p) => p.lon).join(",")}&hourly=precipitation&start_date=${start}&end_date=${addDays(end, 1)}&timezone=Asia%2FDhaka`;
    const res = await fetchJson(url, `replay_hourly_${group[0].id}_${start}_${end}`);
    (Array.isArray(res) ? res : [res]).forEach((r, i) => {
      // Hourly precipitation is the total of the PRECEDING hour, so the 00:00 value belongs to the day before.
      const daily = {};
      r.hourly.time.forEach((t, h) => {
        const day = new Date(Date.parse(t + ":00Z") - 3600_000).toISOString().slice(0, 10);
        daily[day] = (daily[day] ?? 0) + (r.hourly.precipitation[h] ?? 0);
      });
      const dates = Object.keys(daily).sort().filter((d) => d >= start && d <= end);
      out[group[i].id] = {
        dates,
        values: dates.map((d) => r1(daily[d])),
        hourly: { start: r.hourly.time[0], values: r.hourly.precipitation.map(r1) },
      };
    });
  }
  return out;
}

async function issuedForecasts(points, start, end) {
  const out = {};
  const vars = "precipitation_previous_day1,precipitation_previous_day2,precipitation_previous_day3";
  for (const group of chunks(points, 6)) {
    const url = `https://previous-runs-api.open-meteo.com/v1/forecast?latitude=${group.map((p) => p.lat).join(",")}&longitude=${group.map((p) => p.lon).join(",")}&hourly=${vars}&start_date=${start}&end_date=${addDays(end, 3)}&timezone=Asia%2FDhaka`;
    const res = await fetchJson(url, `replay_fc_${group[0].id}_${start}_${end}`);
    (Array.isArray(res) ? res : [res]).forEach((r, i) => {
      const daily = { 1: {}, 2: {}, 3: {} };
      r.hourly.time.forEach((t, h) => {
        for (const k of [1, 2, 3]) {
          const day = t.slice(0, 10);
          daily[k][day] = (daily[k][day] ?? 0) + (r.hourly[`precipitation_previous_day${k}`][h] ?? 0);
        }
      });
      const byIssue = {};
      for (let d = start; d <= end; d = addDays(d, 1)) {
        byIssue[d] = [1, 2, 3].map((k) => r1(daily[k][addDays(d, k)]));
      }
      out[group[i].id] = byIssue;
    });
  }
  return out;
}

async function seaLevel(start, end) {
  const out = {};
  for (const a of geo.areas.filter((x) => x.tideCell)) {
    const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${a.tideCell.lat}&longitude=${a.tideCell.lon}&hourly=sea_level_height_msl&start_date=${start}&end_date=${addDays(end, 2)}&timezone=Asia%2FDhaka`;
    const j = await fetchJson(url, `replay_tide_${a.tideCell.lat}_${a.tideCell.lon}_${start}_${end}`);
    if (j.hourly?.sea_level_height_msl?.some((v) => v != null)) out[a.id] = { start: j.hourly.time[0], values: j.hourly.sea_level_height_msl.map((v) => (v == null ? null : Math.round(v * 100) / 100)) };
  }
  return out;
}

async function observedRiver(start, end) {
  const areas = geo.areas.filter((a) => a.riverCell);
  const url = `https://flood-api.open-meteo.com/v1/flood?latitude=${areas.map((a) => a.riverCell.lat).join(",")}&longitude=${areas.map((a) => a.riverCell.lon).join(",")}&daily=river_discharge&start_date=${start}&end_date=${end}`;
  const res = await fetchJson(url, `replay_q_${start}_${end}`);
  const out = {};
  res.forEach((r, i) => (out[areas[i].id] = { dates: r.daily.time, values: r.daily.river_discharge.map((v) => Math.round(v ?? 0)) }));
  return out;
}

fs.mkdirSync(path.join(ROOT, "src/data/replays"), { recursive: true });
const points = rainPoints();
for (const ev of EVENTS) {
  console.log("event", ev.id);
  const obsStart = addDays(ev.from, -7);
  const replay = {
    id: ev.id, title: ev.title, titleBn: ev.titleBn, focus: ev.focus, from: ev.from, to: ev.to, observedSource: "model",
    rain: await observedRain(points, obsStart, ev.to),
    forecast: await issuedForecasts(points, ev.from, ev.to),
    river: await observedRiver(obsStart, ev.to),
    tide: await seaLevel(obsStart, ev.to),
  };
  fs.writeFileSync(path.join(ROOT, `src/data/replays/${ev.id}.json`), JSON.stringify(replay));
}
console.log("done");
