// Gets a pending alert in front of a human fast — even at night, even without internet:
// notify officers one by one (SMS "reply 1 <code>" + Telegram buttons), escalate when nobody answers,
// and for DANGER optionally send the verified template automatically after a deadline.
import { approve, send } from "./alert-flow";
import { templateAlert } from "./alerts";
import { bnAt } from "./bn";
import { sendSms, smsMode } from "./channels";
import { areaById } from "./data";
import { audit, officers, settings, type Officer } from "./officers";
import { alerts, type SavedAlert } from "./store";
import { telegramToken, tg } from "./telegram";
import { LEVELS } from "./types";

export function officerSms(a: SavedAlert) {
  const area = areaById[a.areaId];
  return `আগাম: ${bnAt(area.nameBn)} বন্যা ${LEVELS[a.level].bn} (${LEVELS[a.level].en})। সতর্কবার্তা পাঠাতে উত্তর দিন: 1 ${a.code}  বাতিল: 2 ${a.code}`;
}

export async function notifyOfficer(o: Officer, a: SavedAlert) {
  const channels: string[] = [];
  if (o.phone && smsMode() === "live" && !officers.demoMode()) {
    if ((await sendSms(o.phone, officerSms(a))).ok) channels.push("SMS");
  } else if (o.phone) {
    channels.push("SMS (test mode)");
  }
  if (o.telegramChatId && telegramToken()) {
    try {
      await tg("sendMessage", {
        chat_id: o.telegramChatId,
        text: `${officerSms(a)}\n\n${a.content.sms_bn}`,
        reply_markup: { inline_keyboard: [[{ text: "✅ অনুমোদন ও প্রেরণ", callback_data: `ok:${a.id}` }, { text: "✖ বাতিল", callback_data: `no:${a.id}` }]] },
      });
      channels.push("Telegram");
    } catch {
      // Telegram unreachable: SMS (if configured) still went out.
    }
  }
  return channels;
}

const AUTO_POLICY = { id: "auto-policy", name: "Auto-send policy (no officer answered)", role: "officer" as const };

/** One escalation pass over all pending LIVE alerts. Safe to call every minute. */
export async function escalate(now = Date.now()) {
  const s = settings.get();
  const team = officers.all();
  for (const a of alerts.pending().filter((x) => x.scenario === "live")) {
    const minutes = (now - Date.parse(a.createdAt)) / 60_000;

    // Notify officer #0 immediately, then the next one every escalateAfterMin minutes.
    const step = Math.min(team.length - 1, Math.floor(minutes / s.escalateAfterMin));
    for (let i = 0; i <= step; i++) {
      const o = team[i];
      if (!o || a.escalations.some((e) => e.to === o.name)) continue;
      const via = await notifyOfficer(o, a);
      const fresh = alerts.get(a.id)!;
      alerts.save({ ...fresh, escalations: [...fresh.escalations, { at: new Date(now).toISOString(), to: o.name }] });
      a.escalations.push({ at: new Date(now).toISOString(), to: o.name });
      audit.add({ who: "Agam worker", action: i === 0 ? "asked officer to approve" : "escalated to next officer", areaId: a.areaId, alertId: a.id, detail: `${o.name} via ${via.join(", ") || "no channel configured"}` });
    }

    // Lives first: an unanswered DANGER alert goes out by itself (verified template only) after the deadline.
    if (a.level === 3 && s.autoSendDangerAfterMin !== null && minutes >= s.autoSendDangerAfterMin) {
      const fresh = alerts.get(a.id)!;
      if (fresh.status !== "pending") continue;
      // No human has read this draft, so send the verified template rather than AI-written text.
      const content = fresh.facts ? templateAlert(fresh.facts) : fresh.content;
      alerts.save({ ...fresh, content, approvals: [...fresh.approvals, { officer: AUTO_POLICY.name, officerId: AUTO_POLICY.id, at: new Date(now).toISOString(), via: "auto-policy" }] });
      audit.add({ who: "Agam worker", action: `auto-sent DANGER alert after ${Math.round(minutes)} min without approval`, areaId: a.areaId, alertId: a.id });
      await send(alerts.get(a.id)!);
    }
  }
}

/** Handles an officer's SMS reply: "1 4821" approves, "2 4821" rejects. Returns the text to reply with. */
export async function handleOfficerSms(from: string, text: string): Promise<string> {
  let officer: Officer | undefined;
  try {
    officer = officers.byPhone(from);
  } catch {
    officer = undefined;
  }
  if (!officer) return "আগাম: এই নম্বরটি কোনো কর্মকর্তার নয়।";
  const m = text.trim().match(/^([12])\s*[-:]?\s*(\d{4})$/);
  if (!m) return "আগাম: উত্তর দিন 1 <কোড> (পাঠাতে) বা 2 <কোড> (বাতিল)।";
  const alert = alerts.byCode(m[2]);
  if (!alert) return `আগাম: কোড ${m[2]}-এর কোনো অপেক্ষমাণ সতর্কবার্তা নেই।`;
  const who = { id: officer.id, name: officer.name, role: officer.role };
  if (m[1] === "2") {
    const { reject } = await import("./alert-flow");
    reject(alert.id, who, "sms");
    return "আগাম: সতর্কবার্তা বাতিল করা হয়েছে।";
  }
  const outcome = await approve(alert.id, who, "sms");
  if (outcome.status === "sent") return "আগাম: অনুমোদিত — সতর্কবার্তা পাঠানো হয়েছে।";
  if (outcome.status === "waiting") return "আগাম: অনুমোদন নেওয়া হলো — আরও একজন কর্মকর্তার অনুমোদন দরকার।";
  return `আগাম: ${outcome.error}`;
}
