import type { NextRequest } from "next/server";
import { announcementScript } from "@/lib/alerts";
import { allClearAllowed, approvalsNeeded, createAllClear, createDraft, planFor } from "@/lib/alert-flow";
import { assessAll, parseScenario, scenarioInputs, type Scenario } from "@/lib/assess";
import { areaById } from "@/lib/data";
import { requireOfficer } from "@/lib/session";
import { badRequest, jsonBody, str } from "@/lib/http";

async function assessmentFor(areaId: string, scenario: Scenario) {
  // The level is recomputed on the server from data, never taken from the browser.
  return assessAll(await scenarioInputs(scenario), scenario).find((a) => a.areaId === areaId)!;
}

/** Can an all-clear be drafted for this area now? (Used by the dashboard to show the button.) */
export async function GET(request: NextRequest) {
  const officer = await requireOfficer();
  if (officer instanceof Response) return officer;
  const p = request.nextUrl.searchParams;
  const areaId = p.get("areaId") ?? "";
  if (!areaById[areaId]) return Response.json({ error: "Unknown area" }, { status: 400 });
  let scenario: Scenario;
  try {
    scenario = parseScenario(p);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  const check = allClearAllowed(areaId, scenario.mode, await assessmentFor(areaId, scenario));
  return Response.json(check.ok ? { allClear: true, lastLevel: check.last.facts?.levelEn, lastSentAt: check.last.sentAt } : { allClear: false, reason: check.reason });
}

/** Body: { areaId, replay?, date?, kind?: "warning" | "all-clear" }. */
export async function POST(request: Request) {
  const officer = await requireOfficer();
  if (officer instanceof Response) return officer;
  const raw = await jsonBody<{ areaId: string; replay: string; date: string; kind: string }>(request);
  if (!raw) return badRequest();
  const body = { areaId: str(raw.areaId, 40), replay: str(raw.replay, 40), date: str(raw.date, 20), kind: raw.kind === "all-clear" ? "all-clear" : "warning" };
  const area = body.areaId && Object.hasOwn(areaById, body.areaId) ? areaById[body.areaId] : undefined;
  if (!area) return Response.json({ error: "Unknown area" }, { status: 400 });

  let scenario: Scenario;
  try {
    scenario = parseScenario({ replay: body.replay, date: body.date });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  const assessment = await assessmentFor(area.id, scenario);

  if (body.kind === "all-clear") {
    const check = allClearAllowed(area.id, scenario.mode, assessment);
    if (!check.ok) return Response.json({ error: check.reason }, { status: 409 });
    const { alert, result, facts } = createAllClear(area.id, scenario.mode, check.last, officer.name);
    return Response.json({ alertId: alert.id, code: alert.code, kind: "all-clear", approvalsNeeded: approvalsNeeded(alert), facts, result, announcement: announcementScript(facts), plan: planFor(area.id) });
  }

  if (assessment.level === 0) return Response.json({ error: "No alert needed: risk level is Normal." }, { status: 409 });
  const { alert, result, facts } = await createDraft(area.id, assessment, scenario.mode, officer.name);
  return Response.json({ alertId: alert.id, code: alert.code, kind: "warning", approvalsNeeded: approvalsNeeded(alert), facts, result, announcement: announcementScript(facts), plan: planFor(area.id) });
}
