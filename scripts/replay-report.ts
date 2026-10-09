// Prints the alert level per area per replay step. Run: npx tsx scripts/replay-report.ts feni-2024 [--steps]
// Levels: 0 normal, 1 watch, 2 warning, 3 danger ("h" = held after Danger). --steps shows every 6 hours.
import fs from "node:fs";
import path from "node:path";
import { areas, rainThresholds, replayDates, replayInputs, replaySteps, riverThresholds, stations, tideThresholds, type Replay } from "../src/lib/data";
import { assessArea } from "../src/lib/risk";

const id = process.argv[2] ?? "feni-2024";
const replay = JSON.parse(fs.readFileSync(path.join(process.cwd(), `src/data/replays/${id}.json`), "utf8")) as Replay;
const focus = areas.filter((a) => replay.focus.includes(a.id));
const steps = process.argv.includes("--steps") ? replaySteps(replay) : replayDates(replay);

console.log("step           " + focus.map((a) => a.id.padEnd(13)).join(""));
for (const d of steps) {
  const inputs = replayInputs(replay, d);
  const row = focus.map((a) => {
    const r = assessArea(a, inputs, stations, rainThresholds, riverThresholds, tideThresholds);
    return `${r.level}${r.heldFromDaysAgo ? "h" : ""}:${r.signals[0]?.value ?? ""}`.padEnd(13);
  });
  console.log(d.padEnd(15) + row.join(""));
}
