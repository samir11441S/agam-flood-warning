import type { NextRequest } from "next/server";
import { deliveries } from "@/lib/deliveries";
import { normalisePhone } from "@/lib/officers";
import { recordResidentReply } from "@/lib/resident-replies";

/**
 * Call-status webhook for your voice (IVR) provider:
 *   https://<your-site>/api/voice/status?secret=<INBOUND_SECRET>&to={number}&status={answered|no-answer|busy|failed}&digits={key pressed}
 * Unanswered calls are retried by the worker, then the backup number, then a volunteer.
 * The call ends with "press 1 if you are safe, 2 if you need help": the provider passes the key as `digits`.
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
  const digits = (p.get("digits") ?? p.get("dtmf") ?? p.get("Digits") ?? "").trim();
  const key = digits === "1" ? "safe" : digits === "2" ? "help" : null;
  const answered = key !== null || /^(answered|completed|success)$/i.test(p.get("status") ?? "");
  const d = deliveries.report(to, answered);
  const reply = key ? await recordResidentReply(to, key, "voice") : null;
  return Response.json({ ok: Boolean(d) || Boolean(reply?.ok), status: d?.status ?? null, reply: key, recorded: reply?.ok ?? false });
}

export const POST = GET;
