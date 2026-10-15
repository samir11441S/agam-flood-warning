// The AI alert writer. It turns verified facts into plain-Bangla messages — it never decides the level and
// never sends anything. Free providers first: Google Gemini (free tier, strong Bangla), then Groq (free tier),
// then Claude if a paid key is set. Every draft must pass the same safety checks or the verified template is used.
//
//   GEMINI_API_KEY   free at https://aistudio.google.com/apikey   (models: GEMINI_MODELS)
//   GROQ_API_KEY     free at https://console.groq.com/keys        (models: GROQ_MODELS)
//   ANTHROPIC_API_KEY optional, paid                               (model: CLAUDE_MODEL)
//   AI_PROVIDERS     order to try, default "gemini,groq,claude" (providers without a key are skipped)
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import crypto from "node:crypto";
import { templateAlert, validateAlert, type AlertContent, type AlertFacts, type Check } from "./alerts";
import { attempts, load, update } from "./store";

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
- official_summary_en: at most 60 words in English for government officials: level, area, cause, expected arrival. The allowed-numbers rule applies here too; describe rarity as "about once in N years".

The message comes from the local disaster-management committee, not from an app: end voice_bn with the sentence "বার্তাটি পাঠিয়েছে <senderBn>।" using senderBn exactly as given.`;

export type ComposeResult = {
  content: AlertContent;
  source: "ai" | "template";
  /** Which model wrote it, e.g. "Gemini · gemini-3.5-flash-lite" (AI drafts only). */
  writer?: string;
  checks: Check[];
  note?: string;
};

// ---------------------------------------------------------------- providers

/** Why a call produced no usable draft. "limit" and "unavailable" move on to the next model at once. */
class WriterError extends Error {
  constructor(readonly kind: "limit" | "unavailable" | "busy" | "refused" | "auth" | "failed", message: string) {
    super(message);
  }
}

type Provider = {
  id: "gemini" | "groq" | "claude";
  name: string;
  models: () => string[];
  ready: () => boolean;
  write: (model: string, user: string) => Promise<unknown>;
};

const list = (v: string | undefined, fallback: string[]) => (v?.trim() ? v.split(",").map((s) => s.trim()).filter(Boolean) : fallback);
const CALL_TIMEOUT_MS = 25_000;

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
  } catch (e) {
    throw new WriterError("failed", (e as Error).name === "TimeoutError" ? "timed out" : (e as Error).message);
  }
  const text = await res.text();
  if (res.status === 429) throw new WriterError("limit", "rate limit reached");
  // Google answers a bad key with HTTP 400, others with 401/403.
  if (res.status === 401 || res.status === 403 || (res.status === 400 && /API key not valid|API_KEY_INVALID/i.test(text))) throw new WriterError("auth", "API key rejected");
  if (res.status === 404 || (res.status === 400 && /not found|not supported|unknown model|does not exist|decommissioned/i.test(text))) throw new WriterError("unavailable", "model not available");
  // Overloaded or briefly down (free tiers see this at busy times): worth one quick retry.
  if (res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504) throw new WriterError("busy", `temporarily unavailable (HTTP ${res.status})`);
  if (!res.ok) {
    // Keep the provider's own reason (it never contains the key) so officers and logs see what went wrong.
    let reason = "";
    try {
      reason = String((JSON.parse(text) as { error?: { message?: string } }).error?.message ?? "").slice(0, 160);
    } catch {
      reason = "";
    }
    throw new WriterError("failed", `HTTP ${res.status}${reason ? `: ${reason}` : ""}`);
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new WriterError("failed", "unreadable response");
  }
}

/** JSON schema for Gemini's structured output (OpenAPI subset). */
const GEMINI_SCHEMA = {
  type: "OBJECT",
  properties: {
    sms_bn: { type: "STRING" },
    voice_bn: { type: "STRING" },
    dialect_voice: { type: "STRING", nullable: true },
    checklist_bn: { type: "ARRAY", items: { type: "STRING" } },
    official_summary_en: { type: "STRING" },
  },
  required: ["sms_bn", "voice_bn", "dialect_voice", "checklist_bn", "official_summary_en"],
};

/** Strict JSON schema for OpenAI-compatible APIs (Groq). */
const STRICT_SCHEMA = {
  type: "object",
  properties: {
    sms_bn: { type: "string" },
    voice_bn: { type: "string" },
    dialect_voice: { type: ["string", "null"] },
    checklist_bn: { type: "array", items: { type: "string" } },
    official_summary_en: { type: "string" },
  },
  required: ["sms_bn", "voice_bn", "dialect_voice", "checklist_bn", "official_summary_en"],
  additionalProperties: false,
};

const parseJsonText = (text: string): unknown => {
  try {
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    throw new WriterError("failed", "the model did not return valid JSON");
  }
};

const gemini: Provider = {
  id: "gemini",
  name: "Gemini",
  // Flash-Lite first: fast, minimal thinking and the larger free daily quota. Flash is the quality step-up
  // if a Flash-Lite draft fails a check or its quota runs out.
  models: () => list(process.env.GEMINI_MODELS, ["gemini-3.5-flash-lite", "gemini-3.8-flash"]),
  ready: () => Boolean(process.env.GEMINI_API_KEY),
  async write(model, user) {
    const call = (schema: boolean) =>
      post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { "x-goog-api-key": process.env.GEMINI_API_KEY! }, {
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json", ...(schema ? { responseSchema: GEMINI_SCHEMA } : {}), temperature: 0.3, maxOutputTokens: 4096 },
      });
    let json: Record<string, unknown>;
    try {
      json = await call(true);
    } catch (err) {
      // If a model rejects the schema format, plain JSON mode still works: the prompt names every field.
      if (!(err instanceof WriterError && /HTTP 400.*(schema|unknown name|invalid json payload)/i.test(err.message))) throw err;
      json = await call(false);
    }
    const feedback = json.promptFeedback as { blockReason?: string } | undefined;
    if (feedback?.blockReason) throw new WriterError("refused", `blocked (${feedback.blockReason})`);
    const cand = (json.candidates as { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[] | undefined)?.[0];
    const text = cand?.content?.parts?.filter((p) => !p.thought && p.text).map((p) => p.text).join("") ?? "";
    if (!text) throw new WriterError(cand?.finishReason && cand.finishReason !== "STOP" ? "refused" : "failed", `no text (${cand?.finishReason ?? "empty"})`);
    return parseJsonText(text);
  },
};

const groq: Provider = {
  id: "groq",
  name: "Groq",
  models: () => list(process.env.GROQ_MODELS, ["openai/gpt-oss-120b"]),
  ready: () => Boolean(process.env.GROQ_API_KEY),
  async write(model, user) {
    const json = await post("https://api.groq.com/openai/v1/chat/completions", { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, {
      model,
      temperature: 0.3,
      max_completion_tokens: 4096,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: user }],
      response_format: { type: "json_schema", json_schema: { name: "flood_alert", strict: true, schema: STRICT_SCHEMA } },
    });
    const choice = (json.choices as { message?: { content?: string; refusal?: string }; finish_reason?: string }[] | undefined)?.[0];
    if (choice?.message?.refusal) throw new WriterError("refused", "refused");
    if (!choice?.message?.content) throw new WriterError("failed", `no text (${choice?.finish_reason ?? "empty"})`);
    return parseJsonText(choice.message.content);
  },
};

const claude: Provider = {
  id: "claude",
  name: "Claude",
  models: () => [process.env.CLAUDE_MODEL?.trim() || "claude-opus-5-5"],
  ready: () => Boolean(process.env.ANTHROPIC_API_KEY),
  async write(model, user) {
    try {
      const response = await new Anthropic({ timeout: CALL_TIMEOUT_MS, maxRetries: 0 }).beta.messages.parse({
        model,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: betaZodOutputFormat(AlertSchema) },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: user }],
      });
      if (response.stop_reason === "refusal" || !response.parsed_output) throw new WriterError("refused", "refused");
      return response.parsed_output;
    } catch (err) {
      if (err instanceof WriterError) throw err;
      if (err instanceof Anthropic.AuthenticationError) throw new WriterError("auth", "API key rejected");
      if (err instanceof Anthropic.RateLimitError) throw new WriterError("limit", "rate limit reached");
      if (err instanceof Anthropic.NotFoundError) throw new WriterError("unavailable", "model not available");
      if (err instanceof Anthropic.APIError) throw new WriterError("failed", err.message);
      throw err;
    }
  },
};

const PROVIDERS: Record<string, Provider> = { gemini, groq, claude };

/** Providers that have a key, in the configured order. */
const enabledProviders = () =>
  list(process.env.AI_PROVIDERS, ["gemini", "groq", "claude"]).map((id) => PROVIDERS[id.toLowerCase()]).filter((p): p is Provider => Boolean(p?.ready()));

/** What the dashboard and docs show about the AI writer (no keys, just names). */
export const activeWriters = () => enabledProviders().map((p) => ({ id: p.id, name: p.name, models: p.models() }));

// ---------------------------------------------------------------- orchestration

type CachedDraft = { content: AlertContent; at: string; writer?: string };
const CACHE_FILE = "ai-drafts";
const CACHE_DAYS = 7;
const BUDGET_KEY = "ai:calls";
/** Most AI calls per hour across all providers (free tiers have small quotas; also a spending guard). */
const AI_CALLS_PER_HOUR = Number(process.env.AI_CALLS_PER_HOUR) || 40;
/** At most this many model calls for one draft, so an officer never waits long. */
const MAX_CALLS_PER_DRAFT = 4;
const RETRY_PAUSE_MS = Number(process.env.AI_RETRY_PAUSE_MS) || 1500;

export async function composeAlert(facts: AlertFacts): Promise<ComposeResult> {
  const template = templateAlert(facts);
  const fallback = (note: string): ComposeResult => ({ content: template, source: "template", checks: validateAlert(template, facts), note });
  const writers = enabledProviders();
  if (!writers.length) return fallback("No AI key set (GEMINI_API_KEY is free) — using the built-in verified template.");

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
  const user = `Write the alert for these facts:\n${userContent}\n\nReturn one JSON object with exactly these fields: sms_bn, voice_bn, dialect_voice, checklist_bn, official_summary_en.`;

  // Same prompt and facts as an earlier draft → reuse its verified text instead of spending a call.
  const key = crypto.createHash("sha256").update(`${SYSTEM_PROMPT}\n${userContent}`).digest("hex");
  const cached = load<Record<string, CachedDraft>>(CACHE_FILE, {})[key];
  if (cached && Date.now() - Date.parse(cached.at) < CACHE_DAYS * 86_400_000) {
    const checks = validateAlert(cached.content, facts);
    if (checks.every((c) => c.ok)) return { content: cached.content, source: "ai", writer: cached.writer, checks, note: "Same facts as an earlier draft — its verified text was reused (no new AI call)." };
  }

  // Spending / quota guard: the public demo's PIN is published, and free tiers have small quotas.
  if (attempts.blocked(BUDGET_KEY, AI_CALLS_PER_HOUR, 60)) return fallback(`AI writing paused: ${AI_CALLS_PER_HOUR} AI calls in the last hour — using the verified template.`);

  const problems: string[] = [];
  let calls = 0;
  for (const p of writers) {
    for (const model of p.models()) {
      if (calls >= MAX_CALLS_PER_DRAFT) break;
      calls++;
      attempts.hit(BUDGET_KEY, 60);
      const label = `${p.name} · ${model}`;
      try {
        let raw: unknown;
        try {
          raw = await p.write(model, user);
        } catch (err) {
          // A busy server gets one more try on the same model after a short pause.
          if (!(err instanceof WriterError && err.kind === "busy") || calls >= MAX_CALLS_PER_DRAFT) throw err;
          await new Promise((r) => setTimeout(r, RETRY_PAUSE_MS));
          calls++;
          attempts.hit(BUDGET_KEY, 60);
          raw = await p.write(model, user);
        }
        const parsed = AlertSchema.safeParse(raw);
        if (!parsed.success) { problems.push(`${label}: wrong format`); continue; }
        const content = parsed.data;
        if (!facts.dialect) content.dialect_voice = null;
        const checks = validateAlert(content, facts);
        if (!checks.every((c) => c.ok)) {
          problems.push(`${label}: failed ${checks.filter((c) => !c.ok).map((c) => `${c.name}${c.detail ? ` (${c.detail})` : ""}`).join(", ")}`);
          continue; // try the next (usually stronger) model
        }
        update<Record<string, CachedDraft>>(CACHE_FILE, {}, (all) => {
          const fresh = Object.entries(all).filter(([, v]) => Date.now() - Date.parse(v.at) < CACHE_DAYS * 86_400_000).slice(-499);
          return { ...Object.fromEntries(fresh), [key]: { content, at: new Date().toISOString(), writer: label } };
        });
        return { content, source: "ai", writer: label, checks, note: problems.length ? `Earlier tries: ${problems.join("; ")}.` : undefined };
      } catch (err) {
        if (!(err instanceof WriterError)) throw err;
        problems.push(`${label}: ${err.message}`);
        if (err.kind === "auth") break; // a bad key fails for every model of this provider
      }
    }
  }
  return fallback(`AI drafts unavailable (${problems.join("; ")}) — sent the verified template instead.`);
}
