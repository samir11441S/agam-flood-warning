// Minimal Telegram Bot API client (https://core.telegram.org/bots/api).
import type { AlertContent } from "./alerts";
import { LEVELS, type Level } from "./types";

export const telegramToken = () => process.env.TELEGRAM_BOT_TOKEN || null;

export async function tg<T = unknown>(method: string, body: Record<string, unknown> = {}): Promise<T> {
  const token = telegramToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description}`);
  return json.result;
}

let cachedUsername: string | null = null;
export async function botUsername(): Promise<string | null> {
  if (!telegramToken()) return null;
  if (!cachedUsername) cachedUsername = (await tg<{ username: string }>("getMe")).username;
  return cachedUsername;
}

const ICON: Record<number, string> = { 1: "🟡", 2: "🟠", 3: "🔴" };

export function alertMessage(level: Level, content: AlertContent) {
  return [
    `${ICON[level] ?? ""} বন্যা ${LEVELS[level].bn}`,
    "",
    content.voice_bn,
    "",
    "এখন করণীয়:",
    ...content.checklist_bn.map((c) => `• ${c}`),
    "",
    "আপনি কি নিরাপদ? নিচের বোতাম চাপুন।",
  ].join("\n");
}

export const replyButtons = (alertId: string) => ({
  inline_keyboard: [[
    { text: "✅ আমি নিরাপদ", callback_data: `safe:${alertId}` },
    { text: "🆘 সাহায্য দরকার", callback_data: `help:${alertId}` },
  ]],
});
