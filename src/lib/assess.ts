import "server-only";
import feni2024 from "@/data/replays/feni-2024.json";
import sylhet2024 from "@/data/replays/sylhet-2024.json";
import north2024 from "@/data/replays/north-2024.json";
import chattogram2026 from "@/data/replays/chattogram-2026.json";
import { areas, rainThresholds, replaySteps, replayInputs, riverThresholds, stations, tideThresholds, type Replay } from "./data";
import { communityReports } from "./community";
import { liveInputs } from "./live";
import { assessArea } from "./risk";
import type { Assessment, Inputs } from "./types";

export const replays: Record<string, Replay> = Object.fromEntries(
  ([chattogram2026, feni2024, sylhet2024, north2024] as Replay[]).map((r) => [r.id, r]),
);

export type Scenario = { mode: "live" } | { mode: "replay"; replayId: string; date: string };

export function parseScenario(params: URLSearchParams | Record<string, unknown>): Scenario {
  const get = (k: string) => (params instanceof URLSearchParams ? params.get(k) : (params[k] as string | undefined)) ?? undefined;
  const replayId = get("replay");
  if (!replayId) return { mode: "live" };
  const r = replays[replayId];
  if (!r) throw new Error(`Unknown replay: ${replayId}`);
  const steps = replaySteps(r);
  const date = get("date");
  // Accept a 6-hourly step, or a plain date (= end of that day).
  const step = date && (steps.includes(date) ? date : steps.includes(`${date}T24`) ? `${date}T24` : null);
  return { mode: "replay", replayId, date: step ?? steps[0] };
}

export async function scenarioInputs(s: Scenario): Promise<Inputs> {
  if (s.mode !== "live") return replayInputs(replays[s.replayId], s.date);
  // Live: add residents' and volunteers' "water rising" reports from the last 6 hours.
  const inputs = await liveInputs();
  return { ...inputs, reports: communityReports() };
}

export function assessAll(inputs: Inputs): Assessment[] {
  return areas.map((a) => assessArea(a, inputs, stations, rainThresholds, riverThresholds, tideThresholds));
}
