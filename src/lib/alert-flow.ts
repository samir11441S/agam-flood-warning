// The alert life-cycle shared by the dashboard, SMS / Telegram approvals and the background worker:
// draft → approve (1 or 2 officers) → send on every channel → outbox + audit log.
// Approval returns at once; sending runs in the background (many recipients at a time, most vulnerable
// first) and the outbox fills in as it goes, so an approval never waits minutes for thousands of calls.
import crypto from "node:crypto";
import type { OutboxEntry } from "./api-types";
import { allClearAlert, allClearFacts, announcementScript, buildFacts, validateAlert, volunteerSms } from "./alerts";
import { sendSms, sendVoice, smsMode, voiceMode, type ChannelMode } from "./channels";
import { composeAlert, type ComposeResult } from "./ai-writer";
import { areaById } from "./data";
import { dispatchPlan, syntheticHouseholds, type DispatchPlan } from "./households";
import { audit, officers, settings, type PublicOfficer } from "./officers";
import { mapLimit } from "./pool";
import { alerts, areaLists, subscribers, type Approval, type SavedAlert } from "./store";
import { alertMessage, replyButtons, telegramToken, tg } from "./telegram";
import type { Assessment } from "./types";
import { deliveries } from "./deliveries";
import { householdSms, householdVoice } from "./resident-replies";

/** Messages in flight at once per channel. Most gateways accept far more; keep it polite by default. */
const SEND_CONCURRENCY = Number(process.env.SEND_CONCURRENCY) || 20; // empty or invalid → default

/** How a caller keeps background sending alive: Next.js route handlers pass `after`, the worker just lets it run. */
export type Schedule = (work: Promise<unknown>) => void;
const runInBackground: Schedule = (work) => void work.catch((e) => console.error("Agam: sending failed:", e));

export function planFor(areaId: string): DispatchPlan {
  const uploaded = areaLists.households(areaId);
  return uploaded ? dispatchPlan(uploaded, "uploaded") : dispatchPlan(syntheticHouseholds(areaById[areaId]), "demo");
}

const newCode = () => String(crypto.randomInt(100_000, 1_000_000));

function supersedePending(areaId: string, scenario: SavedAlert["scenario"]) {
  for (const old of alerts.pending().filter((a) => a.areaId === areaId && a.scenario === scenario)) {
    alerts.update(old.id, (a) => (a.status === "pending" ? { ...a, status: "superseded" } : a));
  }
}

export async function createDraft(areaId: string, assessment: Assessment, scenario: "live" | "replay", by: string) {
  const area = areaById[areaId];
  const facts = buildFacts(area, assessment);
  const result: ComposeResult = await composeAlert(facts);
  // A newer draft for the same area replaces any older pending one.
  supersedePending(areaId, scenario);
  const alert: SavedAlert = {
    id: crypto.randomUUID(), code: newCode(), kind: "warning",
    areaId, level: assessment.level, content: result.content, facts,
    createdAt: new Date().toISOString(), createdBy: by, status: "pending", approvals: [], escalations: [], scenario,
  };
  alerts.save(alert);
  audit.add({ who: by, action: `drafted ${facts.levelEn} alert`, areaId, alertId: alert.id, detail: result.source === "ai" ? `written by ${result.writer ?? "AI"}, all checks passed` : result.note ?? "verified template" });
  return { alert, result, facts };
}

/**
 * When an all-clear may be drafted: a warning went out for this area, and the danger is over
 * (risk back to Normal / Watch, or only held at Warning because water may still be high).
 */
export function allClearAllowed(areaId: string, scenario: SavedAlert["scenario"], assessment: Assessment): { ok: true; last: SavedAlert } | { ok: false; reason: string } {
  const last = alerts.lastSent(areaId, scenario);
  if (!last?.facts) return { ok: false, reason: "No warning has been sent for this area, so there is nothing to withdraw." };
  const cleared = alerts.lastSent(areaId, scenario, "all-clear");
  if (cleared && Date.parse(cleared.sentAt ?? cleared.createdAt) > Date.parse(last.sentAt ?? last.createdAt)) return { ok: false, reason: "The all-clear for the last warning has already been sent." };
  if (assessment.level >= 2 && !assessment.heldFromDaysAgo) return { ok: false, reason: "Risk is still at Warning or Danger — an all-clear cannot be sent yet." };
  return { ok: true, last };
}

/**
 * After a Danger, the engine holds an area at Warning for 72 h because water may still be high —
 * "until an officer gives the all-clear". Once a live all-clear has gone out (after the last warning),
 * the hold is lifted and the area shows what the data alone says.
 */
export function respectAllClear(a: Assessment): Assessment {
  if (!a.heldFromDaysAgo || a.unheldLevel === undefined) return a;
  const cleared = alerts.lastSent(a.areaId, "live", "all-clear");
  const warned = alerts.lastSent(a.areaId, "live");
  const at = cleared?.sentAt;
  if (!at || Date.now() - Date.parse(at) > 3 * 24 * 3600_000) return a;
  if (warned?.sentAt && Date.parse(warned.sentAt) > Date.parse(at)) return a;
  return { ...a, level: a.unheldLevel, heldFromDaysAgo: undefined, clearedAt: at };
}

/** Drafts the all-clear (verified template — never AI) that withdraws the last warning. */
export function createAllClear(areaId: string, scenario: "live" | "replay", last: SavedAlert, by: string) {
  const facts = allClearFacts(areaById[areaId], last.facts!);
  const content = allClearAlert(facts);
  const checks = validateAlert(content, facts);
  supersedePending(areaId, scenario);
  const alert: SavedAlert = {
    id: crypto.randomUUID(), code: newCode(), kind: "all-clear",
    areaId, level: 0, content, facts,
    createdAt: new Date().toISOString(), createdBy: by, status: "pending", approvals: [], escalations: [], scenario,
  };
  alerts.save(alert);
  audit.add({ who: by, action: "drafted all-clear", areaId, alertId: alert.id, detail: `withdraws the ${last.facts!.levelEn} alert of ${last.sentAt?.slice(0, 16).replace("T", " ") ?? "earlier"}` });
  const result: ComposeResult = { content, source: "template", checks, note: "All-clear messages always use the verified template." };
  return { alert, result, facts };
}

export const approvalsNeeded = (a: SavedAlert) => (a.level === 3 && settings.get().twoPersonDanger && !officers.demoMode() ? 2 : 1);

export type ApproveOutcome =
  | { status: "sent"; alert: SavedAlert; sending: Promise<OutboxEntry[]> }
  | { status: "waiting"; alert: SavedAlert; needed: number }
  | { status: "error"; error: string };

/**
 * Adds an officer's approval. The approval that completes the count also claims the alert for sending,
 * in the same locked write — so two officers approving at the same moment can never send it twice.
 */
export async function approve(alertId: string, officer: PublicOfficer, via: Approval["via"], schedule: Schedule = runInBackground): Promise<ApproveOutcome> {
  // Set inside the locked update below (TypeScript cannot see assignments made in callbacks).
  let error = null as string | null;
  let claimed = false as boolean;
  const updated = alerts.update(alertId, (a) => {
    if (a.status !== "pending") { error = `This alert is already ${a.status}.`; return a; }
    if (a.approvals.some((x) => x.officerId === officer.id)) { error = "You already approved this alert; a second officer must approve it."; return a; }
    const next: SavedAlert = { ...a, approvals: [...a.approvals, { officer: officer.name, officerId: officer.id, at: new Date().toISOString(), via }] };
    if (next.approvals.length < approvalsNeeded(next)) return next;
    claimed = true;
    return { ...next, status: "sent", sentAt: new Date().toISOString() };
  });
  if (!updated) return { status: "error", error: "Unknown alert" };
  if (error) return { status: "error", error };
  audit.add({ who: officer.name, action: `approved ${updated.kind === "all-clear" ? "all-clear" : "alert"} (${via})`, areaId: updated.areaId, alertId });
  if (!claimed) return { status: "waiting", alert: updated, needed: approvalsNeeded(updated) };
  const sending = send(updated);
  schedule(sending);
  return { status: "sent", alert: updated, sending };
}

export function reject(alertId: string, officer: PublicOfficer, via: Approval["via"]) {
  let ok = false as boolean;
  const updated = alerts.update(alertId, (a) => {
    if (a.status !== "pending") return a;
    ok = true;
    return { ...a, status: "rejected", rejectedBy: officer.name };
  });
  if (ok && updated) audit.add({ who: officer.name, action: `rejected ${updated.kind === "all-clear" ? "all-clear" : "alert"} (${via})`, areaId: updated.areaId, alertId });
  return ok;
}

/**
 * Sends an alert that has been claimed for sending (status "sent") on every channel.
 * Real delivery happens only for live alerts with real officers configured.
 */
export async function send(alert: SavedAlert): Promise<OutboxEntry[]> {
  const facts = alert.facts!;
  const area = areaById[alert.areaId];
  const allClear = alert.kind === "all-clear";
  const plan = planFor(area.id);
  const contacts = areaLists.contacts(area.id);
  const realAllowed = alert.scenario === "live" && !officers.demoMode();
  const blockedNote = alert.scenario === "replay" ? "Replay alerts are never sent to real phones." : "Demo mode: add real officers (npm run officers) to allow real sending.";
  const modeOf = (m: ChannelMode): ChannelMode => (realAllowed ? m : "test");

  type Job = { entry: OutboxEntry; to: string[]; text: (i: number) => string; sendFn: (to: string, msg: string) => Promise<{ ok: boolean }> };
  const outbox: OutboxEntry[] = [];
  const jobs: Job[] = [];
  const job = (channel: string, mode: ChannelMode, to: string[], text: (i: number) => string, sendFn: Job["sendFn"]) => {
    const entry: OutboxEntry = { channel, mode, recipients: to.length, sent: 0, failed: 0, sample: text(0), inProgress: mode === "live" && to.length > 0, note: mode === "test" && !realAllowed ? blockedNote : undefined };
    outbox.push(entry);
    if (entry.inProgress) jobs.push({ entry, to, text, sendFn });
  };

  // 1–2. Voice call + SMS to every household with a phone (real numbers only come from an uploaded list).
  if (plan.source === "uploaded") {
    const homes = plan.all.filter((h) => h.phoneNumber); // already sorted most vulnerable first
    // Register the calls before placing them, so a fast "answered" webhook finds its record. All-clears are not retried.
    if (!allClear) deliveries.start(alert.id, area.id, homes, modeOf(voiceMode()) === "live");
    job("Voice call (Bangla)", modeOf(voiceMode()), homes.map((h) => h.phoneNumber!), () => householdVoice(alert.content), sendVoice);
    job("SMS (Bangla)", modeOf(smsMode()), homes.map((h) => h.phoneNumber!), () => householdSms(alert.content), sendSms);
  } else {
    outbox.push({ channel: "Voice call (Bangla)", mode: "simulated", recipients: plan.voiceCalls, sent: 0, failed: 0, sample: householdVoice(alert.content), note: "Demo households have no phone numbers. Upload the union's household list to send for real." });
    outbox.push({ channel: "SMS (Bangla)", mode: "simulated", recipients: plan.smsBackup, sent: 0, failed: 0, sample: householdSms(alert.content), note: "Demo households have no phone numbers." });
  }

  // 3. Volunteers: each gets the list of phone-less homes to visit (an all-clear just tells them it is over).
  const volunteers = contacts.filter((c) => c.role === "volunteer");
  const teams = plan.doorKnock;
  const teamFor = (i: number) => teams[i % Math.max(1, teams.length)]?.households ?? [];
  const volunteerText = (name: string, homes: { headBn: string; village: string }[]) => (allClear ? `${alert.content.sms_bn}` : volunteerSms(facts, name, homes));
  if (volunteers.length) {
    job(allClear ? "Volunteers (SMS)" : "Volunteer door-knock lists (SMS)", modeOf(smsMode()), volunteers.map((v) => v.phone), (i) => volunteerText(volunteers[i].name, teamFor(i)), sendSms);
  } else {
    outbox.push({ channel: allClear ? "Volunteers (SMS)" : "Volunteer door-knock lists (SMS)", mode: "simulated", recipients: teams.length, sent: 0, failed: 0,
      sample: teams[0] ? volunteerText(teams[0].volunteer, teams[0].households) : "—", note: "Add volunteers' numbers (contacts list) to send for real." });
  }

  // 4. Mosque / temple loudspeakers and CPP megaphones: the announcer gets the script to read aloud.
  const announcers = contacts.filter((c) => c.role === "announcer");
  const script = announcementScript(facts);
  if (announcers.length) job("Loudspeaker announcement (to imams / announcers)", modeOf(smsMode()), announcers.map((a) => a.phone), () => script, sendSms);
  else outbox.push({ channel: "Loudspeaker announcement (to imams / announcers)", mode: "simulated", recipients: plan.source === "demo" ? new Set(plan.all.map((h) => h.village)).size : 0, sent: 0, failed: 0, sample: script,
    note: plan.source === "demo" ? "Demo: one mosque per village. Add announcers' numbers (contacts list) to send for real." : "Add announcers' numbers (contacts list) to send for real." });

  // 5. Telegram: people who chose to subscribe by QR code (also used for the live demo on stage).
  if (telegramToken()) {
    const subs = subscribers.forArea(area.id);
    const entry: OutboxEntry = { channel: "Telegram (subscribers)", mode: "live", recipients: subs.length, sent: 0, failed: 0, sample: alertMessage(alert.level, alert.content, allClear), inProgress: subs.length > 0 };
    outbox.push(entry);
    if (subs.length) jobs.push({ entry, to: subs.map((s) => String(s.chatId)), text: () => entry.sample, sendFn: async (chatId, text) => {
      try { await tg("sendMessage", { chat_id: Number(chatId), text, reply_markup: replyButtons(alert.id) }); return { ok: true }; } catch { return { ok: false }; }
    } });
  }

  // Show the officer what is going out right away, then fill in the counts as messages are delivered.
  const saveOutbox = () => alerts.update(alert.id, (a) => ({ ...a, outbox: outbox.map((o) => ({ ...o })) }));
  saveOutbox();
  let lastSave = Date.now();
  const progress = () => {
    if (Date.now() - lastSave < 1000) return;
    lastSave = Date.now();
    saveOutbox();
  };

  await Promise.all(jobs.map(async ({ entry, to, text, sendFn }) => {
    try {
      await mapLimit(to, SEND_CONCURRENCY, async (num, i) => {
        const r = await sendFn(num, text(i)).catch(() => ({ ok: false }));
        if (r.ok) entry.sent++;
        else entry.failed++;
        progress();
      });
    } catch (e) {
      entry.note = `Stopped: ${(e as Error).message}`;
    } finally {
      entry.inProgress = false;
    }
  }));

  const liveSent = outbox.reduce((a, o) => a + (o.mode === "live" ? o.sent : 0), 0);
  alerts.update(alert.id, (a) => ({ ...a, sentTo: liveSent, outbox }));
  audit.add({ who: alert.approvals.map((a) => a.officer).join(" + ") || "system", action: allClear ? "sent all-clear" : "sent alert", areaId: area.id, alertId: alert.id,
    detail: outbox.map((o) => `${o.channel}: ${o.mode}${o.mode === "live" ? ` ${o.sent}/${o.recipients}` : ""}`).join("; ") });
  return outbox;
}
