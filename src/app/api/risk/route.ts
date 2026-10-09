import type { NextRequest } from "next/server";
import { assessAll, parseScenario, replays, scenarioInputs } from "@/lib/assess";
import { replaySteps } from "@/lib/data";

export async function GET(request: NextRequest) {
  let scenario;
  try {
    scenario = parseScenario(request.nextUrl.searchParams);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  try {
    const inputs = await scenarioInputs(scenario);
    const replay = scenario.mode === "replay" ? replays[scenario.replayId] : null;
    return Response.json({
      scenario,
      asOf: inputs.asOf,
      replay: replay && { id: replay.id, title: replay.title, titleBn: replay.titleBn, focus: replay.focus, dates: replaySteps(replay) },
      assessments: assessAll(inputs),
    });
  } catch (e) {
    return Response.json({ error: `Could not load live data: ${(e as Error).message}` }, { status: 502 });
  }
}
