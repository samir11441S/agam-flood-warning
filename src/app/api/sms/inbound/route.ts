import type { NextRequest } from "next/server";
import { bnAt } from "@/lib/bn";
import { areaById } from "@/lib/data";
import { handleOfficerSms } from "@/lib/escalation";
import { normalisePhone, officers } from "@/lib/officers";
import { areaLists, reports } from "@/lib/store";

/**
 * Incoming-SMS webhook for your SMS provider. Configure the provider to call:
 *   https://<your-site>/api/sms/inbound?secret=<INBOUND_SECRET>&from={sender}&text={message}
 * Officers reply "1 <code>" to approve or "2 <code>" to reject an alert.
 * Volunteers / residents on the area's lists can text "PANI <area>" (or just "PANI") to report rising water.
 */
async function handle(params: URLSearchParams) {
  if (!process.env.INBOUND_SECRET || params.get("secret") !== process.env.INBOUND_SECRET) {
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
  if (officers.byPhone(phone)) return new Response(await handleOfficerSms(phone, text), { headers: { "Content-Type": "text/plain; charset=utf-8" } });

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
  return new Response("আগাম: পানি বাড়লে লিখুন PANI <এলাকা>", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export async function GET(request: NextRequest) {
  return handle(request.nextUrl.searchParams);
}

export async function POST(request: NextRequest) {
  const params = new URLSearchParams(request.nextUrl.searchParams);
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) for (const [k, v] of Object.entries(await request.json())) params.set(k, String(v));
  else for (const [k, v] of new URLSearchParams(await request.text())) params.set(k, v);
  return handle(params);
}
