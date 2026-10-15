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
  /** This message withdraws an earlier warning (the danger is over). */
  allClear?: boolean;
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
  // The cause residents hear is always a measured fact (rain, river), never the ML model's score.
  const top = a.signals.find((s) => s.kind !== "ml");
  const numbers = new Set<number>([999]);
  if (a.etaHours) a.etaHours.forEach((h) => numbers.add(Math.max(1, h)));
  let causeBn = `${area.riverBn} নদী অববাহিকায় ভারী বৃষ্টি হয়েছে।`;
  let causeEn = `Heavy rain in the ${area.river} catchment.`;
  // Every number the cause texts (Bangla or English) can print is added to allowedNumbers, because the
  // English summary for officials is checked too.
  if (a.heldFromDaysAgo) {
    numbers.add(a.heldFromDaysAgo);
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
      causeEn = `${top.where} received ${top.value} mm in ${win}h${rare ? ` (rain this heavy happens about once in ${rarity} years there)` : ""}.`;
    } else if (top.kind === "forecast_rain") {
      numbers.add(72);
      causeBn = `${top.whereBn} এলাকায় আগামী ${toBn(72)} ঘণ্টায় ${toBn(top.value)} মিলিমিটার বৃষ্টির পূর্বাভাস রয়েছে।`;
      causeEn = `${top.value} mm of rain forecast at ${top.where} over the next 72h.`;
    } else if (top.kind === "river") {
      numbers.add(top.threshold);
      numbers.add(rarity);
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
  const smsFor = (place: string, elderlyFirst: boolean) => ({
    1: `${f.levelBn}: ${place}-এর উজানে ভারী বৃষ্টি হচ্ছে। ${f.riverBn} নদীর পানির দিকে নজর রাখুন, ফোন চালু রাখুন।`,
    2: `${f.levelBn}: ${place}-এ ${eta}${f.riverBn} নদীর পানি বাড়তে পারে। জরুরি জিনিস গুছিয়ে রাখুন, গবাদিপশু উঁচু স্থানে নিন। জরুরি: ৯৯৯`,
    3: `${f.levelBn}: ${place}-এ ${eta}${f.riverBn} নদীর পানি দ্রুত বাড়তে পারে। এখনই ${f.shelterBn} বা নিরাপদ উঁচু স্থানে যান।${elderlyFirst ? " বয়স্ক ও শিশুদের আগে সরান।" : ""} জরুরি: ৯৯৯`,
  })[f.level as 1 | 2 | 3];
  // Long names must never push the SMS past 3 Bangla parts: drop the district, then the "elderly first"
  // line (the voice call and the checklist still say it).
  const sms = [smsFor(`${f.areaBn} (${f.districtBn})`, true), smsFor(f.areaBn, true), smsFor(f.areaBn, false)].find((s) => s.length <= 200) ?? smsFor(f.areaBn, false);
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
    official_summary_en: `${f.levelEn.toUpperCase()} for ${f.areaEn}. ${f.causeEn}${f.eta ? ` Expected arrival in ${Math.max(1, f.eta[0])}–${f.eta[1]} h.` : ""}`,
  };
}

export const ALL_CLEAR_BN = "সতর্কতা প্রত্যাহার";

/** Facts for the all-clear that withdraws the last warning sent for an area. */
export function allClearFacts(area: Area, last: AlertFacts): AlertFacts {
  return {
    ...last,
    areaId: area.id,
    level: 0,
    levelBn: ALL_CLEAR_BN,
    levelEn: "All-clear",
    eta: null,
    causeBn: `${area.riverBn} নদীর উজানে বৃষ্টি কমেছে এবং বন্যার বড় ঝুঁকি কেটে গেছে।`,
    causeEn: `The ${last.levelEn} alert for ${area.name} is withdrawn: rain upstream has eased and the main flood risk has passed.`,
    allowedNumbers: [999],
    allClear: true,
  };
}

/** The all-clear: safe to return, plus the dangers that remain after a flood. Always the verified template. */
export function allClearAlert(f: AlertFacts): AlertContent {
  return {
    sms_bn: `${ALL_CLEAR_BN}: ${f.areaBn} (${f.districtBn})-এ বন্যার বড় ঝুঁকি কেটে গেছে। স্রোতের পানি থেকে দূরে থাকুন, ঘর পরীক্ষা করে ফিরুন। জরুরি: ৯৯৯`,
    voice_bn: `প্রিয় ${f.areaBn}বাসী, এটি বন্যা ${ALL_CLEAR_BN} বার্তা। ${f.causeBn} আশ্রয়কেন্দ্র থেকে বাড়ি ফেরার আগে ঘরের দেয়াল ও খুঁটি পরীক্ষা করুন। স্রোতের পানিতে নামবেন না, শিশুদের পানির কাছে যেতে দেবেন না। ভেজা অবস্থায় বিদ্যুতের সুইচ চালু করবেন না। জরুরি প্রয়োজনে ৯৯৯ নম্বরে ফোন করুন। বার্তাটি পাঠিয়েছে ${f.senderBn}।`,
    dialect_voice: null,
    checklist_bn: ["বাড়ি ফেরার আগে ঘরের দেয়াল ও খুঁটি পরীক্ষা করুন", "ভেজা অবস্থায় বিদ্যুতের সুইচ চালু করবেন না", "নলকূপের পানি ফুটিয়ে পান করুন", "সাপ ও পোকামাকড় থেকে সাবধান থাকুন"],
    official_summary_en: `ALL-CLEAR for ${f.areaEn}. ${f.causeEn}`,
  };
}

/** Short script for mosque / temple loudspeakers and volunteer megaphones, repeated twice. */
export function announcementScript(f: AlertFacts): string {
  if (f.allClear) {
    const once = `একটি জরুরি ঘোষণা। ${f.areaBn} এলাকাবাসীর জন্য বন্যা ${ALL_CLEAR_BN}। বন্যার বড় ঝুঁকি কেটে গেছে। তবে স্রোতের পানিতে নামবেন না, ঘর পরীক্ষা করে বাড়ি ফিরুন। জরুরি প্রয়োজনে ৯৯৯ নম্বরে ফোন করুন। ঘোষণা দিচ্ছে ${f.senderBn}।`;
    return `${once}\n\nআবার বলছি — ${once}`;
  }
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
/**
 * The action each level must ask for (at least one phrase in both the SMS and the voice call), and
 * reassurances that must never appear in a Warning or Danger. This catches a draft that names the right
 * level but gives the wrong instruction.
 */
const ACTION_WORDS: Record<number, string[]> = {
  1: ["নজর", "খেয়াল", "সতর্ক থাকুন", "ফোন চালু"],
  2: ["গুছিয়ে", "প্রস্তুত", "উঁচু স্থান", "উঁচু জায়গা", "সরিয়ে"],
  3: ["আশ্রয়কেন্দ্র", "উঁচু স্থান", "উঁচু জায়গা"],
};
// Phrases that downplay the danger or call off the action. A calm "don't panic" is fine; "no need to move" is not.
const FALSE_REASSURANCE = ["চিন্তার কিছু নেই", "ভয়ের কিছু নেই", "আশঙ্কা নেই", "ঝুঁকি নেই", "বিপদ নেই", "যাওয়ার দরকার নেই", "যাওয়ার প্রয়োজন নেই", "সরার দরকার নেই", "সরে যেতে হবে না"];

function rightAction(c: AlertContent, f: AlertFacts): boolean {
  if (f.allClear) return true;
  const words = ACTION_WORDS[f.level] ?? [];
  const asks = (t: string) => words.some((w) => t.includes(w));
  const reassures = f.level >= 2 && [c.sms_bn, c.voice_bn, c.dialect_voice ?? ""].some((t) => FALSE_REASSURANCE.some((p) => t.includes(p)));
  return asks(c.sms_bn) && asks(c.voice_bn) && !reassures;
}

/** What to tell a model whose draft failed a check, so one repair attempt can fix exactly that. */
export function repairHints(failed: Check[], f: AlertFacts, c: AlertContent): string[] {
  const action = f.level === 3 ? "go now to the shelter (আশ্রয়কেন্দ্র) or high ground (উঁচু স্থান)" : f.level === 2 ? "get ready: pack documents, medicine and dry food (গুছিয়ে রাখুন), move livestock to high ground" : "keep watching the river (নজর রাখুন) and keep phones on";
  const hints: Record<string, string> = {
    "Alert level stated, with the right action": `Both sms_bn and voice_bn must contain the exact words "${f.levelBn}" and tell people to ${action}. Do not say there is nothing to worry about.`,
    "Area named correctly": `Write the area name exactly as "${f.areaBn}" in both sms_bn and voice_bn.`,
    "No invented numbers": `Use only these numbers: ${f.allowedNumbers.join(", ")}. Remove any other number.`,
    "SMS fits 3 Bangla SMS parts (≤ 200 chars)": `sms_bn is ${c.sms_bn.length} characters; shorten it to at most 190 characters, keeping the level word, the area name, the main action and ৯৯৯.`,
    "Emergency number 999 included": "Include ৯৯৯ in both sms_bn and voice_bn.",
    "Action checklist present": "checklist_bn must be a list of 3 to 6 short actions.",
    "Sender (local committee) named in voice call": `End voice_bn with the sentence "বার্তাটি পাঠিয়েছে ${f.senderBn}।"`,
  };
  return failed.map((k) => hints[k.name] ?? k.name);
}

export function validateAlert(c: AlertContent, f: AlertFacts): Check[] {
  // The English summary for officials is checked too: an officer must never read an invented number.
  // "a 1-in-5-year rain" restates the verified rarity (5) — read it as "once in 5 years"; the 5 is still checked.
  const allText = [c.sms_bn, c.voice_bn, c.dialect_voice ?? "", ...c.checklist_bn, c.official_summary_en].join(" ").replace(/\b1\s*-?\s*in\s*-?\s*(\d+)/gi, "once in $1");
  const action = rightAction(c, f);
  const numbersUsed = [...toAscii(allText).matchAll(/\d+/g)].map((m) => Number(m[0]));
  const allowed = new Set(f.allowedNumbers);
  const invented = numbersUsed.filter((n) => !allowed.has(n));
  const checks: Check[] = [
    { name: "Alert level stated, with the right action", ok: c.sms_bn.includes(f.levelBn) && c.voice_bn.includes(f.levelBn) && action, detail: action ? undefined : "the instruction does not match the alert level" },
    { name: "Area named correctly", ok: c.sms_bn.includes(f.areaBn) && c.voice_bn.includes(f.areaBn) },
    { name: "No invented numbers", ok: invented.length === 0, detail: invented.length ? `unexpected: ${invented.join(", ")}` : undefined },
    { name: "SMS fits 3 Bangla SMS parts (≤ 200 chars)", ok: c.sms_bn.length <= 200, detail: `${c.sms_bn.length} chars` },
    { name: "Emergency number 999 included", ok: f.level < 2 || (toAscii(c.sms_bn).includes("999") && toAscii(c.voice_bn).includes("999")) },
    { name: "Action checklist present", ok: c.checklist_bn.length >= 3 },
    { name: "Sender (local committee) named in voice call", ok: c.voice_bn.includes(f.senderBn) },
  ];
  return checks;
}
