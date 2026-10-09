// End-to-end check: residents without Telegram answer an alert by SMS "1"/"2" or keypad 1/2.
// Run: npm run test:replies   (uses a temporary data folder; nothing is sent anywhere)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.AGAM_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agam-test-"));
process.env.INBOUND_SECRET = "test";
for (const k of ["SMS_API_URL", "SMS_PROVIDER", "VOICE_API_URL", "TELEGRAM_BOT_TOKEN", "ANTHROPIC_API_KEY"]) delete process.env[k];

const { NextRequest } = await import("next/server");
const { default: feni } = await import("../src/data/replays/feni-2024.json", { with: { type: "json" } });
const { GET: smsInbound } = await import("../src/app/api/sms/inbound/route");
const { GET: voiceStatus } = await import("../src/app/api/voice/status/route");
const { approve, createDraft } = await import("../src/lib/alert-flow");
const { areaById, rainThresholds, replayInputs, riverThresholds, stations, tideThresholds } = await import("../src/lib/data");
const { deliveries } = await import("../src/lib/deliveries");
const { parseHouseholdCsv } = await import("../src/lib/households");
const { DEMO_OFFICER, audit } = await import("../src/lib/officers");
const { parseReply, REPLY_SMS_BN, REPLY_VOICE_BN } = await import("../src/lib/resident-replies");
const { assessArea } = await import("../src/lib/risk");
const { alerts, areaLists, replies } = await import("../src/lib/store");
type Replay = import("../src/lib/data").Replay;

const results: Record<string, boolean> = {};
const check = (name: string, ok: boolean) => { results[name] = ok; };

// Parsing
check("parse 1/১/safe/নিরাপদ → safe", ["1", "১", "Safe", "নিরাপদ আছি"].every((t) => parseReply(t) === "safe"));
check("parse 2/২/help/সাহায্য → help", ["2", "২ ছাদে আছি", "HELP", "sos", "সাহায্য"].every((t) => parseReply(t) === "help"));
check("parse other → null", ["hello", "12", "PANI parshuram", ""].every((t) => parseReply(t) === null));

// A union's list (with consent), two volunteers, and a LIVE alert sent in test mode (no provider keys)
const csv = "name,village,phone,backup_phone,members,elderly,children_under5,disabled,pregnant,kutcha_house,low_lying,shelter_km,consent\n" +
  "রহিমা বেগম,উত্তর পাড়া,01711000001,,4,1,1,no,no,yes,yes,2,yes\n" +
  "করিম মিয়া,নদীর পাড়,01711000002,01711000099,5,0,2,no,yes,yes,yes,3,yes\n";
const { households } = parseHouseholdCsv("parshuram", csv);
areaLists.setHouseholds("parshuram", households);
areaLists.setContacts("parshuram", [{ name: "স্বেচ্ছাসেবক ১", phone: "+8801811000001", role: "volunteer" }, { name: "স্বেচ্ছাসেবক ২", phone: "+8801811000002", role: "volunteer" }]);
const a = assessArea(areaById.parshuram, replayInputs(feni as Replay, "2024-08-20T12"), stations, rainThresholds, riverThresholds, tideThresholds);
const { alert } = await createDraft("parshuram", a, "live", "test");
const outcome = await approve(alert.id, { id: DEMO_OFFICER.id, name: DEMO_OFFICER.name, role: DEMO_OFFICER.role }, "dashboard");
const sent = alerts.get(alert.id)!;
check("alert sent", outcome.status === "sent" && sent.status === "sent");
const smsOut = sent.outbox?.find((o) => o.channel === "SMS (Bangla)");
const voiceOut = sent.outbox?.find((o) => o.channel === "Voice call (Bangla)");
check("SMS tells people how to answer", Boolean(smsOut?.sample.endsWith(REPLY_SMS_BN)) && smsOut?.recipients === 2);
check("voice call tells people how to answer", Boolean(voiceOut?.sample.endsWith(REPLY_VOICE_BN)));
check("calls started for 2 homes", deliveries.forAlert(alert.id).length === 2);

const sms = async (from: string, text: string, secret = "test") =>
  smsInbound(new NextRequest(`http://localhost/api/sms/inbound?secret=${secret}&from=${encodeURIComponent(from)}&text=${encodeURIComponent(text)}`));
const key = async (to: string, digits: string) =>
  voiceStatus(new NextRequest(`http://localhost/api/voice/status?secret=test&to=${encodeURIComponent(to)}&status=answered&digits=${digits}`));

// SMS "1" from household 1 → safe; its call stops being retried
const r1 = await sms("01711000001", "1");
check("SMS 1 → thank-you reply", r1.status === 200 && (await r1.text()).includes("ধন্যবাদ"));
check("SMS 1 recorded as safe", replies.forAlert(alert.id).some((r) => r.phone === "+8801711000001" && r.status === "safe" && r.channel === "sms" && r.name === "রহিমা বেগম"));
check("SMS 1 stops call retries", deliveries.forAlert(alert.id).find((d) => d.phone === "+8801711000001")?.status === "answered");

// SMS "২ ..." from household 2's BACKUP number → help, with the note, volunteers notified (test mode)
const r2 = await sms("+8801711000099", "২ ছাদে আটকে আছি, ৩টি শিশু");
check("SMS 2 → help confirmation", (await r2.text()).includes("স্বেচ্ছাসেবক"));
const help = replies.forAlert(alert.id).find((r) => r.status === "help");
check("help recorded with name, village and note", help?.name === "করিম মিয়া" && help?.village === "নদীর পাড়" && help?.note === "ছাদে আটকে আছি, ৩টি শিশু");
check("volunteers notified (test mode)", audit.recent(20).some((e) => e.action === "asked for HELP by sms" && /would notify 2 volunteers/.test(e.detail ?? "")));

// Keypad: household 2 presses 1 during the call → updates to safe (one answer per phone per alert)
const k = await key("01711000002", "1");
const kj = await k.json() as { reply: string; recorded: boolean };
check("keypad 1 recorded", kj.reply === "safe" && kj.recorded);
check("keypad reply is from voice channel", replies.forAlert(alert.id).some((r) => r.phone === "+8801711000002" && r.channel === "voice" && r.status === "safe"));

// Strangers and bad secrets
const r3 = await sms("01999999999", "2");
check("unknown number → no active alert + 999", (await r3.text()).includes("৯৯৯") && replies.forAlert(alert.id).every((r) => r.phone !== "+8801999999999"));
check("wrong secret → 403", (await sms("01711000001", "1", "wrong")).status === 403);

// PANI still works and officers' "1 <code>" is not mistaken for a resident reply (officers are matched by phone first)
const r4 = await sms("01711000001", "PANI parshuram");
check("PANI report still works", (await r4.text()).includes("রিপোর্ট"));

console.log(results);
const failed = Object.entries(results).filter(([, ok]) => !ok);
console.log(failed.length ? `FAILED: ${failed.map(([n]) => n).join("; ")}` : `ALL ${Object.keys(results).length} CHECKS PASSED`);
fs.rmSync(process.env.AGAM_DATA_DIR!, { recursive: true, force: true });
process.exit(failed.length ? 1 : 0);
