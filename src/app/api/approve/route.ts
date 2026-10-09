import { approve, reject } from "@/lib/alert-flow";
import { requireOfficer } from "@/lib/session";

export async function POST(request: Request) {
  const officer = await requireOfficer();
  if (officer instanceof Response) return officer;
  const { alertId, action } = (await request.json()) as { alertId?: string; action?: "approve" | "reject" };
  if (!alertId) return Response.json({ error: "alertId required" }, { status: 400 });
  if (action === "reject") return Response.json({ status: reject(alertId, officer, "dashboard") ? "rejected" : "error" });
  const outcome = await approve(alertId, officer, "dashboard");
  if (outcome.status === "error") return Response.json({ error: outcome.error }, { status: 409 });
  return Response.json(outcome);
}
