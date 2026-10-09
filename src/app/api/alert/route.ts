import { announcementScript } from "@/lib/alerts";
import { createDraft, planFor, approvalsNeeded } from "@/lib/alert-flow";
import { assessAll, parseScenario, scenarioInputs } from "@/lib/assess";
import { areaById } from "@/lib/data";
import { requireOfficer } from "@/lib/session";

export async function POST(request: Request) {
  const officer = await requireOfficer();
  if (officer instanceof Response) return officer;
  const body = (await request.json()) as { areaId?: string; replay?: string; date?: string };
  const area = body.areaId ? areaById[body.areaId] : undefined;
  if (!area) return Response.json({ error: "Unknown area" }, { status: 400 });

  // The level is recomputed on the server from data, never taken from the browser.
  const scenario = parseScenario({ replay: body.replay, date: body.date });
  const assessment = assessAll(await scenarioInputs(scenario)).find((a) => a.areaId === area.id)!;
  if (assessment.level === 0) return Response.json({ error: "No alert needed: risk level is Normal." }, { status: 409 });

  const { alert, result, facts } = await createDraft(area.id, assessment, scenario.mode, officer.name);
  return Response.json({ alertId: alert.id, code: alert.code, approvalsNeeded: approvalsNeeded(alert), facts, result, announcement: announcementScript(facts), plan: planFor(area.id) });
}
