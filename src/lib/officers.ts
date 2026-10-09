// Officer accounts, PINs, signed sessions, settings and the audit log.
// Shared by the web app, the background worker and the CLI (no Next.js imports here).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./data-dir";

const DIR = DATA_DIR;

function readJson<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(name: string, value: unknown) {
  fs.mkdirSync(DIR, { recursive: true });
  const file = path.join(DIR, `${name}.json`);
  fs.writeFileSync(file + ".tmp", JSON.stringify(value, null, 1));
  fs.renameSync(file + ".tmp", file);
}

export type Officer = {
  id: string;
  name: string;
  role: "officer" | "admin";
  pinHash: string;
  salt: string;
  /** +8801XXXXXXXXX — receives escalations and can approve by SMS reply. */
  phone?: string;
  /** Linked with /officer <PIN> in the Telegram bot; can approve with a button. */
  telegramChatId?: number;
  /** Escalation order: lower is contacted first. */
  order: number;
};

export type PublicOfficer = Pick<Officer, "id" | "name" | "role">;

/** With no officers configured, Agam runs in DEMO mode: a demo login exists and nothing is ever sent for real. */
export const DEMO_OFFICER: PublicOfficer = { id: "demo", name: "Demo officer", role: "admin" };
export const DEMO_PIN = "0000";

const hashPin = (pin: string, salt: string) => crypto.scryptSync(pin, salt, 32).toString("hex");

export const officers = {
  all: () => readJson<Officer[]>("officers", []).sort((a, b) => a.order - b.order),
  demoMode: () => officers.all().length === 0,
  add(input: { name: string; pin: string; role?: "officer" | "admin"; phone?: string }) {
    if (!/^\d{4,8}$/.test(input.pin)) throw new Error("PIN must be 4–8 digits");
    const list = officers.all();
    const salt = crypto.randomBytes(16).toString("hex");
    const officer: Officer = {
      id: crypto.randomUUID().slice(0, 8),
      name: input.name.trim(),
      role: input.role ?? (list.length === 0 ? "admin" : "officer"),
      pinHash: hashPin(input.pin, salt),
      salt,
      phone: input.phone ? normalisePhone(input.phone) : undefined,
      order: list.length,
    };
    writeJson("officers", [...list, officer]);
    return officer;
  },
  remove(idOrName: string) {
    writeJson("officers", officers.all().filter((o) => o.id !== idOrName && o.name !== idOrName));
  },
  update(id: string, patch: Partial<Officer>) {
    writeJson("officers", officers.all().map((o) => (o.id === id ? { ...o, ...patch } : o)));
  },
  verifyPin(pin: string): PublicOfficer | null {
    if (officers.demoMode()) return pin === DEMO_PIN ? DEMO_OFFICER : null;
    for (const o of officers.all()) {
      const a = Buffer.from(hashPin(pin, o.salt), "hex");
      if (crypto.timingSafeEqual(a, Buffer.from(o.pinHash, "hex"))) return { id: o.id, name: o.name, role: o.role };
    }
    return null;
  },
  byPhone: (phone: string) => officers.all().find((o) => o.phone && o.phone === normalisePhone(phone)),
  byTelegram: (chatId: number) => officers.all().find((o) => o.telegramChatId === chatId),
};

export function normalisePhone(raw: string): string {
  const m = raw.replace(/[\s-]/g, "").match(/^(?:\+?88)?(01[3-9]\d{8})$/);
  if (!m) throw new Error(`Not a Bangladeshi mobile number: ${raw}`);
  return "+88" + m[1];
}

// ---------- settings ----------
export type Settings = {
  /** Danger alerts need approval from two different officers. */
  twoPersonDanger: boolean;
  /** Minutes before an unapproved alert is escalated to the next officer. */
  escalateAfterMin: number;
  /** Minutes after which an unapproved DANGER alert is sent automatically (verified template). null = never. */
  autoSendDangerAfterMin: number | null;
  /** The worker drafts alerts by itself when live risk reaches Warning or Danger. */
  autoDetect: boolean;
};

const DEFAULT_SETTINGS: Settings = { twoPersonDanger: false, escalateAfterMin: 15, autoSendDangerAfterMin: 45, autoDetect: true };

export const settings = {
  get: (): Settings => ({ ...DEFAULT_SETTINGS, ...readJson<Partial<Settings>>("settings", {}) }),
  set(patch: Partial<Settings>) {
    writeJson("settings", { ...settings.get(), ...patch });
  },
};

// ---------- signed session tokens ----------
function secret(): string {
  if (process.env.AGAM_SECRET) return process.env.AGAM_SECRET;
  const file = path.join(DIR, "secret");
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    fs.mkdirSync(DIR, { recursive: true });
    const s = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(file, s);
    return s;
  }
}

const SESSION_HOURS = 12;

export function signSession(o: PublicOfficer): string {
  const body = Buffer.from(JSON.stringify({ ...o, exp: Date.now() + SESSION_HOURS * 3600_000 })).toString("base64url");
  const mac = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifySession(token: string | undefined): PublicOfficer | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  const data = JSON.parse(Buffer.from(body, "base64url").toString()) as PublicOfficer & { exp: number };
  if (data.exp < Date.now()) return null;
  // A removed officer's session stops working immediately.
  if (data.id !== DEMO_OFFICER.id && !officers.all().some((o) => o.id === data.id)) return null;
  if (data.id === DEMO_OFFICER.id && !officers.demoMode()) return null;
  return { id: data.id, name: data.name, role: data.role };
}

// ---------- audit log ----------
export type AuditEntry = { at: string; who: string; action: string; areaId?: string; alertId?: string; detail?: string };

export const audit = {
  add(e: Omit<AuditEntry, "at">) {
    const list = readJson<AuditEntry[]>("audit", []);
    list.push({ at: new Date().toISOString(), ...e });
    writeJson("audit", list.slice(-2000));
  },
  recent: (n = 50) => readJson<AuditEntry[]>("audit", []).slice(-n).reverse(),
};

// ---------- simple brute-force protection for PIN logins ----------
const failures = new Map<string, { count: number; until: number }>();
export function loginAllowed(key: string) {
  const f = failures.get(key);
  return !f || f.until < Date.now() || f.count < 5;
}
export function recordLogin(key: string, ok: boolean) {
  if (ok) return failures.delete(key);
  const f = failures.get(key) ?? { count: 0, until: 0 };
  f.count = f.until < Date.now() && f.count >= 5 ? 1 : f.count + 1;
  f.until = Date.now() + 10 * 60_000;
  failures.set(key, f);
}
