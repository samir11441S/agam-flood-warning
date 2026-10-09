// Tracks every household's voice call after an alert: retry unanswered calls, try the backup number,
// then hand the home to a volunteer. Real call outcomes arrive from the IVR provider's status webhook;
// in test mode outcomes are simulated so the flow can be demonstrated.
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./data-dir";
import type { Household } from "./households";

const DIR = DATA_DIR;
const FILE = path.join(DIR, "deliveries.json");

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

function readAll(): Delivery[] {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as Delivery[];
  } catch {
    return [];
  }
}

function writeAll(list: Delivery[]) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(FILE + ".tmp", JSON.stringify(list));
  fs.renameSync(FILE + ".tmp", FILE);
}

/** Deterministic simulated answer (test mode): ~70% answer each attempt. */
function simulatedAnswer(d: Delivery) {
  let h = 2166136261;
  for (const c of `${d.householdId}:${d.attempts}:${d.backupTried}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) % 100 < 70;
}

export const deliveries = {
  all: () => readAll(),
  forAlert: (alertId: string) => readAll().filter((d) => d.alertId === alertId),

  start(alertId: string, areaId: string, homes: Household[], live: boolean) {
    const now = new Date().toISOString();
    const fresh: Delivery[] = homes.filter((h) => h.phoneNumber).map((h) => ({
      alertId, areaId, householdId: h.id, headBn: h.headBn, village: h.village, phone: h.phoneNumber!, backupPhone: h.backupPhoneNumber,
      attempts: 1, backupTried: false, status: "calling", live, lastAt: now,
    }));
    writeAll([...readAll().filter((d) => d.alertId !== alertId), ...fresh]);
  },

  /** Called by the IVR provider's status webhook (live mode). The worker decides what happens next. */
  report(phone: string, answered: boolean) {
    const list = readAll();
    const d = [...list].reverse().find((x) => (x.phone === phone || x.backupPhone === phone) && (x.status === "calling" || x.status === "backup"));
    if (!d) return null;
    d.status = answered ? "answered" : "retry";
    d.lastAt = new Date().toISOString();
    writeAll(list);
    return d;
  },

  /**
   * One worker step: resolve simulated calls (test mode), retry unanswered calls after RETRY_AFTER_MIN,
   * then try the backup number, then hand the home to a volunteer. `call` places a real call (live mode).
   * Returns the homes newly handed to volunteers.
   */
  async tick(call: (to: string, d: Delivery) => Promise<{ ok: boolean }>, now = Date.now()) {
    const list = readAll();
    const handed: Delivery[] = [];
    for (const d of list) {
      if (d.status === "answered" || d.status === "volunteer") continue;
      if (!d.live && (d.status === "calling" || d.status === "backup")) {
        d.status = simulatedAnswer(d) ? "answered" : "retry";
        continue;
      }
      if (d.status !== "retry") continue; // live call in progress: wait for the provider's status webhook
      const next = d.attempts < MAX_ATTEMPTS ? "call" : d.backupPhone && !d.backupTried ? "backup" : "volunteer";
      if (next !== "volunteer" && d.live && now - Date.parse(d.lastAt) < RETRY_AFTER_MIN * 60_000) continue;
      if (next === "call") {
        d.attempts++;
        d.status = "calling";
        if (d.live) await call(d.phone, d);
      } else if (next === "backup") {
        d.backupTried = true;
        d.status = "backup";
        if (d.live) await call(d.backupPhone!, d);
      } else {
        d.status = "volunteer";
        handed.push(d);
      }
      d.lastAt = new Date(now).toISOString();
    }
    writeAll(list);
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
