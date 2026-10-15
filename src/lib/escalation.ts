// Gets a pending alert in front of a human fast — even at night, even without internet:
// notify officers one by one (SMS "reply 1 <code>" + Telegram buttons), escalate when nobody answers,
// and for DANGER optionally send the verified template automatically after a deadline.
import { approve, reject, send, type Schedule } from "./alert-flow";
import { templateAlert } from "./alerts";
import { bnAt } from "./bn";
import { sendSms, smsMode } from "./channels";
import { areaById } from "./data";
import { audit, officers, settings, type Officer } from "./officers";
import { alerts, attempts, type SavedAlert } from "./store";
import { telegramToken, tg } from "./telegram";
import { LEVELS } from "./types";

export function officerSms(a: SavedAlert) {
  const area = areaById[a.areaId];
  const what = a.kind === "all-clear" ? "বন্যা সতর্কতা প্রত্যাহার (All-clear)" : `বন্যা ${LEVELS[a.level].bn} (${LEVELS[a.level].en})`;
  return `আগাম: ${bnAt(area.nameBn)} ${what}। সতর্কবার্তা পাঠাতে উত্তর দিন: 1 ${a.code}  বাতিল: 2 ${a.code}`;
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

/** A plain message to every officer (SMS when a provider is live, and Telegram when linked). Returns how many were reached. */
export async function messageAllOfficers(text: string) {
  let reached = 0;
  for (const o of officers.all()) {
    let ok = false;
    if (o.phone && smsMode() === "live") ok = (await sendSms(o.phone, text)).ok || ok;
    if (o.telegramChatId && telegramToken()) ok = await tg("sendMessage", { chat_id: o.telegramChatId, text }).then(() => true, () => false) || ok;
    if (ok) reached++;
  }
  return reached;
}

const AUTO_POLICY ={ id: "auto-policy", name: "Auto-send policy (no officer answered)" };

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
      const fresh = alerts.get(a.id);
      if (!o || fresh?.status !== "pending" || fresh.escalations.some((e) => e.to === o.name)) continue;
      const via = await notifyOfficer(o, fresh);
      alerts.update(a.id, (x) => ({ ...x, escalations: [...x.escalations, { at: new Date(now).toISOString(), to: o.name }] }));
      audit.add({ who: "Agam worker", action: i === 0 ? "asked officer to approve" : "escalated to next officer", areaId: a.areaId, alertId: a.id, detail: `${o.name} via ${via.join(", ") || "no channel configured"}` });
    }

    // Lives first: an unanswered DANGER alert goes out by itself (verified template only) after the deadline.
    if (a.level === 3 && a.kind !== "all-clear" && s.autoSendDangerAfterMin !== null && minutes >= s.autoSendDangerAfterMin) {
      // Claim it in one locked write, so an officer approving at the same moment cannot cause a double send.
      let claimed = false as boolean;
      const ready = alerts.update(a.id, (x) => {
        if (x.status !== "pending") return x;
        claimed = true;
        // No human has read this draft, so send the verified template rather than AI-written text.
        const content = x.facts ? templateAlert(x.facts) : x.content;
        return { ...x, content, status: "sent", sentAt: new Date(now).toISOString(), approvals: [...x.approvals, { officer: AUTO_POLICY.name, officerId: AUTO_POLICY.id, at: new Date(now).toISOString(), via: "auto-policy" }] };
      });
      if (!claimed || !ready) continue;
      audit.add({ who: "Agam worker", action: `auto-sent DANGER alert after ${Math.round(minutes)} min without approval`, areaId: a.areaId, alertId: a.id });
      void send(ready).catch((e) => console.error("Agam: auto-send failed:", e));
    }
  }
}

/** Wrong approval codes allowed per phone per hour (stops anyone guessing a code from a spoofed number). */
const CODE_TRIES = { limit: 5, windowMin: 60 };

/** Handles an officer's SMS reply: "1 482193" approves, "2 482193" rejects. Returns the text to reply with. */
export async function handleOfficerSms(from: string, text: string, schedule?: Schedule): Promise<string> {
  let officer: Officer | undefined;
  try {
    officer = officers.byPhone(from);
  } catch {
    officer = undefined;
  }
  if (!officer) return "আগাম: এই নম্বরটি কোনো কর্মকর্তার নয়।";
  const key = `sms-code:${officer.phone}`;
  if (attempts.blocked(key, CODE_TRIES.limit, CODE_TRIES.windowMin)) return "আগাম: অনেকবার ভুল কোড। এক ঘণ্টা পরে আবার চেষ্টা করুন, অথবা ড্যাশবোর্ড থেকে অনুমোদন দিন।";
  const m = text.trim().match(/^([12])\s*[-:]?\s*(\d{4,6})$/);
  if (!m) return "আগাম: উত্তর দিন 1 <কোড> (পাঠাতে) বা 2 <কোড> (বাতিল)।";
  const alert = alerts.byCode(m[2]);
  if (!alert) {
    attempts.hit(key, CODE_TRIES.windowMin);
    if (attempts.blocked(key, CODE_TRIES.limit, CODE_TRIES.windowMin)) audit.add({ who: officer.name, action: "SMS approvals paused for 1 hour", detail: `${CODE_TRIES.limit} wrong approval codes from ${officer.phone}` });
    return `আগাম: কোড ${m[2]}-এর কোনো অপেক্ষমাণ সতর্কবার্তা নেই।`;
  }
  attempts.clear(key);
  const who = { id: officer.id, name: officer.name, role: officer.role };
  if (m[1] === "2") {
    return reject(alert.id, who, "sms") ? "আগাম: সতর্কবার্তা বাতিল করা হয়েছে।" : "আগাম: এই সতর্কবার্তা আর অপেক্ষমাণ নেই।";
  }
  const outcome = await approve(alert.id, who, "sms", schedule);
  if (outcome.status === "sent") return "আগাম: অনুমোদিত — সতর্কবার্তা পাঠানো হচ্ছে।";
  if (outcome.status === "waiting") return "আগাম: অনুমোদন নেওয়া হলো — আরও একজন কর্মকর্তার অনুমোদন দরকার।";
  return `আগাম: ${outcome.error}`;
}
