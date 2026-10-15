
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import crypto from "node:crypto";
import { templateAlert, validateAlert, type AlertContent, type AlertFacts, type Check } from "./alerts";
import { attempts, load, update } from "./store";

export const MODEL = "claude-opus-5-5";

const AlertSchema = z.object({
  sms_bn: z.string(),
  voice_bn: z.string(),
  dialect_voice: z.string().nullable(),
  checklist_bn: z.array(z.string()),
  official_summary_en: z.string(),
});

export const SYSTEM_PROMPT = `You write flood early-warning messages for rural Bangladesh on behalf of a local disaster-management committee. Your words will be read out by phone to people who may have little schooling, including elderly people, so lives depend on them being clear, calm and correct.

Write in simple, everyday Bangla (standard চলিত ভাষা) that a class-5 student understands. Short sentences. No English words.

Hard rules:
- Use ONLY the facts provided. Never invent numbers, places, rivers, shelters, phone numbers, dates or organisations. Every number you write must come from the "allowed numbers" list (Bangla digits are fine).
- Always state the alert level word exactly as given (levelBn) and the area name exactly as given (areaBn) in both sms_bn and voice_bn.
- For Warning (সতর্কতা) and Danger (বিপদ), include the national emergency number ৯৯৯ in both sms_bn and voice_bn.
- Give the action that matches the level, in both sms_bn and voice_bn: for Danger (বিপদ), go now to the shelter (আশ্রয়কেন্দ্র) or high ground (উঁচু স্থান); for Warning (সতর্কতা), get ready — pack documents, medicine and dry food (গুছিয়ে রাখুন) and move livestock to high ground; for Watch (সতর্ক নজর), keep watching the river (নজর রাখুন) and keep phones on. Never tell people there is nothing to worry about.
- Do not exaggerate or downplay. Do not promise that a flood will or will not happen; say what may happen and what to do.

Fields:
- sms_bn: at most 200 characters, most important action first.
- voice_bn: 60–100 words, spoken style, starts by addressing the residents of the area, explains the cause in one sentence, gives the arrival time if known, gives the main action, and repeats the main action once at the end.
- dialect_voice: if a dialect is requested, the same voice message in that regional dialect written in Bangla script; otherwise null.
- checklist_bn: 3–6 short practical actions appropriate to the alert level, no numbers.
- official_summary_en: at most 60 words in English for government officials: level, area, cause, expected arrival. The allowed-numbers rule applies here too.

The message comes from the local disaster-management committee, not from an app: end voice_bn with the sentence "বার্তাটি পাঠিয়েছে <senderBn>।" using senderBn exactly as given.`;

export type ComposeResult = {
  content: AlertContent;
  source: "claude" | "template";
  checks: Check[];
  note?: string;
};

type CachedDraft = { content: AlertContent; at: string };
const CACHE_FILE = "ai-drafts";
const CACHE_DAYS = 7;
const BUDGET_KEY = "ai:calls";
/** Most AI calls per hour (each draft is at most 2). Override with AI_CALLS_PER_HOUR. */
const AI_CALLS_PER_HOUR = Number(process.env.AI_CALLS_PER_HOUR) || 40;

export async function composeAlert(facts: AlertFacts): Promise<ComposeResult> {
  const template = templateAlert(facts);
  if (!process.env.ANTHROPIC_API_KEY) {
    return { content: template, source: "template", checks: validateAlert(template, facts), note: "No ANTHROPIC_API_KEY set — using the built-in template." };
  }
  const client = new Anthropic();
  const userContent = JSON.stringify({
    areaBn: facts.areaBn,
    areaEn: facts.areaEn,
    senderBn: facts.senderBn,
    districtBn: facts.districtBn,
    riverBn: facts.riverBn,
    levelBn: facts.levelBn,
    levelEn: facts.levelEn,
    expectedArrivalHours: facts.eta,
    causeBn: facts.causeBn,
    causeEn: facts.causeEn,
    shelterBn: facts.shelterBn,
    dialect: facts.dialect,
    allowedNumbers: facts.allowedNumbers,
    referenceTemplate: { sms_bn: template.sms_bn, voice_bn: template.voice_bn },
  });

  // Same model, prompt and facts as an earlier draft → reuse its verified text instead of paying for a new call.
  const key = crypto.createHash("sha256").update(`${MODEL}\n${SYSTEM_PROMPT}\n${userContent}`).digest("hex");
  const cached = load<Record<string, CachedDraft>>(CACHE_FILE, {})[key];
  if (cached && Date.now() - Date.parse(cached.at) < CACHE_DAYS * 86_400_000) {
    const checks = validateAlert(cached.content, facts);
    if (checks.every((c) => c.ok)) return { content: cached.content, source: "claude", checks, note: "Same facts as an earlier draft — its verified text was reused (no new AI call)." };
  }

  // Spending guard: the public demo's PIN is published, so cap how many AI calls an hour can trigger.
  if (attempts.blocked(BUDGET_KEY, AI_CALLS_PER_HOUR, 60)) {
    return { content: template, source: "template", checks: validateAlert(template, facts), note: `AI writing paused: ${AI_CALLS_PER_HOUR} AI drafts in the last hour — using the verified template.` };
  }

  let lastChecks: Check[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    attempts.hit(BUDGET_KEY, 60);
    try {
      const response = await client.beta.messages.parse({
        model: MODEL,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: betaZodOutputFormat(AlertSchema) },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Write the alert for these facts:\n${userContent}` }],
      });
      if (response.stop_reason === "refusal" || !response.parsed_output) continue;
      const content = response.parsed_output;
      if (!facts.dialect) content.dialect_voice = null;
      lastChecks = validateAlert(content, facts);
      if (lastChecks.every((c) => c.ok)) {
        update<Record<string, CachedDraft>>(CACHE_FILE, {}, (all) => {
          const fresh = Object.entries(all).filter(([, v]) => Date.now() - Date.parse(v.at) < CACHE_DAYS * 86_400_000).slice(-499);
          return { ...Object.fromEntries(fresh), [key]: { content, at: new Date().toISOString() } };
        });
        return { content, source: "claude", checks: lastChecks };
      }
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        return { content: template, source: "template", checks: validateAlert(template, facts), note: "The Anthropic API key was rejected — using the built-in template." };
      }
      if (!(err instanceof Anthropic.APIError)) throw err;
    }
  }
  const failed = lastChecks.filter((c) => !c.ok).map((c) => c.name).join(", ");
  return {
    content: template,
    source: "template",
    checks: validateAlert(template, facts),
    note: failed ? `AI draft failed safety checks (${failed}) — sent the verified template instead.` : "AI service unavailable — sent the verified template instead.",
  };
}
