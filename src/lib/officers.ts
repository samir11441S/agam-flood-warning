// Officer accounts, PINs, signed sessions, settings and the audit log.
// Shared by the web app, the background worker and the CLI (no Next.js imports here).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./data-dir";
import { attempts, update } from "./store";

const DIR = DATA_DIR;

function readJson<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), "utf8")) as T;
  } catch {
    return fallback;
  }
}

export type Officer = {
  id: string;
  name: string;
  role: "officer" | "admin";
  pinHash: string;
  salt: string;
  /** +8801XXXXXXXXX — receives escalations and can approve by SMS reply. */
  phone?: string;
  /** Private Telegram chat linked with a one-time code from the dashboard; can approve with a button. */
  telegramChatId?: number;
  /** Hash and expiry of the one-time Telegram link code (the code itself is never stored). */
  telegramLink?: { hash: string; exp: number };
  /** Escalation order: lower is contacted first. */
  order: number;
};

export type PublicOfficer = Pick<Officer, "id" | "name" | "role">;

/** With no officers configured, Agam runs in DEMO mode: a demo login exists and nothing is ever sent for real. */
export const DEMO_OFFICER: PublicOfficer = { id: "demo", name: "Demo officer", role: "admin" };
export const DEMO_PIN = "0000";

const hashPin = (pin: string, salt: string) => crypto.scryptSync(pin, salt, 32).toString("hex");
const LINK_MINUTES = 10;
const linkHash = (code: string) => crypto.createHash("sha256").update(`agam-telegram-link:${code}`).digest("hex");

export const officers = {
  all: () => readJson<Officer[]>("officers", []).sort((a, b) => a.order - b.order),
  demoMode: () => officers.all().length === 0,
  add(input: { name: string; pin: string; role?: "officer" | "admin"; phone?: string }) {
    if (!/^\d{6,8}$/.test(input.pin)) throw new Error("PIN must be 6–8 digits");
    // Sign-in is by PIN alone, so two officers must never share one.
    if (!officers.demoMode() && officers.verifyPin(input.pin)) throw new Error("Another officer already uses this PIN — choose a different one");
    const salt = crypto.randomBytes(16).toString("hex");
    let officer!: Officer;
    update<Officer[]>("officers", [], (list) => {
      officer = {
        id: crypto.randomUUID().slice(0, 8),
        name: input.name.trim(),
        role: input.role ?? (list.length === 0 ? "admin" : "officer"),
        pinHash: hashPin(input.pin, salt),
        salt,
        phone: input.phone ? normalisePhone(input.phone) : undefined,
        order: list.length,
      };
      return [...list, officer];
    });
    return officer;
  },
  remove(idOrName: string) {
    update<Officer[]>("officers", [], (list) => list.filter((o) => o.id !== idOrName && o.name !== idOrName));
  },
  update(id: string, patch: Partial<Officer>) {
    update<Officer[]>("officers", [], (list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o)));
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
  /** A one-time 8-digit code (valid 10 min) a signed-in officer sends to the bot to link their private Telegram chat. */
  createTelegramLink(id: string): { code: string; minutes: number } {
    const code = String(crypto.randomInt(10_000_000, 100_000_000));
    officers.update(id, { telegramLink: { hash: linkHash(code), exp: Date.now() + LINK_MINUTES * 60_000 } });
    return { code, minutes: LINK_MINUTES };
  },
  /** Links the chat to the officer whose unexpired code matches. Each code works once; one chat serves one officer. */
  linkTelegram(code: string, chatId: number): Officer | null {
    const h = linkHash(code.trim());
    const o = officers.all().find((x) => x.telegramLink && x.telegramLink.exp > Date.now() && x.telegramLink.hash === h);
    if (!o) return null;
    update<Officer[]>("officers", [], (list) =>
      list.map((x) => {
        if (x.id === o.id) return { ...x, telegramChatId: chatId, telegramLink: undefined };
        return x.telegramChatId === chatId ? { ...x, telegramChatId: undefined } : x;
      }),
    );
    return { ...o, telegramChatId: chatId, telegramLink: undefined };
  },
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
    update<Partial<Settings>>("settings", {}, (s) => ({ ...DEFAULT_SETTINGS, ...s, ...patch }));
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
    try {
      fs.writeFileSync(file, s, { flag: "wx" }); // two processes starting together must agree on one secret
      return s;
    } catch {
      return fs.readFileSync(file, "utf8");
    }
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

/** Constant-time comparison for shared secrets (webhook secrets). */
export function secretMatches(given: string | null | undefined, expected: string | undefined): boolean {
  if (!expected || !given) return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

// ---------- audit log ----------
export type AuditEntry = { at: string; who: string; action: string; areaId?: string; alertId?: string; detail?: string };

export const audit = {
  add(e: Omit<AuditEntry, "at">) {
    update<AuditEntry[]>("audit", [], (list) => [...list.slice(-1999), { at: new Date().toISOString(), ...e }]);
  },
  recent: (n = 50) => readJson<AuditEntry[]>("audit", []).slice(-n).reverse(),
};

// ---------- brute-force protection for PIN sign-in ----------
// Kept on disk, so it is shared by every process and survives restarts. Two limits: per client, and for all
// clients together, so rotating IP addresses does not let anyone guess PINs.
const PER_CLIENT = { limit: 5, windowMin: 10 };
const ALL_CLIENTS = { limit: 20, windowMin: 60 };

export function loginAllowed(client: string) {
  return !attempts.blocked(`login:${client}`, PER_CLIENT.limit, PER_CLIENT.windowMin) && !attempts.blocked("login:*", ALL_CLIENTS.limit, ALL_CLIENTS.windowMin);
}

export function recordLogin(client: string, ok: boolean) {
  if (ok) return attempts.clear(`login:${client}`);
  attempts.hit(`login:${client}`, PER_CLIENT.windowMin);
  attempts.hit("login:*", ALL_CLIENTS.windowMin);
  if (attempts.blocked("login:*", ALL_CLIENTS.limit, ALL_CLIENTS.windowMin)) {
    audit.add({ who: "Agam", action: "paused PIN sign-in", detail: `${ALL_CLIENTS.limit} wrong PINs within ${ALL_CLIENTS.windowMin} min — possible PIN guessing. SMS and Telegram approvals still work.` });
  }
}

/**
 * The client's address for rate limiting. Only trusted when a proxy we control sets it (Vercel, or
 * TRUST_PROXY=1 behind your own reverse proxy); otherwise every client shares one key.
 */
export function clientKey(h: Headers): string {
  if (process.env.VERCEL || process.env.TRUST_PROXY === "1") {
    return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  }
  return "direct";
}
