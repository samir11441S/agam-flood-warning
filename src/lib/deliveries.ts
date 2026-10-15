// Tracks every household's voice call after an alert: retry unanswered calls, try the backup number,
// then hand the home to a volunteer. Real call outcomes arrive from the IVR provider's status webhook
// (web process) while the worker retries calls (worker process), so every change is a locked
// read-modify-write and no network call happens while a stale copy of the list is held.
import type { Household } from "./households";
import { mapLimit } from "./pool";
import { load, update } from "./store";

export const MAX_ATTEMPTS = 2;
export const RETRY_AFTER_MIN = 10;

export type DeliveryStatus = "calling" | "answered" | "retry" | "backup" | "volunteer";

export type Delivery = {
  alertId: string;
  areaId: string;
  householdId: string;
  headBn: string;
  village: string;
  phone: string;
  backupPhone?: string;
  attempts: number;
  backupTried: boolean;
  status: DeliveryStatus;
  live: boolean;
  lastAt: string;
};

const FILE = "deliveries";
const change = (fn: (list: Delivery[]) => Delivery[]) => update<Delivery[]>(FILE, [], fn);
const readAll = () => load<Delivery[]>(FILE, []);

/** Deterministic simulated answer (test mode): ~70% answer each attempt. */
function simulatedAnswer(d: Delivery) {
  let h = 2166136261;
  for (const c of `${d.householdId}:${d.attempts}:${d.backupTried}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) % 100 < 70;
}

const sameHome = (a: Delivery, b: Delivery) => a.alertId === b.alertId && a.householdId === b.householdId;

export const deliveries = {
  all: () => readAll(),
  forAlert: (alertId: string) => readAll().filter((d) => d.alertId === alertId),

  /** Registers the calls BEFORE they are placed, so a fast "answered" webhook always finds its record. */
  start(alertId: string, areaId: string, homes: Household[], live: boolean) {
    const now = new Date().toISOString();
    const fresh: Delivery[] = homes.filter((h) => h.phoneNumber).map((h) => ({
      alertId, areaId, householdId: h.id, headBn: h.headBn, village: h.village, phone: h.phoneNumber!, backupPhone: h.backupPhoneNumber,
      attempts: 1, backupTried: false, status: "calling", live, lastAt: now,
    }));
    change((list) => [...list.filter((d) => d.alertId !== alertId).slice(-20_000), ...fresh]);
  },

  /** Called by the IVR provider's status webhook (live mode). The worker decides what happens next. */
  report(phone: string, answered: boolean): Delivery | null {
    let found: Delivery | null = null;
    change((list) => {
      const idx = list.findLastIndex((x) => (x.phone === phone || x.backupPhone === phone) && (x.status === "calling" || x.status === "backup"));
      if (idx < 0) return list;
      found = { ...list[idx], status: answered ? "answered" : "retry", lastAt: new Date().toISOString() };
      return list.map((d, i) => (i === idx ? found! : d));
    });
    return found;
  },

  /** A call could not even be placed (provider error): count it as unanswered so it is retried. */
  failed(d: Delivery) {
    change((list) => list.map((x) => (sameHome(x, d) && (x.status === "calling" || x.status === "backup") ? { ...x, status: "retry", lastAt: new Date().toISOString() } : x)));
  },

  /**
   * One worker step: resolve simulated calls (test mode), retry unanswered calls after RETRY_AFTER_MIN,
   * then try the backup number, then hand the home to a volunteer. `call` places a real call (live mode).
   * Returns the homes newly handed to volunteers.
   */
  async tick(call: (to: string, d: Delivery) => Promise<{ ok: boolean }>, now = Date.now()) {
    const handed: Delivery[] = [];
    const toCall: { to: string; d: Delivery }[] = [];
    // 1. Decide and record every transition under the lock (no awaits in here).
    change((list) =>
      list.map((orig) => {
        const d = { ...orig };
        if (d.status === "answered" || d.status === "volunteer") return orig;
        if (!d.live && (d.status === "calling" || d.status === "backup")) {
          d.status = simulatedAnswer(d) ? "answered" : "retry";
          return d;
        }
        if (d.status !== "retry") return orig; // live call in progress: wait for the provider's status webhook
        const next = d.attempts < MAX_ATTEMPTS ? "call" : d.backupPhone && !d.backupTried ? "backup" : "volunteer";
        if (next !== "volunteer" && d.live && now - Date.parse(d.lastAt) < RETRY_AFTER_MIN * 60_000) return orig;
        if (next === "call") {
          d.attempts++;
          d.status = "calling";
          if (d.live) toCall.push({ to: d.phone, d });
        } else if (next === "backup") {
          d.backupTried = true;
          d.status = "backup";
          if (d.live) toCall.push({ to: d.backupPhone!, d });
        } else {
          d.status = "volunteer";
          handed.push(d);
        }
        d.lastAt = new Date(now).toISOString();
        return d;
      }),
    );
    // 2. Place the calls after the list is saved; a failed placement is recorded as unanswered.
    await mapLimit(toCall, 10, async ({ to, d }) => {
      const r = await call(to, d).catch(() => ({ ok: false }));
      if (!r.ok) deliveries.failed(d);
    });
    return handed;
  },

  summary(alertId: string) {
    const list = deliveries.forAlert(alertId);
    const count = (s: DeliveryStatus) => list.filter((d) => d.status === s).length;
    return {
      total: list.length,
      answered: count("answered"),
      inProgress: count("calling") + count("retry") + count("backup"),
      toVolunteer: list.filter((d) => d.status === "volunteer"),
    };
  },
};
