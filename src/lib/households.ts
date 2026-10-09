// Household lists: synthetic demo households, or a real list uploaded by the union committee (CSV).
import { toBn } from "./bn";
import type { Area } from "./types";

export type Phone = "smartphone" | "feature" | "none";

export type Household = {
  id: string;
  headBn: string;
  village: string;
  members: number;
  elderly: number;
  childrenUnder5: number;
  disabled: boolean;
  pregnant: boolean;
  phone: Phone;
  /** Only present on real, uploaded households. Never generated. */
  phoneNumber?: string;
  /** Neighbour / relative to call if the household does not answer. */
  backupPhoneNumber?: string;
  kutchaHouse: boolean;
  lowLying: boolean;
  shelterKm: number;
  priority: number;
  reasons: string[];
};

export type HouseholdInput = Omit<Household, "priority" | "reasons">;

export const VILLAGES_BN = ["উত্তর পাড়া", "দক্ষিণ পাড়া", "নদীর পাড়", "চর এলাকা", "বাজার পাড়া", "পূর্ব পাড়া", "পশ্চিম পাড়া", "বেড়িবাঁধ এলাকা"];
// Name parts are grouped so that generated names stay culturally coherent.
const NAME_GROUPS: [string[], string[]][] = [
  [["রহিমা", "সালমা", "নূরজাহান", "ফাতেমা", "আমেনা", "রোকসানা", "শাহানা", "মর্জিনা"], ["খাতুন", "বেগম", "আক্তার"]],
  [["আব্দুল করিম", "জসিম", "রফিক", "মিজান", "হাসান", "দুলাল", "ইউসুফ", "আলমগীর"], ["মিয়া", "উদ্দিন", "হোসেন", "শেখ"]],
  [["কল্পনা", "শেফালী", "বিমল", "গোপাল", "অনিল", "মিনতি"], ["দাস", "রায়", "সরকার", "পাল"]],
];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Vulnerability score: who must be reached first. */
export function scoreHousehold(h: HouseholdInput): Household {
  const reasons: string[] = [];
  let priority = 0;
  if (h.lowLying) { priority += 3; reasons.push("নিচু এলাকা"); }
  if (h.disabled) { priority += 3; reasons.push("প্রতিবন্ধী সদস্য"); }
  if (h.elderly) { priority += 2 * h.elderly; reasons.push(`বয়স্ক ${toBn(h.elderly)} জন`); }
  if (h.pregnant) { priority += 2; reasons.push("গর্ভবতী"); }
  if (h.childrenUnder5) { priority += h.childrenUnder5; reasons.push(`ছোট শিশু ${toBn(h.childrenUnder5)} জন`); }
  if (h.kutchaHouse) { priority += 1; reasons.push("কাঁচা ঘর"); }
  if (h.shelterKm > 2) { priority += 1; reasons.push("আশ্রয়কেন্দ্র দূরে"); }
  if (h.phone === "none") { priority += 2; reasons.push("ফোন নেই"); }
  return { ...h, priority, reasons };
}

export type SimReply = "safe" | "help" | "none";

/** Deterministic simulated reply: vulnerable households ask for help more often. */
export function simulatedReply(h: Household): SimReply {
  const r = mulberry32(hash(h.id + ":reply"))();
  const helpP = h.priority >= 9 ? 0.2 : h.priority >= 6 ? 0.08 : 0.03;
  if (r < helpP) return "help";
  if (h.phone !== "none" && r > 0.88) return "none";
  return "safe";
}

/** Synthetic map position within ~4 km of the area centre (demo only). */
export function simulatedPosition(h: Household, area: { lat: number; lon: number }) {
  const rand = mulberry32(hash(h.id + ":pos"));
  return { lat: area.lat + (rand() - 0.5) * 0.07, lon: area.lon + (rand() - 0.5) * 0.07 };
}

export function syntheticHouseholds(area: Area, count = 240): Household[] {
  const rand = mulberry32(hash(area.id));
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const list: Household[] = [];
  for (let i = 0; i < count; i++) {
    const members = 2 + Math.floor(rand() * 6);
    const elderly = rand() < 0.3 ? 1 + Math.floor(rand() * 2) : 0;
    const childrenUnder5 = rand() < 0.4 ? 1 + Math.floor(rand() * 2) : 0;
    const disabled = rand() < 0.08;
    const pregnant = rand() < 0.06;
    const r = rand();
    const phone: Phone = r < 0.35 ? "smartphone" : r < 0.85 ? "feature" : "none";
    const v = Math.floor(rand() * 6);
    const lowLying = v === 2 || v === 3 ? rand() < 0.8 : rand() < 0.3;
    const kutchaHouse = rand() < 0.55;
    const shelterKm = Math.round((0.3 + rand() * 3.5) * 10) / 10;
    list.push(scoreHousehold({
      id: `${area.id}-${String(i + 1).padStart(3, "0")}`,
      headBn: (([first, last]) => `${pick(first)} ${pick(last)}`)(pick(NAME_GROUPS)),
      village: VILLAGES_BN[v], members, elderly, childrenUnder5, disabled, pregnant, phone, kutchaHouse, lowLying, shelterKm,
    }));
  }
  return list.sort((a, b) => b.priority - a.priority);
}

export const CSV_COLUMNS = ["name", "phone", "backup_phone", "consent", "village", "members", "elderly", "children_under5", "disabled", "pregnant", "low_lying", "kutcha_house", "shelter_km"] as const;

/** Parses the committee's household list. Bangladeshi numbers are normalised to +8801XXXXXXXXX. */
export function parseHouseholdCsv(areaId: string, csv: string): { households: Household[]; errors: string[] } {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  const header = (lines.shift() ?? "").split(",").map((h) => h.trim().toLowerCase());
  const missing = ["name", "phone", "village", "consent"].filter((c) => !header.includes(c));
  if (missing.length) return { households: [], errors: [`Missing column(s): ${missing.join(", ")}`] };
  const col = (row: string[], name: string) => row[header.indexOf(name)]?.trim() ?? "";
  const yes = (v: string) => /^(1|y|yes|true|হ্যাঁ)$/i.test(v);
  const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const errors: string[] = [];
  const households: Household[] = [];
  lines.forEach((line, i) => {
    const row = line.split(",");
    if (!yes(col(row, "consent"))) { errors.push(`Row ${i + 2}: skipped — no consent recorded`); return; }
    const toNumber = (raw: string) => {
      const m = raw.replace(/[\s-]/g, "").match(/^(?:\+?88)?(01[3-9]\d{8})$/);
      return m ? "+88" + m[1] : null;
    };
    let phoneNumber: string | undefined;
    if (col(row, "phone")) {
      const n = toNumber(col(row, "phone"));
      if (!n) { errors.push(`Row ${i + 2}: invalid phone number "${col(row, "phone")}"`); return; }
      phoneNumber = n;
    }
    const backupPhoneNumber = col(row, "backup_phone") ? toNumber(col(row, "backup_phone")) ?? undefined : undefined;
    households.push(scoreHousehold({
      id: `${areaId}-r${i + 1}`,
      headBn: col(row, "name") || `পরিবার ${toBn(i + 1)}`,
      village: col(row, "village") || "—",
      members: num(col(row, "members")) || 1,
      elderly: num(col(row, "elderly")),
      childrenUnder5: num(col(row, "children_under5")),
      disabled: yes(col(row, "disabled")),
      pregnant: yes(col(row, "pregnant")),
      phone: phoneNumber ? "feature" : "none",
      phoneNumber,
      backupPhoneNumber,
      lowLying: yes(col(row, "low_lying")),
      kutchaHouse: yes(col(row, "kutcha_house")),
      shelterKm: num(col(row, "shelter_km")),
    }));
  });
  return { households: households.sort((a, b) => b.priority - a.priority), errors };
}

export type DispatchPlan = {
  total: number;
  people: number;
  voiceCalls: number;
  smsBackup: number;
  doorKnock: { volunteer: string; households: Household[] }[];
  minutesToReachAll: number;
  priorityFirst: Household[];
  all: Household[];
  source: "demo" | "uploaded";
};

const CALL_LINES = 30;
const CALL_MINUTES = 1.5;
const DOOR_MINUTES = 6;

export function dispatchPlan(households: Household[], source: "demo" | "uploaded" = "demo", volunteers = 8): DispatchPlan {
  const withPhone = households.filter((h) => h.phone !== "none");
  const noPhone = households.filter((h) => h.phone === "none");
  const teams = Array.from({ length: volunteers }, (_, i) => ({ volunteer: `স্বেচ্ছাসেবক ${toBn(i + 1)}`, households: [] as Household[] }));
  // Contiguous chunks of the village-sorted list, so each volunteer walks one or two neighbourhoods.
  const route = [...noPhone].sort((a, b) => a.village.localeCompare(b.village) || b.priority - a.priority);
  const perVolunteer = Math.max(1, Math.ceil(route.length / volunteers));
  route.forEach((h, i) => teams[Math.floor(i / perVolunteer)].households.push(h));
  const callMinutes = Math.ceil(withPhone.length / CALL_LINES) * CALL_MINUTES;
  const doorMinutes = Math.max(0, ...teams.map((t) => t.households.length)) * DOOR_MINUTES;
  return {
    total: households.length,
    people: households.reduce((a, h) => a + h.members, 0),
    voiceCalls: withPhone.length,
    smsBackup: withPhone.length,
    doorKnock: teams.filter((t) => t.households.length),
    minutesToReachAll: Math.ceil(Math.max(callMinutes, doorMinutes)),
    priorityFirst: households.slice(0, 12),
    all: households,
    source,
  };
}
