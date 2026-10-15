// Tiny JSON-file store shared by the Next.js server and the background worker (separate processes).
// Every read-modify-write goes through update(), which holds a cross-process file lock.
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./data-dir";
import { withFileLock } from "./file-lock";
import type { AlertContent, AlertFacts } from "./alerts";
import type { Household } from "./households";
import type { OutboxEntry } from "./api-types";
import type { Level } from "./types";

const DIR = DATA_DIR;

export type Subscriber = { chatId: number; areaId: string; name: string; since: string };
export type Approval = { officer: string; officerId: string; at: string; via: "dashboard" | "sms" | "telegram" | "auto-policy" };
export type SavedAlert = {
  id: string;
  /** Short code officers type in SMS replies, e.g. "1 482193" to approve. */
  code: string;
  /** "all-clear" tells residents the danger has passed; it is never written by AI. */
  kind?: "warning" | "all-clear";
  areaId: string;
  level: Level;
  content: AlertContent;
  facts?: AlertFacts;
  createdAt: string;
  createdBy: string;
  status: "pending" | "sent" | "rejected" | "superseded";
  approvals: Approval[];
  escalations: { at: string; to: string }[];
  rejectedBy?: string;
  sentAt?: string;
  sentTo?: number;
  outbox?: OutboxEntry[];
  /** Replay alerts are demo-only and never reach real channels. */
  scenario: "live" | "replay";
};
/** A resident's answer to an alert: Telegram button, SMS "1"/"2", or keypad 1/2 during the voice call. */
export type Reply = {
  channel: "telegram" | "sms" | "voice";
  chatId?: number;
  phone?: string;
  alertId: string;
  areaId: string;
  name: string;
  village?: string;
  status: "safe" | "help";
  at: string;
  note?: string;
  location?: { lat: number; lon: number };
};

const fileOf = (name: string) => path.join(DIR, `${name}.json`);

/** Reads one JSON file (no lock needed: writes replace the file atomically). */
export function load<T>(name: string, fallback: T): T {
  return read(name, fallback);
}

function read<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(fileOf(name), "utf8")) as T;
  } catch {
    return fallback;
  }
}

function write(name: string, value: unknown) {
  const file = fileOf(name);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 1));
  fs.renameSync(tmp, file);
}

/** Locked read-modify-write of one JSON file. Returns the new value. */
export function update<T>(name: string, fallback: T, fn: (current: T) => T): T {
  fs.mkdirSync(DIR, { recursive: true });
  return withFileLock(fileOf(name), () => {
    const next = fn(read(name, fallback));
    write(name, next);
    return next;
  });
}

export const subscribers = {
  all: () => read<Subscriber[]>("subscribers", []),
  forArea: (areaId: string) => subscribers.all().filter((s) => s.areaId === areaId),
  upsert(s: Subscriber) {
    update<Subscriber[]>("subscribers", [], (list) => [...list.filter((x) => !(x.chatId === s.chatId && x.areaId === s.areaId)), s]);
  },
  removeChat(chatId: number) {
    update<Subscriber[]>("subscribers", [], (list) => list.filter((x) => x.chatId !== chatId));
  },
};

export const alerts = {
  all: () => read<SavedAlert[]>("alerts", []),
  get: (id: string) => read<SavedAlert[]>("alerts", []).find((a) => a.id === id),
  byCode: (code: string) => [...read<SavedAlert[]>("alerts", [])].reverse().find((a) => a.code === code && a.status === "pending"),
  pending: () => read<SavedAlert[]>("alerts", []).filter((a) => a.status === "pending"),
  /** The most recent alert of this kind that went out for an area. */
  lastSent: (areaId: string, scenario: SavedAlert["scenario"], kind: "warning" | "all-clear" = "warning") =>
    [...read<SavedAlert[]>("alerts", [])].reverse().find((a) => a.areaId === areaId && a.scenario === scenario && a.status === "sent" && (a.kind ?? "warning") === kind),
  save(a: SavedAlert) {
    update<SavedAlert[]>("alerts", [], (list) => [...list.filter((x) => x.id !== a.id).slice(-199), a]);
  },
  /** Atomically changes one alert (other processes' changes are never overwritten). */
  update(id: string, fn: (a: SavedAlert) => SavedAlert): SavedAlert | undefined {
    let changed: SavedAlert | undefined;
    update<SavedAlert[]>("alerts", [], (list) => list.map((a) => (a.id === id ? (changed = fn(a)) : a)));
    return changed;
  },
};

export const replies = {
  forAlert: (alertId: string) => read<Reply[]>("replies", []).filter((r) => r.alertId === alertId),
  /** Records a reply (one per person per alert) and returns that person's previous reply, if any. */
  record(r: Reply): Reply | undefined {
    const same = (x: Reply) => x.alertId === r.alertId && (r.chatId !== undefined ? x.chatId === r.chatId : x.phone === r.phone);
    let previous: Reply | undefined;
    update<Reply[]>("replies", [], (list) => {
      previous = list.find(same);
      return [...list.filter((x) => !same(x)), r];
    });
    return previous;
  },
  /** Attach a shared location to this chat's most recent "help" reply. */
  attachLocation(chatId: number, location: { lat: number; lon: number }) {
    let found: Reply | null = null;
    update<Reply[]>("replies", [], (list) => {
      const idx = list.findLastIndex((r) => r.chatId === chatId && r.status === "help");
      if (idx < 0) return list;
      found = { ...list[idx], location };
      return list.map((r, i) => (i === idx ? found! : r));
    });
    return found as Reply | null;
  },
};

export type Contact = { name: string; phone: string; role: "volunteer" | "announcer" };

export const areaLists = {
  households: (areaId: string) => read<Record<string, Household[]>>("households", {})[areaId] ?? null,
  uploadedAt: (areaId: string) => read<Record<string, string>>("lists-uploaded", {})[areaId] ?? null,
  setHouseholds(areaId: string, list: Household[]) {
    update<Record<string, Household[]>>("households", {}, (h) => ({ ...h, [areaId]: list }));
    update<Record<string, string>>("lists-uploaded", {}, (u) => ({ ...u, [areaId]: new Date().toISOString() }));
  },
  /** Deletes all personal data held for an area (household list and contacts). */
  clear(areaId: string) {
    const drop = <T,>(v: Record<string, T>) => Object.fromEntries(Object.entries(v).filter(([k]) => k !== areaId));
    update<Record<string, Household[]>>("households", {}, drop);
    update<Record<string, Contact[]>>("contacts", {}, drop);
    update<Record<string, string>>("lists-uploaded", {}, drop);
  },
  contacts: (areaId: string) => read<Record<string, Contact[]>>("contacts", {})[areaId] ?? [],
  setContacts(areaId: string, list: Contact[]) {
    update<Record<string, Contact[]>>("contacts", {}, (c) => ({ ...c, [areaId]: list }));
  },
};

/** "Water is rising here" reports from residents and volunteers (Telegram, SMS, dashboard). */
export type CommunityReport = { chatId?: number; phone?: string; areaId: string; name: string; at: string; source: "telegram" | "sms" | "volunteer"; note?: string; location?: { lat: number; lon: number } };

export const reports = {
  add(r: CommunityReport) {
    update<CommunityReport[]>("reports", [], (list) => [...list.slice(-999), r]);
  },
  attachLocation(chatId: number, location: { lat: number; lon: number }) {
    update<CommunityReport[]>("reports", [], (list) => {
      const idx = list.findLastIndex((r) => r.chatId === chatId);
      return idx < 0 ? list : list.map((r, i) => (i === idx ? { ...r, location } : r));
    });
  },
  /** Reports for an area within the last `hours` before `now` (ISO). */
  recent(areaId: string, hours: number, now = Date.now()) {
    return read<CommunityReport[]>("reports", []).filter((r) => r.areaId === areaId && now - Date.parse(r.at) <= hours * 3600_000 && Date.parse(r.at) <= now);
  },
};

/** The official status (FFWC / BMD / DDM) for an area, as recorded by an officer from the official bulletin. */
export type OfficialStatus = { level: 0 | 1 | 2 | 3; source: string; note?: string; by: string; at: string };

export const official = {
  get: (areaId: string) => read<Record<string, OfficialStatus>>("official", {})[areaId] ?? null,
  all: () => read<Record<string, OfficialStatus>>("official", {}),
  set(areaId: string, s: OfficialStatus) {
    update<Record<string, OfficialStatus>>("official", {}, (o) => ({ ...o, [areaId]: s }));
  },
};

/** Anonymous comprehension-test answers from the field-test page (no names or phone numbers). */
export type FieldTestAnswer = { at: string; answers: Record<string, string>; ageGroup?: string; gender?: string; canRead?: string; area?: string };

export const fieldTests = {
  all: () => read<FieldTestAnswer[]>("field-tests", []),
  add(a: FieldTestAnswer) {
    update<FieldTestAnswer[]>("field-tests", [], (list) => [...list.slice(-9999), a]);
  },
};

/** Health of the live weather feed, kept by the worker so officers hear when Agam cannot see. */
export type FeedHealth = { lastOkAt?: string; failingSince?: string; lastError?: string; outageNotifiedAt?: string };

export const feedHealth = {
  get: () => read<FeedHealth>("feed-health", {}),
  set: (fn: (h: FeedHealth) => FeedHealth) => update<FeedHealth>("feed-health", {}, fn),
};

/**
 * Persistent attempt counter shared by all processes (wrong PINs, wrong SMS approval codes, Telegram link codes).
 * hit() records one failure; blocked() is true once `limit` failures happened within `windowMin`.
 */
type Attempts = Record<string, number[]>;
export const attempts = {
  blocked(key: string, limit: number, windowMin: number, now = Date.now()) {
    return (read<Attempts>("attempts", {})[key] ?? []).filter((t) => now - t < windowMin * 60_000).length >= limit;
  },
  hit(key: string, windowMin: number, now = Date.now()) {
    update<Attempts>("attempts", {}, (all) => {
      // Drop anything older than a day so the file stays small.
      const fresh: Attempts = {};
      for (const [k, ts] of Object.entries(all)) {
        const kept = ts.filter((t) => now - t < 24 * 3600_000);
        if (kept.length) fresh[k] = kept;
      }
      fresh[key] = [...(fresh[key] ?? []).filter((t) => now - t < windowMin * 60_000), now];
      return fresh;
    });
  },
  clear(key: string) {
    update<Attempts>("attempts", {}, (all) => Object.fromEntries(Object.entries(all).filter(([k]) => k !== key)));
  },
};
