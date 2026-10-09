// Prints the evidence behind one area's level on one replay day: npx tsx scripts/explain.ts feni-2024 parshuram 2024-08-20
import fs from "node:fs";
import { areaById, rainThresholds, replayInputs, riverThresholds, stations, tideThresholds, type Replay } from "../src/lib/data";
import { assessArea } from "../src/lib/risk";

const [id, areaId, date] = process.argv.slice(2);
const r = JSON.parse(fs.readFileSync(`src/data/replays/${id}.json`, "utf8")) as Replay;
const a = assessArea(areaById[areaId], replayInputs(r, date), stations, rainThresholds, riverThresholds, tideThresholds);
console.log(JSON.stringify(a, null, 1));
