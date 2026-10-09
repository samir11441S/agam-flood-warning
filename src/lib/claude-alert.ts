
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { templateAlert, validateAlert, type AlertContent, type AlertFacts, type Check } from "./alerts";

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
- Do not exaggerate or downplay. Do not promise that a flood will or will not happen; say what may happen and what to do.

Fields:
- sms_bn: at most 200 characters, most important action first.
- voice_bn: 60–100 words, spoken style, starts by addressing the residents of the area, explains the cause in one sentence, gives the arrival time if known, gives the main action, and repeats the main action once at the end.
- dialect_voice: if a dialect is requested, the same voice message in that regional dialect written in Bangla script; otherwise null.
- checklist_bn: 3–6 short practical actions appropriate to the alert level, no numbers.
- official_summary_en: at most 60 words in English for government officials: level, area, cause, expected arrival.

The message comes from the local disaster-management committee, not from an app: end voice_bn with the sentence "বার্তাটি পাঠিয়েছে <senderBn>।" using senderBn exactly as given.`;

export type ComposeResult = {
  content: AlertContent;
  source: "claude" | "template";
  checks: Check[];
  note?: string;
};

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

  let lastChecks: Check[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
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
      if (lastChecks.every((c) => c.ok)) return { content, source: "claude", checks: lastChecks };
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
