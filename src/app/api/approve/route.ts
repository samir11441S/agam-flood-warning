import { after } from "next/server";
import { approve, reject } from "@/lib/alert-flow";
import { requireOfficer } from "@/lib/session";
import { jsonBody, str } from "@/lib/http";

export async function POST(request: Request) {
  const officer = await requireOfficer();
  if (officer instanceof Response) return officer;
  const body = await jsonBody<{ alertId: string; action: string }>(request);
  const alertId = str(body?.alertId, 64);
  const action = body?.action === "reject" ? "reject" : "approve";
  if (!alertId) return Response.json({ error: "alertId required" }, { status: 400 });
  if (action === "reject") return Response.json({ status: reject(alertId, officer, "dashboard") ? "rejected" : "error" });
  // Sending continues after the response; the dashboard follows progress through /api/alert-status.
  const outcome = await approve(alertId, officer, "dashboard", (work) => after(() => work));
  if (outcome.status === "error") return Response.json({ error: outcome.error }, { status: 409 });
  return Response.json({ status: outcome.status, alert: outcome.alert });
}
