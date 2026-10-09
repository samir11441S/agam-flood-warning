// Tiny JSON-file store shared by the Next.js server and the Telegram bot process (local demo use).
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./data-dir";
import type { AlertContent, AlertFacts } from "./alerts";
import type { Household } from "./households";
import type { OutboxEntry } from "./api-types";
import type { Level } from "./types";

const DIR = DATA_DIR;

export type Subscriber = { chatId: number; areaId: string; name: string; since: string };
export type Approval = { officer: string; officerId: string; at: string; via: "dashboard" | "sms" | "telegram" | "auto-policy" };
export type SavedAlert = {
  id: string;
  /** Short code officers type in SMS replies, e.g. "1 4821" to approve. */
  code: string;
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

function read<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), "utf8")) as T;
  } catch {
    return fallback;
  }
}

function write(name: string, value: unknown) {
  fs.mkdirSync(DIR, { recursive: true });
  const file = path.join(DIR, `${name}.json`);
  fs.writeFileSync(file + ".tmp", JSON.stringify(value, null, 1));
  fs.renameSync(file + ".tmp", file);
}

export const subscribers = {
  all: () => read<Subscriber[]>("subscribers", []),
  forArea: (areaId: string) => subscribers.all().filter((s) => s.areaId === areaId),
  upsert(s: Subscriber) {
    write("subscribers", [...subscribers.all().filter((x) => !(x.chatId === s.chatId && x.areaId === s.areaId)), s]);
  },
  removeChat(chatId: number) {
    write("subscribers", subscribers.all().filter((x) => x.chatId !== chatId));
  },
};

export const alerts = {
  all: () => read<SavedAlert[]>("alerts", []),
  get: (id: string) => read<SavedAlert[]>("alerts", []).find((a) => a.id === id),
  byCode: (code: string) => [...read<SavedAlert[]>("alerts", [])].reverse().find((a) => a.code === code && a.status === "pending"),
  pending: () => read<SavedAlert[]>("alerts", []).filter((a) => a.status === "pending"),
  save(a: SavedAlert) {
    const list = read<SavedAlert[]>("alerts", []).filter((x) => x.id !== a.id);
    write("alerts", [...list.slice(-199), a]);
  },
};

export const replies = {
  forAlert: (alertId: string) => read<Reply[]>("replies", []).filter((r) => r.alertId === alertId),
  record(r: Reply) {
    const same = (x: Reply) => x.alertId === r.alertId && (r.chatId !== undefined ? x.chatId === r.chatId : x.phone === r.phone);
    const list = read<Reply[]>("replies", []).filter((x) => !same(x));
    write("replies", [...list, r]);
  },
  /** Attach a shared location to this chat's most recent "help" reply. */
  attachLocation(chatId: number, location: { lat: number; lon: number }) {
    const list = read<Reply[]>("replies", []);
    const idx = list.findLastIndex((r) => r.chatId === chatId && r.status === "help");
    if (idx < 0) return null;
    list[idx] = { ...list[idx], location };
    write("replies", list);
    return list[idx];
  },
};

export type Contact = { name: string; phone: string; role: "volunteer" | "announcer" };

export const areaLists = {
  households: (areaId: string) => read<Record<string, Household[]>>("households", {})[areaId] ?? null,
  uploadedAt: (areaId: string) => read<Record<string, string>>("lists-uploaded", {})[areaId] ?? null,
  setHouseholds(areaId: string, list: Household[]) {
    write("households", { ...read<Record<string, Household[]>>("households", {}), [areaId]: list });
    write("lists-uploaded", { ...read<Record<string, string>>("lists-uploaded", {}), [areaId]: new Date().toISOString() });
  },
  /** Deletes all personal data held for an area (household list and contacts). */
  clear(areaId: string) {
    const h = read<Record<string, Household[]>>("households", {});
    const c = read<Record<string, Contact[]>>("contacts", {});
    const u = read<Record<string, string>>("lists-uploaded", {});
    delete h[areaId]; delete c[areaId]; delete u[areaId];
    write("households", h); write("contacts", c); write("lists-uploaded", u);
  },
  contacts: (areaId: string) => read<Record<string, Contact[]>>("contacts", {})[areaId] ?? [],
  setContacts(areaId: string, list: Contact[]) {
    write("contacts", { ...read<Record<string, Contact[]>>("contacts", {}), [areaId]: list });
  },
};

/** "Water is rising here" reports from residents and volunteers (Telegram, SMS, dashboard). */
export type CommunityReport = { chatId?: number; phone?: string; areaId: string; name: string; at: string; source: "telegram" | "sms" | "volunteer"; note?: string; location?: { lat: number; lon: number } };

export const reports = {
  add(r: CommunityReport) {
    write("reports", [...read<CommunityReport[]>("reports", []).slice(-999), r]);
  },
  attachLocation(chatId: number, location: { lat: number; lon: number }) {
    const list = read<CommunityReport[]>("reports", []);
    const idx = list.findLastIndex((r) => r.chatId === chatId);
    if (idx >= 0) list[idx] = { ...list[idx], location };
    write("reports", list);
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
    write("official", { ...read<Record<string, OfficialStatus>>("official", {}), [areaId]: s });
  },
};

/** Anonymous comprehension-test answers from the field-test page (no names or phone numbers). */
export type FieldTestAnswer = { at: string; answers: Record<string, string>; ageGroup?: string; gender?: string; canRead?: string; area?: string };

export const fieldTests = {
  all: () => read<FieldTestAnswer[]>("field-tests", []),
  add(a: FieldTestAnswer) {
    write("field-tests", [...read<FieldTestAnswer[]>("field-tests", []), a]);
  },
};
