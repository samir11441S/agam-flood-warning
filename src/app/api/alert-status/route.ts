import type { NextRequest } from "next/server";
import { approvalsNeeded } from "@/lib/alert-flow";
import { deliveries } from "@/lib/deliveries";
import { alerts, replies } from "@/lib/store";
import { requireOfficer } from "@/lib/session";

/** Everything the dashboard needs to follow one alert: approvals, outbox, call progress, replies. */
export async function GET(request: NextRequest) {
  const officer = await requireOfficer();
  if (officer instanceof Response) return officer;
  const alert = alerts.get(request.nextUrl.searchParams.get("alertId") ?? "");
  if (!alert) return Response.json({ error: "Unknown alert" }, { status: 404 });
  return Response.json({
    status: alert.status, code: alert.code, approvals: alert.approvals, approvalsNeeded: approvalsNeeded(alert),
    escalations: alert.escalations, outbox: alert.outbox ?? null, calls: deliveries.summary(alert.id), replies: replies.forAlert(alert.id),
  });
}
