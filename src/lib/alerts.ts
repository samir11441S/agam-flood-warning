import { toAscii, toBn } from "./bn";
import { LEVELS, type Area, type Assessment, type Level } from "./types";

export { toBn };

export type AlertFacts = {
  areaId: string;
  areaBn: string;
  areaEn: string;
  /** Who the message comes from — always the local committee, never 'Agam'. */
  senderBn: string;
  districtBn: string;
  riverBn: string;
  level: Level;
  levelBn: string;
  levelEn: string;
  eta: [number, number] | null;
  causeBn: string;
  causeEn: string;
  shelterBn: string;
  dialect: "sylheti" | "chatgaiya" | null;
  allowedNumbers: number[];
};

export type AlertContent = {
  sms_bn: string;
  voice_bn: string;
  dialect_voice: string | null;
  checklist_bn: string[];
  official_summary_en: string;
};

export type Check = { name: string; ok: boolean; detail?: string };

const SYLHET_DISTRICTS = new Set(["Sylhet", "Sunamganj", "Habiganj"]);
const CHATTOGRAM_DISTRICTS = new Set(["Chattogram"]);

export function buildFacts(area: Area, a: Assessment): AlertFacts {
  const top = a.signals[0];
  const numbers = new Set<number>([999]);
  if (a.etaHours) a.etaHours.forEach((h) => numbers.add(Math.max(1, h)));
  let causeBn = `${area.riverBn} নদী অববাহিকায় ভারী বৃষ্টি হয়েছে।`;
  let causeEn = `Heavy rain in the ${area.river} catchment.`;
  if (a.heldFromDaysAgo) {
    causeBn = `গত কয়েক দিনের ভারী বৃষ্টির পানি এখনও নামেনি। ${area.riverBn} নদী ও আশপাশের এলাকায় পানি বিপজ্জনক অবস্থায় থাকতে পারে।`;
    causeEn = `Danger was issued ${a.heldFromDaysAgo} day(s) ago; flood water may still be high. Held at Warning until an officer gives the all-clear.`;
  } else if (top) {
    numbers.add(top.value);
    const rarity = top.level === 3 ? 5 : 2;
    if (top.kind === "upstream_rain" || top.kind === "local_rain") {
      const win = top.window === "24h" ? 24 : top.window === "72h" ? 72 : 120;
      numbers.add(win);
      const rare = top.value >= top.threshold;
      if (rare) numbers.add(rarity);
      causeBn = `${top.whereBn} এলাকায় গত ${toBn(win)} ঘণ্টায় ${toBn(top.value)} মিলিমিটার বৃষ্টি হয়েছে${rare ? `, যা সেখানে সাধারণত ${toBn(rarity)} বছরে একবার হয়` : ""}।`;
      causeEn = `${top.where} received ${top.value} mm in ${win}h${rare ? ` (≈1-in-${rarity}-year rainfall there)` : ""}.`;
    } else if (top.kind === "forecast_rain") {
      numbers.add(72);
      causeBn = `${top.whereBn} এলাকায় আগামী ${toBn(72)} ঘণ্টায় ${toBn(top.value)} মিলিমিটার বৃষ্টির পূর্বাভাস রয়েছে।`;
      causeEn = `${top.value} mm of rain forecast at ${top.where} over the next 72h.`;
    } else if (top.kind === "river") {
      causeBn = `${area.riverBn} নদীর প্রবাহ স্বাভাবিকের চেয়ে অনেক বেশি এবং আরও বাড়ছে।`;
      causeEn = `${area.river} discharge forecast at ${top.value} m³/s, above the ≈${top.level === 3 ? 5 : 2}-year flood flow (${top.threshold} m³/s).`;
    }
  }
  return {
    areaId: area.id,
    areaBn: area.nameBn,
    districtBn: area.districtBn,
    riverBn: area.riverBn,
    level: a.level,
    levelBn: LEVELS[a.level].bn,
    levelEn: LEVELS[a.level].en,
    eta: a.etaHours,
    causeBn,
    causeEn,
    areaEn: area.name,
    senderBn: `${area.nameBn} দুর্যোগ ব্যবস্থাপনা কমিটি`,
    shelterBn: a.level === 3 ? "নিকটস্থ বন্যা আশ্রয়কেন্দ্র" : "নিকটস্থ আশ্রয়কেন্দ্র",
    dialect: SYLHET_DISTRICTS.has(area.district) ? "sylheti" : CHATTOGRAM_DISTRICTS.has(area.district) ? "chatgaiya" : null,
    allowedNumbers: [...numbers],
  };
}

const CHECKLIST: Record<number, string[]> = {
  1: ["মোবাইল ফোন চার্জ দিয়ে রাখুন", "রেডিও/টিভি ও পরবর্তী বার্তার দিকে নজর রাখুন", "জরুরি কাগজপত্র পলিথিনে মুড়ে রাখুন"],
  2: ["জরুরি কাগজপত্র, ওষুধ ও শুকনো খাবার পলিথিনে মুড়ে রাখুন", "গবাদিপশু উঁচু স্থানে সরিয়ে নিন", "নিরাপদ খাবার পানি জমিয়ে রাখুন", "আশ্রয়কেন্দ্রে যাওয়ার পথ জেনে রাখুন", "মোবাইল ফোন চার্জ দিয়ে রাখুন"],
  3: ["এখনই বয়স্ক, প্রতিবন্ধী, গর্ভবতী নারী ও শিশুদের সরিয়ে নিন", "জরুরি কাগজপত্র ও ওষুধ সঙ্গে নিন", "বিদ্যুতের মেইন সুইচ বন্ধ করুন", "স্রোতের পানিতে হাঁটবেন না, শিশুদের পানির কাছে যেতে দেবেন না", "গবাদিপশু উঁচু স্থানে বেঁধে রাখুন"],
};

export function templateAlert(f: AlertFacts): AlertContent {
  const eta = f.eta ? `আগামী ${toBn(Math.max(1, f.eta[0]))}-${toBn(f.eta[1])} ঘণ্টার মধ্যে ` : "";
  const sms = {
    1: `${f.levelBn}: ${f.areaBn} (${f.districtBn})-এর উজানে ভারী বৃষ্টি হচ্ছে। ${f.riverBn} নদীর পানির দিকে নজর রাখুন, ফোন চালু রাখুন।`,
    2: `${f.levelBn}: ${f.areaBn} (${f.districtBn})-এ ${eta}${f.riverBn} নদীর পানি বাড়তে পারে। জরুরি জিনিস গুছিয়ে রাখুন, গবাদিপশু উঁচু স্থানে নিন। জরুরি: ৯৯৯`,
    3: `${f.levelBn}: ${f.areaBn} (${f.districtBn})-এ ${eta}${f.riverBn} নদীর পানি দ্রুত বাড়তে পারে। এখনই ${f.shelterBn} বা নিরাপদ উঁচু স্থানে যান। বয়স্ক ও শিশুদের আগে সরান। জরুরি: ৯৯৯`,
  }[f.level as 1 | 2 | 3];
  const action = f.level === 3
    ? `দেরি না করে এখনই ${f.shelterBn} বা নিরাপদ উঁচু স্থানে চলে যান। বয়স্ক, প্রতিবন্ধী, গর্ভবতী নারী ও শিশুদের আগে সরিয়ে নিন।`
    : f.level === 2
      ? "জরুরি কাগজপত্র, ওষুধ ও শুকনো খাবার গুছিয়ে রাখুন এবং গবাদিপশু উঁচু স্থানে সরিয়ে নিন।"
      : "নদীর পানির দিকে নজর রাখুন এবং পরবর্তী বার্তার জন্য ফোন চালু রাখুন।";
  const voice = `প্রিয় ${f.areaBn}বাসী, এটি একটি বন্যা ${f.levelBn} বার্তা। ${f.causeBn} ${eta ? `এই পানি ${eta}আপনার এলাকায় পৌঁছাতে পারে। ` : ""}${action} আবার বলছি: ${action}${f.level >= 2 ? " জরুরি প্রয়োজনে ৯৯৯ নম্বরে ফোন করুন।" : ""} বার্তাটি পাঠিয়েছে ${f.senderBn}।`;
  return {
    sms_bn: sms,
    voice_bn: voice,
    dialect_voice: null,
    checklist_bn: CHECKLIST[f.level] ?? CHECKLIST[1],
    official_summary_en: `${f.levelEn.toUpperCase()} for ${f.areaEn}. ${f.causeEn}${f.eta ? ` Expected arrival in ${f.eta[0]}–${f.eta[1]} h.` : ""}`,
  };
}

/** Short script for mosque / temple loudspeakers and volunteer megaphones, repeated twice. */
export function announcementScript(f: AlertFacts): string {
  const eta = f.eta ? `আগামী ${toBn(Math.max(1, f.eta[0]))} থেকে ${toBn(f.eta[1])} ঘণ্টার মধ্যে ` : "";
  const action = f.level === 3
    ? `সবাই এখনই ${f.shelterBn} বা উঁচু স্থানে চলে যান। বয়স্ক, প্রতিবন্ধী, গর্ভবতী নারী ও শিশুদের আগে সরিয়ে নিন।`
    : f.level === 2
      ? "জরুরি কাগজপত্র, ওষুধ ও শুকনো খাবার গুছিয়ে রাখুন। গবাদিপশু উঁচু স্থানে নিন।"
      : "নদীর পানির দিকে নজর রাখুন এবং পরবর্তী ঘোষণার অপেক্ষা করুন।";
  const once = `একটি জরুরি ঘোষণা। ${f.areaBn} এলাকাবাসীর জন্য বন্যা ${f.levelBn} সংকেত। ${eta}${f.riverBn} নদীর পানি বাড়তে পারে। ${action}${f.level >= 2 ? " জরুরি প্রয়োজনে ৯৯৯ নম্বরে ফোন করুন।" : ""} ঘোষণা দিচ্ছে ${f.senderBn}।`;
  return `${once}\n\nআবার বলছি — ${once}`;
}

/** SMS to a volunteer with the homes (without phones) they must visit, most vulnerable first. */
export function volunteerSms(f: AlertFacts, volunteer: string, homes: { headBn: string; village: string }[]): string {
  const list = homes.slice(0, 6).map((h) => `${h.headBn} (${h.village})`).join(", ");
  return `${f.levelBn}: ${f.areaBn}। ${volunteer}, এই বাড়িগুলোতে এখনই যান: ${list}${homes.length > 6 ? ` ও আরও ${toBn(homes.length - 6)}টি` : ""}।`;
}

/** Guardrails: an AI-written alert is only used if every check passes; otherwise the template is sent. */
export function validateAlert(c: AlertContent, f: AlertFacts): Check[] {
  const allText = [c.sms_bn, c.voice_bn, c.dialect_voice ?? "", ...c.checklist_bn].join(" ");
  const numbersUsed = [...toAscii(allText).matchAll(/\d+/g)].map((m) => Number(m[0]));
  const allowed = new Set(f.allowedNumbers);
  const invented = numbersUsed.filter((n) => !allowed.has(n));
  const checks: Check[] = [
    { name: "Alert level stated", ok: c.sms_bn.includes(f.levelBn) && c.voice_bn.includes(f.levelBn) },
    { name: "Area named correctly", ok: c.sms_bn.includes(f.areaBn) && c.voice_bn.includes(f.areaBn) },
    { name: "No invented numbers", ok: invented.length === 0, detail: invented.length ? `unexpected: ${invented.join(", ")}` : undefined },
    { name: "SMS fits 3 Bangla SMS parts (≤ 200 chars)", ok: c.sms_bn.length <= 200, detail: `${c.sms_bn.length} chars` },
    { name: "Emergency number 999 included", ok: f.level < 2 || (toAscii(c.sms_bn).includes("999") && toAscii(c.voice_bn).includes("999")) },
    { name: "Action checklist present", ok: c.checklist_bn.length >= 3 },
    { name: "Sender (local committee) named in voice call", ok: c.voice_bn.includes(f.senderBn) },
  ];
  return checks;
}
