// Agam background worker — keep it running next to the web app:  npm run worker
//  • every 15 min: checks live risk and drafts an alert by itself at Warning / Danger (setting: autoDetect)
//  • every minute: asks officers to approve, escalates to the next officer, auto-sends unanswered DANGER (settings)
//  • every minute: retries unanswered voice calls, tries backup numbers, hands homes to volunteers
//  • continuously: runs the Telegram bot (if TELEGRAM_BOT_TOKEN is set)
// Test hook: `npm run worker -- --test-alert parshuram` drafts a LIVE alert from the Feni 2024 replay (20 Aug)
// to rehearse escalation without waiting for a real flood.
import fs from "node:fs";
import path from "node:path";
import { createDraft } from "../src/lib/alert-flow";
import { volunteerSms } from "../src/lib/alerts";
import { handleUpdate, type Update } from "../src/lib/bot";
import { sendSms, sendVoice, smsMode } from "../src/lib/channels";
import { communityReports } from "../src/lib/community";
import { areaById, areas, rainThresholds, replayInputs, riverThresholds, stations, tideThresholds, type Replay } from "../src/lib/data";
import { deliveries } from "../src/lib/deliveries";
import { escalate } from "../src/lib/escalation";
import { fetchLiveInputs } from "../src/lib/live-fetch";
import { audit, officers, settings } from "../src/lib/officers";
import { assessArea } from "../src/lib/risk";
import { alerts, areaLists } from "../src/lib/store";
import { botUsername, telegramToken, tg } from "../src/lib/telegram";
import { householdVoice } from "../src/lib/resident-replies";

const TICK_SEC = Number(process.env.WORKER_TICK_SEC ?? 60);
const DETECT_EVERY_MIN = Number(process.env.WORKER_DETECT_MIN ?? 15);
const REPEAT_ALERT_HOURS = 12;
const log = (...a: unknown[]) => console.log(new Date().toLocaleTimeString(), ...a);

async function detect() {
  if (!settings.get().autoDetect) return;
  const inputs = { ...(await fetchLiveInputs()), reports: communityReports() };
  for (const area of areas) {
    const a = assessArea(area, inputs, stations, rainThresholds, riverThresholds, tideThresholds);
    if (a.level < 2) continue;
    // Don't repeat: skip if a live alert at this level or higher was drafted recently.
    const recent = alerts.all().some((x) => x.areaId === area.id && x.scenario === "live" && x.level >= a.level && x.status !== "rejected" && Date.now() - Date.parse(x.createdAt) < REPEAT_ALERT_HOURS * 3600_000);
    if (recent) continue;
    const { alert } = await createDraft(area.id, a, "live", "Agam (automatic detection)");
    log(`auto-drafted ${alert.level === 3 ? "DANGER" : "WARNING"} for ${area.name} (code ${alert.code})`);
  }
}

async function retryCalls() {
  const handed = await deliveries.tick((to, d) => sendVoice(to, householdVoice(alerts.get(d.alertId)?.content ?? { voice_bn: "" })));
  if (!handed.length) return;
  // Homes nobody answered for: send them to the area's volunteers.
  const byAlert = Map.groupBy(handed, (d) => d.alertId);
  for (const [alertId, homes] of byAlert) {
    const alert = alerts.get(alertId);
    if (!alert?.facts) continue;
    const vols = areaLists.contacts(alert.areaId).filter((c) => c.role === "volunteer");
    const live = alert.scenario === "live" && smsMode() === "live" && !officers.demoMode();
    for (const v of vols) if (live) await sendSms(v.phone, volunteerSms(alert.facts, v.name, homes));
    audit.add({ who: "Agam worker", action: "handed unanswered homes to volunteers", areaId: alert.areaId, alertId, detail: `${homes.length} homes → ${vols.length} volunteer(s)${live ? "" : " (test mode)"}` });
  }
}

async function telegramLoop() {
  if (!telegramToken()) return log("Telegram: TELEGRAM_BOT_TOKEN not set — bot disabled.");
  log(`Telegram bot running as @${await botUsername()}`);
  let offset = 0;
  for (;;) {
    try {
      const updates = await tg<Update[]>("getUpdates", { offset, timeout: 30, allowed_updates: ["message", "callback_query"] });
      for (const u of updates) {
        offset = u.update_id + 1;
        await handleUpdate(u).catch((e) => log("update failed:", e.message));
      }
    } catch (e) {
      log("Telegram polling error:", (e as Error).message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

async function testAlert(areaId: string) {
  const feni = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/data/replays/feni-2024.json"), "utf8")) as Replay;
  const a = assessArea(areaById[areaId], replayInputs(feni, "2024-08-20T12"), stations, rainThresholds, riverThresholds, tideThresholds);
  const { alert } = await createDraft(areaId, a, "live", "Agam worker (rehearsal)");
  log(`rehearsal: drafted LIVE ${a.level === 3 ? "DANGER" : "alert"} for ${areaId}, approval code ${alert.code}`);
}

const args = process.argv.slice(2);
const i = args.indexOf("--test-alert");
if (i >= 0) await testAlert(args[i + 1] ?? "parshuram");

log(`Agam worker started. ${officers.demoMode() ? "DEMO MODE (no officers): nothing is sent for real." : `${officers.all().length} officer(s).`} Settings:`, settings.get());
void telegramLoop();
let lastDetect = 0;
for (;;) {
  try {
    if (Date.now() - lastDetect >= DETECT_EVERY_MIN * 60_000) {
      lastDetect = Date.now();
      await detect();
    }
    await escalate();
    await retryCalls();
  } catch (e) {
    log("worker step failed:", (e as Error).message);
  }
  if (args.includes("--once")) process.exit(0);
  await new Promise((r) => setTimeout(r, TICK_SEC * 1000));
}
