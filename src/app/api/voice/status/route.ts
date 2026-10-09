import type { NextRequest } from "next/server";
import { deliveries } from "@/lib/deliveries";
import { normalisePhone } from "@/lib/officers";

/**
 * Call-status webhook for your voice (IVR) provider:
 *   https://<your-site>/api/voice/status?secret=<INBOUND_SECRET>&to={number}&status={answered|no-answer|busy|failed}
 * Unanswered calls are retried by the worker, then the backup number, then a volunteer.
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  if (!process.env.INBOUND_SECRET || p.get("secret") !== process.env.INBOUND_SECRET) return new Response("Forbidden", { status: 403 });
  let to: string;
  try {
    to = normalisePhone(p.get("to") ?? "");
  } catch {
    return Response.json({ error: "Bad number" }, { status: 400 });
  }
  const answered = /^(answered|completed|success)$/i.test(p.get("status") ?? "");
  const d = deliveries.report(to, answered);
  return Response.json({ ok: Boolean(d), status: d?.status ?? null });
}

export const POST = GET;
