// The alert life-cycle shared by the dashboard, SMS / Telegram approvals and the background worker:
// draft → approve (1 or 2 officers) → send on every channel → outbox + audit log.
import crypto from "node:crypto";
import type { OutboxEntry } from "./api-types";
import { announcementScript, buildFacts, volunteerSms } from "./alerts";
import { sendSms, sendVoice, smsMode, voiceMode, type ChannelMode } from "./channels";
import { composeAlert, type ComposeResult } from "./claude-alert";
import { areaById } from "./data";
import { dispatchPlan, syntheticHouseholds, type DispatchPlan } from "./households";
import { audit, officers, settings, type PublicOfficer } from "./officers";
import { alerts, areaLists, subscribers, type Approval, type SavedAlert } from "./store";
import { alertMessage, replyButtons, telegramToken, tg } from "./telegram";
import type { Assessment } from "./types";
import { deliveries } from "./deliveries";
import { householdSms, householdVoice } from "./resident-replies";

export function planFor(areaId: string): DispatchPlan {
  const uploaded = areaLists.households(areaId);
  return uploaded ? dispatchPlan(uploaded, "uploaded") : dispatchPlan(syntheticHouseholds(areaById[areaId]), "demo");
}

export async function createDraft(areaId: string, assessment: Assessment, scenario: "live" | "replay", by: string) {
  const area = areaById[areaId];
  const facts = buildFacts(area, assessment);
  const result: ComposeResult = await composeAlert(facts);
  // A newer draft for the same area replaces any older pending one.
  for (const old of alerts.pending().filter((a) => a.areaId === areaId && a.scenario === scenario)) alerts.save({ ...old, status: "superseded" });
  const alert: SavedAlert = {
    id: crypto.randomUUID(),
    code: String(crypto.randomInt(1000, 10000)),
    areaId, level: assessment.level, content: result.content, facts,
    createdAt: new Date().toISOString(), createdBy: by, status: "pending", approvals: [], escalations: [], scenario,
  };
  alerts.save(alert);
  audit.add({ who: by, action: `drafted ${facts.levelEn} alert`, areaId, alertId: alert.id, detail: result.source === "claude" ? "written by Claude, all checks passed" : result.note ?? "verified template" });
  return { alert, result, facts };
}

export const approvalsNeeded = (a: SavedAlert) => (a.level === 3 && settings.get().twoPersonDanger && !officers.demoMode() ? 2 : 1);

export type ApproveOutcome =
  | { status: "sent"; alert: SavedAlert; outbox: OutboxEntry[] }
  | { status: "waiting"; alert: SavedAlert; needed: number }
  | { status: "error"; error: string };

export async function approve(alertId: string, officer: PublicOfficer, via: Approval["via"]): Promise<ApproveOutcome> {
  const alert = alerts.get(alertId);
  if (!alert) return { status: "error", error: "Unknown alert" };
  if (alert.status !== "pending") return { status: "error", error: `This alert is already ${alert.status}.` };
  if (alert.approvals.some((a) => a.officerId === officer.id)) return { status: "error", error: "You already approved this alert; a second officer must approve it." };
  const updated: SavedAlert = { ...alert, approvals: [...alert.approvals, { officer: officer.name, officerId: officer.id, at: new Date().toISOString(), via }] };
  alerts.save(updated);
  audit.add({ who: officer.name, action: `approved alert (${via})`, areaId: alert.areaId, alertId });
  const needed = approvalsNeeded(updated);
  if (updated.approvals.length < needed) return { status: "waiting", alert: updated, needed };
  const outbox = await send(updated);
  return { status: "sent", alert: alerts.get(alertId)!, outbox };
}

export function reject(alertId: string, officer: PublicOfficer, via: Approval["via"]) {
  const alert = alerts.get(alertId);
  if (!alert || alert.status !== "pending") return false;
  alerts.save({ ...alert, status: "rejected", rejectedBy: officer.name });
  audit.add({ who: officer.name, action: `rejected alert (${via})`, areaId: alert.areaId, alertId });
  return true;
}

/** Sends an approved alert on every channel. Real delivery happens only for live alerts with real officers configured. */
export async function send(alert: SavedAlert): Promise<OutboxEntry[]> {
  const facts = alert.facts!;
  const area = areaById[alert.areaId];
  const plan = planFor(area.id);
  const contacts = areaLists.contacts(area.id);
  const realAllowed = alert.scenario === "live" && !officers.demoMode();
  const blockedNote = alert.scenario === "replay" ? "Replay alerts are never sent to real phones." : "Demo mode: add real officers (npm run officers) to allow real sending.";
  const modeOf = (m: ChannelMode): ChannelMode => (realAllowed ? m : "test");
  const outbox: OutboxEntry[] = [];

  async function deliver(channel: string, mode: ChannelMode, to: string[], text: (i: number) => string, sendFn: (to: string, msg: string) => Promise<{ ok: boolean }>) {
    let sent = 0, failed = 0;
    if (mode === "live") {
      for (let i = 0; i < to.length; i++) {
        if ((await sendFn(to[i], text(i))).ok) sent++;
        else failed++;
      }
    }
    outbox.push({ channel, mode, recipients: to.length, sent, failed, sample: text(0), note: mode === "test" && !realAllowed ? blockedNote : undefined });
  }

  // 1–2. Voice call + SMS to every household with a phone (real numbers only come from an uploaded list).
  if (plan.source === "uploaded") {
    const homes = plan.all.filter((h) => h.phoneNumber);
    await deliver("Voice call (Bangla)", modeOf(voiceMode()), homes.map((h) => h.phoneNumber!), () => householdVoice(alert.content), sendVoice);
    await deliver("SMS (Bangla)", modeOf(smsMode()), homes.map((h) => h.phoneNumber!), () => householdSms(alert.content), sendSms);
    deliveries.start(alert.id, area.id, homes, modeOf(voiceMode()) === "live");
  } else {
    outbox.push({ channel: "Voice call (Bangla)", mode: "simulated", recipients: plan.voiceCalls, sent: 0, failed: 0, sample: householdVoice(alert.content), note: "Demo households have no phone numbers. Upload the union's household list to send for real." });
    outbox.push({ channel: "SMS (Bangla)", mode: "simulated", recipients: plan.smsBackup, sent: 0, failed: 0, sample: householdSms(alert.content), note: "Demo households have no phone numbers." });
  }

  // 3. Volunteers: each gets the list of phone-less homes to visit.
  const volunteers = contacts.filter((c) => c.role === "volunteer");
  const teams = plan.doorKnock;
  const teamFor = (i: number) => teams[i % Math.max(1, teams.length)]?.households ?? [];
  if (volunteers.length) {
    await deliver("Volunteer door-knock lists (SMS)", modeOf(smsMode()), volunteers.map((v) => v.phone), (i) => volunteerSms(facts, volunteers[i].name, teamFor(i)), sendSms);
  } else {
    outbox.push({ channel: "Volunteer door-knock lists (SMS)", mode: "simulated", recipients: teams.length, sent: 0, failed: 0,
      sample: teams[0] ? volunteerSms(facts, teams[0].volunteer, teams[0].households) : "—", note: "Add volunteers' numbers (contacts list) to send for real." });
  }

  // 4. Mosque / temple loudspeakers and CPP megaphones: the announcer gets the script to read aloud.
  const announcers = contacts.filter((c) => c.role === "announcer");
  const script = announcementScript(facts);
  if (announcers.length) await deliver("Loudspeaker announcement (to imams / announcers)", modeOf(smsMode()), announcers.map((a) => a.phone), () => script, sendSms);
  else outbox.push({ channel: "Loudspeaker announcement (to imams / announcers)", mode: "simulated", recipients: plan.source === "demo" ? new Set(plan.all.map((h) => h.village)).size : 0, sent: 0, failed: 0, sample: script,
    note: plan.source === "demo" ? "Demo: one mosque per village. Add announcers' numbers (contacts list) to send for real." : "Add announcers' numbers (contacts list) to send for real." });

  // 5. Telegram: people who chose to subscribe by QR code (also used for the live demo on stage).
  if (telegramToken()) {
    const subs = subscribers.forArea(area.id);
    await deliver("Telegram (subscribers)", "live", subs.map((s) => String(s.chatId)), () => alertMessage(alert.level, alert.content), async (chatId, text) => {
      try { await tg("sendMessage", { chat_id: Number(chatId), text, reply_markup: replyButtons(alert.id) }); return { ok: true }; } catch { return { ok: false }; }
    });
  }

  const liveSent = outbox.reduce((a, o) => a + (o.mode === "live" ? o.sent : 0), 0);
  alerts.save({ ...alerts.get(alert.id)!, status: "sent", sentAt: new Date().toISOString(), sentTo: liveSent, outbox });
  audit.add({ who: alert.approvals.map((a) => a.officer).join(" + ") || "system", action: "sent alert", areaId: area.id, alertId: alert.id,
    detail: outbox.map((o) => `${o.channel}: ${o.mode}${o.mode === "live" ? ` ${o.sent}/${o.recipients}` : ""}`).join("; ") });
  return outbox;
}
