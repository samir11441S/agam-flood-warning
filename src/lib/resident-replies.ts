// "I'm safe" / "I need help" from people WITHOUT Telegram: they reply to the alert SMS with 1 or 2,
// or press 1 or 2 on the keypad during the voice call. Any phone works — no smartphone, no app.
import { bnAt, toBn } from "./bn";
import { sendSms, smsMode } from "./channels";
import { areaById } from "./data";
import { deliveries } from "./deliveries";
import type { Household } from "./households";
import { audit, officers } from "./officers";
import { alerts, areaLists, replies, type SavedAlert } from "./store";

/** Added to every household SMS and voice call (after the verified alert text). */
export const REPLY_SMS_BN = "উত্তর দিন: ১ = নিরাপদ, ২ = সাহায্য দরকার";
export const REPLY_VOICE_BN = "আপনি নিরাপদ থাকলে এক চাপুন। সাহায্য লাগলে দুই চাপুন।";

/** What a household actually receives: the verified alert, then how to answer. */
export const householdSms = (c: { sms_bn: string }) => `${c.sms_bn}
${REPLY_SMS_BN}`;
export const householdVoice = (c: { voice_bn: string }) => `${c.voice_bn} ${REPLY_VOICE_BN}`;

/** Replies count for this long after an alert is sent. */
const REPLY_WINDOW_H = 72;

/** "1", "১", "safe", "নিরাপদ" → safe; "2", "২", "help", "sos", "সাহায্য" → help. Extra words become a note. */
export function parseReply(text: string): "safe" | "help" | null {
  const first = text.trim().toLowerCase().split(/[\s,.;:।]+/)[0] ?? "";
  if (["1", "১", "safe", "ok", "নিরাপদ"].includes(first)) return "safe";
  if (["2", "২", "help", "sos", "সাহায্য"].includes(first)) return "help";
  return null;
}

type Match = { alert: SavedAlert; household?: Household };

/** Which sent alert is this person answering? Their call record first, then the area lists they are on. */
export function findAlertFor(phone: string, now = Date.now()): Match | null {
  const recent = (a: SavedAlert) => a.status === "sent" && a.scenario === "live" && a.sentAt !== undefined && now - Date.parse(a.sentAt) < REPLY_WINDOW_H * 3600_000;
  const sent = alerts.all().filter(recent);
  const homeIn = (areaId: string) => (areaLists.households(areaId) ?? []).find((h) => h.phoneNumber === phone || h.backupPhoneNumber === phone);

  const call = [...deliveries.all()].reverse().find((d) => (d.phone === phone || d.backupPhone === phone) && sent.some((a) => a.id === d.alertId));
  if (call) return { alert: sent.find((a) => a.id === call.alertId)!, household: homeIn(call.areaId) };

  for (const alert of [...sent].reverse()) {
    const household = homeIn(alert.areaId);
    if (household || areaLists.contacts(alert.areaId).some((c) => c.phone === phone)) return { alert, household };
  }
  return null;
}

/** Records the reply, stops further calls to that home, and sends help requests straight to the area's volunteers. */
export async function recordResidentReply(phone: string, status: "safe" | "help", channel: "sms" | "voice", text = "") {
  const match = findAlertFor(phone);
  if (!match) return { ok: false, message: "আগাম: আপনার এলাকায় এখন কোনো সক্রিয় সতর্কবার্তা নেই। জরুরি প্রয়োজনে ৯৯৯ নম্বরে ফোন করুন।" };
  const { alert, household } = match;
  const area = areaById[alert.areaId];
  const note = text.trim().split(/\s+/).slice(1).join(" ") || undefined;
  replies.record({
    channel, phone, alertId: alert.id, areaId: alert.areaId, status, at: new Date().toISOString(), note,
    name: household?.headBn ?? `…${phone.slice(-4)}`, village: household?.village,
  });
  deliveries.report(phone, true); // they heard it: no more retries for this home

  if (status === "safe") {
    audit.add({ who: `resident …${phone.slice(-4)}`, action: `replied SAFE by ${channel}`, areaId: alert.areaId, alertId: alert.id });
    return { ok: true, message: "আগাম: ধন্যবাদ। নিরাপদে থাকুন, প্রতিবেশীদের খোঁজ নিন।" };
  }

  // Help: every volunteer of the area gets the name, village and number at once.
  const volunteers = areaLists.contacts(alert.areaId).filter((c) => c.role === "volunteer");
  const who = household ? `${household.headBn}${household.village ? ` (${household.village})` : ""}` : "একজন বাসিন্দা";
  const sms = `আগাম জরুরি: ${bnAt(area.nameBn)} ${who} সাহায্য চেয়েছেন। ফোন: ${toBn(phone.replace("+88", ""))}${note ? `। বার্তা: ${note}` : ""}`;
  const live = smsMode() === "live" && !officers.demoMode();
  let forwarded = 0;
  if (live) for (const v of volunteers) if ((await sendSms(v.phone, sms)).ok) forwarded++;
  audit.add({
    who: `resident …${phone.slice(-4)}`, action: `asked for HELP by ${channel}`, areaId: alert.areaId, alertId: alert.id,
    detail: live ? `sent to ${forwarded} of ${volunteers.length} volunteers` : `test mode: would notify ${volunteers.length} volunteers`,
  });
  return { ok: true, message: "আগাম: আপনার সাহায্যের অনুরোধ স্বেচ্ছাসেবকদের কাছে পাঠানো হয়েছে। নিরাপদ উঁচু জায়গায় থাকুন। জরুরি: ৯৯৯" };
}
