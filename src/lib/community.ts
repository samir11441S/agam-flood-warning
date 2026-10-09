import { areas } from "./data";
import { reports } from "./store";

/** Distinct residents / volunteers who reported rising water per area in the last 6 hours. */
export function communityReports(now = Date.now()): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of areas) {
    const who = new Set(reports.recent(a.id, 6, now).map((r) => r.phone ?? r.chatId ?? r.name));
    if (who.size) out[a.id] = who.size;
  }
  return out;
}
