// Bangla narration for the demo video. One entry per English sentence (same order), so captions,
// on-screen actions and English subtitles stay in sync.

const ONES = ["", "এক", "দুই", "তিন", "চার", "পাঁচ", "ছয়", "সাত", "আট", "নয়", "দশ",
  "এগারো", "বারো", "তেরো", "চোদ্দ", "পনেরো", "ষোলো", "সতেরো", "আঠারো", "উনিশ", "বিশ",
  "একুশ", "বাইশ", "তেইশ", "চব্বিশ", "পঁচিশ", "ছাব্বিশ", "সাতাশ", "আটাশ", "ঊনত্রিশ", "ত্রিশ",
  "একত্রিশ", "বত্রিশ", "তেত্রিশ", "চৌত্রিশ", "পঁয়ত্রিশ", "ছত্রিশ", "সাঁইত্রিশ", "আটত্রিশ", "ঊনচল্লিশ", "চল্লিশ",
  "একচল্লিশ", "বিয়াল্লিশ", "তেতাল্লিশ", "চুয়াল্লিশ", "পঁয়তাল্লিশ", "ছেচল্লিশ", "সাতচল্লিশ", "আটচল্লিশ", "ঊনপঞ্চাশ", "পঞ্চাশ",
  "একান্ন", "বাহান্ন", "তিপ্পান্ন", "চুয়ান্ন", "পঞ্চান্ন", "ছাপ্পান্ন", "সাতান্ন", "আটান্ন", "ঊনষাট", "ষাট",
  "একষট্টি", "বাষট্টি", "তেষট্টি", "চৌষট্টি", "পঁয়ষট্টি", "ছেষট্টি", "সাতষট্টি", "আটষট্টি", "ঊনসত্তর", "সত্তর",
  "একাত্তর", "বাহাত্তর", "তিয়াত্তর", "চুয়াত্তর", "পঁচাত্তর", "ছিয়াত্তর", "সাতাত্তর", "আটাত্তর", "ঊনআশি", "আশি",
  "একাশি", "বিরাশি", "তিরাশি", "চুরাশি", "পঁচাশি", "ছিয়াশি", "সাতাশি", "আটাশি", "ঊননব্বই", "নব্বই",
  "একানব্বই", "বিরানব্বই", "তিরানব্বই", "চুরানব্বই", "পঁচানব্বই", "ছিয়ানব্বই", "সাতানব্বই", "আটানব্বই", "নিরানব্বই"];

/** Spoken Bangla words for 0–99,999 (enough for every number in the script). */
export function bnWords(n: number): string {
  n = Math.round(n);
  if (n === 0) return "শূন্য";
  const parts: string[] = [];
  const thousands = Math.floor(n / 1000);
  const hundreds = Math.floor((n % 1000) / 100);
  const rest = n % 100;
  if (thousands) parts.push(`${ONES[thousands]} হাজার`);
  if (hundreds) parts.push(`${ONES[hundreds]}শো`);
  if (rest) parts.push(ONES[rest]);
  return parts.join(" ");
}

const MONTHS: Record<string, string> = { "06": "জুন", "07": "জুলাই", "08": "আগস্ট" };
const PART: Record<string, string> = { "06": "সকালে", "12": "দুপুরে", "18": "সন্ধ্যায়", "24": "রাত বারোটায়" };
/** "2024-08-19T12" → "উনিশ আগস্ট দুপুরে" (replays move in 6-hour steps). */
const bnWhen = (step: string) => `${bnWords(Number(step.slice(8, 10)))} ${MONTHS[step.slice(5, 7)]} ${PART[step.slice(11, 13)] ?? ""}`.trim();
const stripParen = (s: string) => s.replace(/\s*\(.*\)/, "");
const VOWEL_SIGNS = "ািীুূৃেৈোৌ";
/** Locative case: শান্তিরবাজার → শান্তিরবাজারে, বিলোনিয়া → বিলোনিয়ায়, ফেনী → ফেনীতে. */
const at = (w: string) => (w.endsWith("া") ? w + "য়" : VOWEL_SIGNS.includes(w.at(-1)!) ? w + "তে" : w + "ে");
/** Genitive case: ফেনী → ফেনীর, পরশুরাম → পরশুরামের. */
const of = (w: string) => (VOWEL_SIGNS.includes(w.at(-1)!) ? w + "র" : w + "ের");
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ও ${xs.at(-1)}`);

type Rain = { whereBn: string; value: number; threshold: number; window: string };

export type BnInput = {
  watchStep: string;
  warnStep: string;
  firstDanger: { step: string; areasBn: string[]; rain: Rain; tide: boolean };
  dangerStep: string;
  top: Rain;
  dangerAreasBn: string[];
  eta: [number, number];
  households: number;
  minutes: number;
  stories: { labelBn: string; warnStep: string | null; dangerStep: string | null; sentenceBn?: string }[];
  summary: { onTime: number; events: number; medianDangerEpisodesPerYear: number } | null;
  team: { teamName: string; teamNameBn?: string; members: { name: string; nameBn?: string; roleBn?: string }[] };
  isPlaceholder: (s: string) => boolean;
};

const windowBn = (w: string) => (w === "24h" ? "চব্বিশ" : w === "72h" ? "বাহাত্তর" : "একশো বিশ");
const daysBn = (w: string) => (w === "24h" ? "এক দিনে" : w === "72h" ? "তিন দিনে" : "পাঁচ দিনে");

function storySentence(s: BnInput["stories"][number]) {
  if (s.sentenceBn) return s.sentenceBn;
  if (s.warnStep && s.dangerStep && s.warnStep === s.dangerStep) return `${s.labelBn}: ${bnWhen(s.dangerStep)} থেকে বিপদ সংকেত।`;
  const parts = [s.warnStep && `${bnWhen(s.warnStep)} সতর্কতা`, s.dangerStep && `${bnWhen(s.dangerStep)} বিপদ`].filter(Boolean);
  return `${s.labelBn}: ${parts.join(", ")}।`;
}

export function banglaScript(x: BnInput): Record<string, string[]> {
  const hours = windowBn(x.top.window);
  return {
    "01-title": [
      "এটি আগাম। নামটাই বলে দেয় আমাদের কাজ — আগে থেকেই সতর্ক করা।",
      "সীমান্তের ওপারের বৃষ্টির ওপর নজর রেখে, বন্যার সতর্কবার্তা সময়মতো পৌঁছে দেয় প্রতিটি ঘরে।",
    ],
    "02-problem": [
      "দুই হাজার চব্বিশ সালের উনিশে আগস্ট, ফেনীর সীমান্তের ঠিক ওপারে, ত্রিপুরার পাহাড়ে শুরু হয় অতিভারী বৃষ্টি।",
      "ওই পাহাড়ের পানি মাত্র পাঁচ থেকে আট ঘণ্টায় ফেনীতে পৌঁছে যায়।",
      "আটান্ন লাখ মানুষ ক্ষতিগ্রস্ত হন, প্রায় পাঁচ লাখ মানুষ আশ্রয়কেন্দ্রে যান, আর প্রাণ হারান একাত্তর জন।",
      "পরে বন্যা পূর্বাভাস কেন্দ্র জানায়, এত ভয়াবহ বন্যার কোনো পূর্বাভাস ছিল না।",
    ],
    "03-forecast": [
      "আমরা খুঁজে দেখেছি, কেন।",
      "এক দিন আগে, বিশ্বের চারটি বড় আবহাওয়া মডেল ত্রিপুরার উদয়পুরে মাত্র চব্বিশ থেকে পঁয়ত্রিশ মিলিমিটার বৃষ্টির পূর্বাভাস দিয়েছিল।",
      "অথচ বৃষ্টি হয়েছিল প্রায় দুইশো মিলিমিটার।",
      "পূর্বাভাস ভুল ছিল। কিন্তু বৃষ্টিটা দেখা যাচ্ছিল — সীমান্তের ওপারে, পানি আসার কয়েক ঘণ্টা আগেই।",
    ],
    "04-how": [
      "আগাম ঠিক সেই বৃষ্টির ওপর নজর রাখে।",
      "প্রতি ঘণ্টায় দেখে সীমান্তের ওপারে পনেরোটি জায়গার বৃষ্টি, চব্বিশটি উপজেলা, নয়টি নদী আর জোয়ার।",
      "বিপদ মানে — এত ভারী বৃষ্টি এখানে পাঁচ বছরে একবার হয়।",
      "ঝুঁকি বাড়লে ক্লড সহজ বাংলায় বার্তা লেখে, সাতটি যাচাই চলে, আর কর্মকর্তা অনুমোদন দেন।",
      "তারপর বার্তা যায় প্রতিটি ঘরে — সবচেয়ে ঝুঁকিতে থাকা মানুষের কাছে আগে।",
    ],
    "05-replay": [
      "এই হলো আমাদের প্রোটোটাইপ — দুই হাজার চব্বিশের আগস্ট, শুধু তখন জানা তথ্য দিয়ে।",
      "পনেরো তারিখে, সব স্বাভাবিক।",
      `${bnWhen(x.watchStep)} ত্রিপুরায় ভারী বৃষ্টি — সতর্ক নজর।`,
      `${bnWhen(x.warnStep)} — সতর্কতা।`,
      `${bnWhen(x.firstDanger.step)} — ${of(list(x.firstDanger.areasBn))} জন্য বিপদ। উজানে ${daysBn(x.firstDanger.rain.window)} ${bnWords(x.firstDanger.rain.value)} মিলিমিটার বৃষ্টি${x.firstDanger.tide ? ", সঙ্গে ভরা জোয়ার" : ""}।`,
      `${bnWhen(x.dangerStep)}, ${at(stripParen(x.top.whereBn))} এক দিনে ${bnWords(x.top.value)} মিলিমিটার — ${of(list(x.dangerAreasBn.slice(0, 3)))} জন্য বিপদ।`,
      "ড্যাশ দেওয়া রেখা দেখায় পানির পথ।",
    ],
    "06-evidence": [
      "প্রতিটি সতর্কবার্তা নিজের কারণ দেখায়।",
      `${at(stripParen(x.top.whereBn))} ${hours} ঘণ্টায় ${bnWords(x.top.value)} মিলিমিটার — পাঁচ বছরের সীমা ${of(bnWords(x.top.threshold))} চেয়ে বেশি।`,
      `পরশুরামে পানি আসতে পারে ${bnWords(x.eta[0])} থেকে ${bnWords(x.eta[1])} ঘণ্টায় — এটি আনুমানিক, আর সেটাই লেখা থাকে।`,
    ],
    "07-alert": [
      "সাইন-ইন করা কর্মকর্তা এক ক্লিকেই তৈরি করেন সহজ বাংলায় সতর্কবার্তা।",
      "একটি এসএমএস, যাঁরা পড়তে পারেন না তাঁদের জন্য ভয়েস কল, আর মসজিদের মাইকের জন্য ঘোষণা — সবই তাঁদের নিজের ইউনিয়ন কমিটির নামে।",
      "বিপদের মাত্রা এআই ঠিক করে না, আর এআই কোনো সংখ্যা বানিয়ে লিখতে পারে না।",
      "প্রতিটি বার্তায় সাতটি নিরাপত্তা যাচাই চলে। কোনোটি ব্যর্থ হলে, যাচাই করা টেমপ্লেট পাঠানো হয়।",
    ],
    "08-dispatch": [
      "কর্মকর্তা অনুমোদন দেন; বিপদের জন্য চাইলে দুজন।",
      `আগাম ${bnWords(x.households)}টি পরিবারকে সাজায় — বয়স্ক, প্রতিবন্ধী, গর্ভবতী আর ফোনহীনরা আগে।`,
      "প্রতিটি ফোনে যায় ভয়েস কল আর এসএমএস; না ধরলে আবার কল, তারপর বিকল্প নম্বর, তারপর স্বেচ্ছাসেবক।",
      "ফোন না থাকলে দরজায় যান স্বেচ্ছাসেবক।",
      "মানুষ এক বোতামে জানান — নিরাপদ, নাকি সাহায্য দরকার; সাহায্যের অনুরোধ ওঠে উদ্ধার মানচিত্রে।",
      `প্রায় ${bnWords(x.minutes)} মিনিটে সবার কাছে পৌঁছানো যায়।`,
    ],
    "09-phone": [
      "সবার স্মার্টফোন নেই, তাই আগাম সব মাধ্যম ব্যবহার করে।",
      "কল আর এসএমএস যেকোনো ফোনে যায়; এলাকাবাসী 'পানি' লিখে পানি বাড়ার খবর দেন।",
      "টেলিগ্রামে সাহায্য দরকার চাপলে অবস্থান চলে যায় উদ্ধার মানচিত্রে।",
      "রাতে একজন কর্মকর্তা সাড়া না দিলে আগাম পরের জনকে জানায়।",
    ],
    "10-proof": [
      "এটা কি কাজ করে?",
      ...x.stories.map(storySentence),
      x.summary
        ? `ত্রিশ বছরের পরীক্ষায়, ${bnWords(x.summary.events)}টি বন্যার ${bnWords(x.summary.onTime)}টিতে আগাম সময়মতো বিপদ সংকেত দিয়েছে — প্রতি এলাকায় বছরে ${x.summary.medianDangerEpisodesPerYear < 1 ? "একবারেরও কম" : `প্রায় ${bnWords(x.summary.medianDangerEpisodesPerYear)} বার`}।`
        : "প্রতিটি সংখ্যা উন্মুক্ত তথ্য থেকে, এক কমান্ডেই আবার যাচাই করা যায়।",
    ],
    "11-business": [
      "সাধারণ মানুষকে কখনো টাকা দিতে হয় না।",
      "খরচ দেয় তারা, যাদের নির্ভরযোগ্য আগাম সংকেত দরকার — আগাম নগদ সহায়তা কর্মসূচি, দুর্যোগ ব্যবস্থাপনা কমিটি, ক্ষুদ্রঋণ প্রতিষ্ঠান আর বিমা কোম্পানি।",
      "আর এটি সহজেই বড় হয়: সব তথ্য বৈশ্বিক আর বিনামূল্যে, তাই নতুন অঞ্চল মানে শুধু একটি কনফিগ ফাইল আর পনেরো মিনিটের ক্যালিব্রেশন।",
      "যেকোনো এআই সহকারীও এমসিপি সার্ভারের মাধ্যমে আগামকে প্রশ্ন করতে পারে।",
    ],
    "12-team": [
      x.isPlaceholder(x.team.teamName) ? "পরিচয় করিয়ে দিই আগামের পেছনের দলকে।" : `আমরা দল ${x.team.teamNameBn ?? x.team.teamName}।`,
      x.team.members.some((m) => !x.isPlaceholder(m.name))
        ? `${list(x.team.members.filter((m) => !x.isPlaceholder(m.name)).map((m) => `${m.roleBn ?? ""} ${m.nameBn ?? m.name}`.trim()))}।`
        : "বাংলাদেশের একটি ছোট নির্মাতা দল।",
    ],
    "13-cta": [
      "গুগল হয়তো বন্যার পূর্বাভাস দিতে পারে। কিন্তু আগাম নিশ্চিত করে, চরের নানি-দাদিও সেটা শুনবেন — নিজের ভাষায়, সময়মতো।",
      "আগামী বর্ষায় পাইলটের জন্য আমরা ফেনীর একটি ইউনিয়ন খুঁজছি।",
      "ধন্যবাদ।",
    ],
  };
}
