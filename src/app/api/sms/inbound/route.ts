import { after, type NextRequest } from "next/server";
import { bnAt } from "@/lib/bn";
import { areaById } from "@/lib/data";
import { handleOfficerSms } from "@/lib/escalation";
import { parseReply, recordResidentReply } from "@/lib/resident-replies";
import { normalisePhone, officers, secretMatches } from "@/lib/officers";
import { areaLists, reports } from "@/lib/store";
import { jsonBody } from "@/lib/http";

/**
 * Incoming-SMS webhook for your SMS provider. Configure the provider to call:
 *   https://<your-site>/api/sms/inbound?secret=<INBOUND_SECRET>&from={sender}&text={message}
 * Officers reply "1 <code>" to approve or "2 <code>" to reject an alert.
 * Volunteers / residents on the area's lists can text "PANI <area>" (or just "PANI") to report rising water.
 * Residents answer an alert with "1" (safe) or "2" (need help) — any phone, no app needed.
 */
async function handle(params: URLSearchParams) {
  if (!secretMatches(params.get("secret"), process.env.INBOUND_SECRET)) {
    return new Response("Forbidden", { status: 403 });
  }
  const from = params.get("from") ?? params.get("sender") ?? params.get("msisdn") ?? "";
  const text = (params.get("text") ?? params.get("message") ?? params.get("body") ?? "").trim();
  let phone: string;
  try {
    phone = normalisePhone(from);
  } catch {
    return new Response("Bad sender", { status: 400 });
  }
  // An approval by SMS answers the gateway at once; sending to every household continues in the background.
  if (officers.byPhone(phone)) return new Response(await handleOfficerSms(phone, text, (work) => after(() => work)), { headers: { "Content-Type": "text/plain; charset=utf-8" } });

  // Rising-water report from someone on an area's household or contact list.
  if (/^(pani|পানি)\b/i.test(text)) {
    const named = text.split(/\s+/)[1]?.toLowerCase();
    const area =
      (named && Object.values(areaById).find((a) => a.id === named || a.name.toLowerCase() === named || a.nameBn === named)) ||
      Object.values(areaById).find((a) => (areaLists.households(a.id) ?? []).some((h) => h.phoneNumber === phone) || areaLists.contacts(a.id).some((c) => c.phone === phone));
    if (!area) return new Response("আগাম: এলাকার নাম লিখুন, যেমন: PANI parshuram", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    reports.add({ phone, areaId: area.id, name: phone.slice(-4), at: new Date().toISOString(), source: "sms", note: text });
    return new Response(`আগাম: ${bnAt(area.nameBn)} পানি বাড়ার রিপোর্ট পাওয়া গেছে। ধন্যবাদ।`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  // "1" = safe, "2" = need help (reply to an alert).
  const kind = parseReply(text);
  if (kind) {
    const r = await recordResidentReply(phone, kind, "sms", text);
    return new Response(r.message, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return new Response("আগাম: সতর্কবার্তার উত্তরে লিখুন ১ (নিরাপদ) বা ২ (সাহায্য দরকার)। পানি বাড়লে লিখুন PANI <এলাকা>", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

/** Providers that can send headers should pass the secret as `x-agam-secret` (kept out of URL logs). */
const withHeaderSecret = (params: URLSearchParams, request: NextRequest) => {
  const h = request.headers.get("x-agam-secret");
  if (h) params.set("secret", h);
  return params;
};

export async function GET(request: NextRequest) {
  return handle(withHeaderSecret(new URLSearchParams(request.nextUrl.searchParams), request));
}

export async function POST(request: NextRequest) {
  const params = new URLSearchParams(request.nextUrl.searchParams);
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) for (const [k, v] of Object.entries((await jsonBody(request)) ?? {})) params.set(k, String(v).slice(0, 1000));
  else for (const [k, v] of new URLSearchParams((await request.text()).slice(0, 20_000))) params.set(k, v.slice(0, 1000));
  return handle(withHeaderSecret(params, request));
}
