// End-to-end safety checks for the alert pipeline: concurrency between processes, PIN / code guessing,
// Telegram linking, double sends, wrong-instruction drafts, sending speed and order, all-clear.
// Run: npm run test:safety   (temporary data folder; network calls are faked — nothing is sent anywhere)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agam-safety-"));
process.env.AGAM_DATA_DIR = DIR;
process.env.INBOUND_SECRET = "test";
for (const k of ["SMS_API_URL", "SMS_PROVIDER", "VOICE_API_URL", "TELEGRAM_BOT_TOKEN", "ANTHROPIC_API_KEY", "VERCEL", "TRUST_PROXY"]) delete process.env[k];

// ---- fake network: SMS / IVR gateways and the Telegram Bot API ----
type Sent = { url: string; body?: string; at: number };
const net: Sent[] = [];
let gatewayDelayMs = 0;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  net.push({ url, body: typeof init?.body === "string" ? init.body : undefined, at: Date.now() });
  if (url.startsWith("https://api.telegram.org/")) {
    const method = url.split("/").pop();
    return Response.json({ ok: true, result: method === "getMe" ? { username: "agam_test_bot" } : { message_id: 1 } });
  }
  if (gatewayDelayMs) await new Promise((r) => setTimeout(r, gatewayDelayMs));
  return new Response("OK");
}) as typeof fetch;

const { NextRequest } = await import("next/server");
const { default: feni } = await import("../src/data/replays/feni-2024.json", { with: { type: "json" } });
const flow = await import("../src/lib/alert-flow");
const { templateAlert, validateAlert, buildFacts, allClearAlert, allClearFacts } = await import("../src/lib/alerts");
const { areaById, areas, rainThresholds, replayInputs, riverThresholds, stations, tideThresholds } = await import("../src/lib/data");
const { deliveries } = await import("../src/lib/deliveries");
const { escalate } = await import("../src/lib/escalation");
const { parseHouseholdCsv } = await import("../src/lib/households");
const { audit, loginAllowed, officers, recordLogin, settings } = await import("../src/lib/officers");
const { assessArea } = await import("../src/lib/risk");
const { alerts, areaLists, replies } = await import("../src/lib/store");
const { handleUpdate } = await import("../src/lib/bot");
const { GET: smsInbound } = await import("../src/app/api/sms/inbound/route");
type Replay = import("../src/lib/data").Replay;
type Assessment = import("../src/lib/types").Assessment;

const results: Record<string, boolean> = {};
const check = (name: string, ok: boolean) => { results[name] = ok; if (!ok) console.log("  ✗", name); };
const tgCalls = () => net.filter((n) => n.url.startsWith("https://api.telegram.org/"));
const lastTgText = () => JSON.parse(tgCalls().at(-1)?.body ?? "{}").text as string | undefined;
const feniAt = (areaId: string, step: string) => assessArea(areaById[areaId], replayInputs(feni as Replay, step), stations, rainThresholds, riverThresholds, tideThresholds);

// ---------- 1. Many processes writing at once lose nothing ----------
const child = path.join(DIR, "child.mts");
fs.writeFileSync(child, `const { audit } = await import(${JSON.stringify(pathToFileURL(path.resolve("src/lib/officers.ts")).href)});\nfor (let i = 0; i < 40; i++) audit.add({ who: "p" + process.argv[2], action: "write " + i });\n`);
const runChild = (n: number) => new Promise<number>((resolve) => {
  const p = spawn(process.execPath, ["--import", "tsx", child, String(n)], { env: { ...process.env }, stdio: "inherit" });
  p.on("exit", (code) => resolve(code ?? 1));
});
const codes = await Promise.all([1, 2, 3, 4].map(runChild));
check("4 processes × 40 audit writes, none lost", codes.every((c) => c === 0) && audit.recent(1000).filter((e) => e.action.startsWith("write ")).length === 160);

// ---------- 2. Officers: PIN rules ----------
const errorOf = (fn: () => unknown) => { try { fn(); return null; } catch (e) { return (e as Error).message; } };
check("4-digit PIN refused for new officers", /6–8 digits/.test(errorOf(() => officers.add({ name: "Short", pin: "4821" })) ?? ""));
const rahim = officers.add({ name: "Rahim Uddin", pin: "482193", phone: "01711000000" });
const karim = officers.add({ name: "Karim Mia", pin: "771905", phone: "01711000001" });
check("duplicate PIN refused (sign-in is by PIN alone)", /already uses this PIN/.test(errorOf(() => officers.add({ name: "Dup", pin: "482193" })) ?? ""));
check("demo mode off once officers exist", !officers.demoMode());

// ---------- 3. PIN guessing is limited, per client and for everyone ----------
for (let i = 0; i < 5; i++) recordLogin("1.2.3.4", false);
check("5 wrong PINs block that client", !loginAllowed("1.2.3.4"));
check("…but not other clients yet", loginAllowed("5.6.7.8"));
for (let i = 0; i < 15; i++) recordLogin(`10.0.0.${i}`, false);
check("20 wrong PINs from many addresses pause all PIN sign-in", !loginAllowed("9.9.9.9"));
check("the pause is written to the audit log", audit.recent(50).some((e) => e.action === "paused PIN sign-in"));

// ---------- 4. Telegram: no PIN guessing, one-time codes, private chats, the tapper must be the officer ----------
process.env.TELEGRAM_BOT_TOKEN = "test-token";
const msg = (chatId: number, text: string, type = "private") => handleUpdate({ update_id: 1, message: { chat: { id: chatId, type }, text } });
await msg(555, "/officer 482193");
check("/officer <PIN> no longer links an account", !officers.byTelegram(555));
for (let i = 0; i < 5; i++) await msg(555, `/officer ${String(10_000_000 + i)}`);
const { code } = officers.createTelegramLink(rahim.id);
await msg(555, `/officer ${code}`);
check("after 5 wrong codes a chat is locked out (even with the right code)", !officers.byTelegram(555) && /অনেকবার/.test(lastTgText() ?? ""));
await msg(-100777, `/officer ${code}`, "group");
check("codes are refused in group chats", !officers.byTelegram(-100777));
await msg(777, `/start officer-${code}`);
check("one-time code links the officer's private chat (deep link)", officers.byTelegram(777)?.id === rahim.id);
await msg(778, `/officer ${code}`);
check("the same code cannot be used twice", !officers.byTelegram(778));

// ---------- 5. Two officers approving at the same moment send once ----------
settings.set({ twoPersonDanger: false });
const parsh = feniAt("parshuram", "2024-08-20T12");
const d1 = await flow.createDraft("parshuram", parsh, "replay", "test");
const [a1, a2] = await Promise.all([
  flow.approve(d1.alert.id, { id: rahim.id, name: rahim.name, role: rahim.role }, "dashboard"),
  flow.approve(d1.alert.id, { id: karim.id, name: karim.name, role: karim.role }, "sms"),
]);
check("concurrent approvals: exactly one sends", [a1, a2].filter((o) => o.status === "sent").length === 1 && [a1, a2].filter((o) => o.status === "error").length === 1);
for (const o of [a1, a2]) if (o.status === "sent") await o.sending;
check("approval codes are 6 digits", /^\d{6}$/.test(d1.alert.code));

// ---------- 6. A group member cannot press an officer's approve button ----------
const d2 = await flow.createDraft("fulgazi", feniAt("fulgazi", "2024-08-20T12"), "replay", "test");
await handleUpdate({ update_id: 2, callback_query: { id: "cb", from: { id: 999 }, message: { chat: { id: 777 }, message_id: 1 }, data: `no:${d2.alert.id}` } });
check("button pressed by someone else is ignored", alerts.get(d2.alert.id)?.status === "pending");
await handleUpdate({ update_id: 3, callback_query: { id: "cb", from: { id: 777 }, message: { chat: { id: 777 }, message_id: 1 }, data: `no:${d2.alert.id}` } });
check("the linked officer's own button works", alerts.get(d2.alert.id)?.status === "rejected");

// ---------- 7. SMS approval codes cannot be guessed ----------
const sms = async (from: string, text: string) => (await smsInbound(new NextRequest(`http://localhost/api/sms/inbound?secret=test&from=${encodeURIComponent(from)}&text=${encodeURIComponent(text)}`))).text();
const d3 = await flow.createDraft("chhagalnaiya", feniAt("chhagalnaiya", "2024-08-20T12"), "replay", "test");
for (let i = 0; i < 5; i++) await sms("01711000001", `1 ${100000 + i}`);
const blockedReply = await sms("01711000001", `1 ${d3.alert.code}`);
check("5 wrong SMS codes pause SMS approval for that phone", /অনেকবার ভুল কোড/.test(blockedReply) && alerts.get(d3.alert.id)?.status === "pending");
check("webhook rejects a wrong secret", (await smsInbound(new NextRequest("http://localhost/api/sms/inbound?secret=nope&from=01711000000&text=1"))).status === 403);

// ---------- 8. The validator catches the wrong instruction, and every template passes ----------
const dangerFacts = buildFacts(areaById.parshuram, parsh);
const good = templateAlert(dangerFacts);
const calm = { ...good, voice_bn: good.voice_bn + " চিন্তার কিছু নেই।" };
check("Danger draft saying 'nothing to worry about' is rejected", !validateAlert(calm, dangerFacts).every((c) => c.ok));
const noAction = { ...good, sms_bn: `বিপদ: পরশুরাম (ফেনী)-এ পানি বাড়তে পারে। জরুরি: ৯৯৯` };
check("Danger SMS without 'go to shelter / high ground' is rejected", !validateAlert(noAction, dangerFacts).every((c) => c.ok));
const fakeNumber = { ...good, official_summary_en: good.official_summary_en + " About 40000 people at risk." };
check("invented number in the English summary is rejected", !validateAlert(fakeNumber, dangerFacts).every((c) => c.ok));
let templatesOk = true;
for (const area of areas) for (const level of [1, 2, 3] as const) {
  const a: Assessment = { areaId: area.id, level, etaHours: [3, 10], signals: [{ kind: "upstream_rain", level, where: "X", whereBn: "এক্স", value: 150, threshold: 120, unit: "mm", window: "24h", etaHours: [3, 10] }] };
  const f = buildFacts(area, a);
  if (!validateAlert(templateAlert(f), f).every((c) => c.ok)) { templatesOk = false; console.log("  template fails:", area.id, level, validateAlert(templateAlert(f), f).filter((c) => !c.ok)); }
  const ac = allClearFacts(area, f);
  if (!validateAlert(allClearAlert(ac), ac).every((c) => c.ok)) { templatesOk = false; console.log("  all-clear fails:", area.id); }
}
check("templates pass all checks: 24 areas × 3 levels + all-clears", templatesOk);

// ---------- 9. Sending: approval returns at once; many in flight; most vulnerable first ----------
const header = "name,village,phone,backup_phone,members,elderly,children_under5,disabled,pregnant,kutcha_house,low_lying,shelter_km,consent\n";
const rows = Array.from({ length: 400 }, (_, i) => `বাড়ি ${i},গ্রাম ${i % 7},0171${String(2000000 + i).padStart(7, "0")},,4,${i % 50 === 0 ? 2 : 0},0,${i % 50 === 0 ? "yes" : "no"},no,no,${i % 50 === 0 ? "yes" : "no"},1,yes`).join("\n");
const { households } = parseHouseholdCsv("sonagazi", header + rows);
areaLists.setHouseholds("sonagazi", households);
process.env.SMS_API_URL = "https://sms.example/send?to={to}&msg={message}";
process.env.VOICE_API_URL = "https://ivr.example/call?to={to}&text={message}";
gatewayDelayMs = 40;
const live = await flow.createDraft("sonagazi", feniAt("sonagazi", "2024-08-20T12"), "live", "test");
const t0 = Date.now();
const out = await flow.approve(live.alert.id, { id: rahim.id, name: rahim.name, role: rahim.role }, "dashboard");
const approveMs = Date.now() - t0;
check("approval of a 400-household alert returns in under 2 s", out.status === "sent" && approveMs < 2000);
check("outbox shows 'sending' right after approval", Boolean(alerts.get(live.alert.id)?.outbox?.some((o) => o.inProgress)));
const t1 = Date.now();
if (out.status === "sent") await out.sending;
const sendMs = Date.now() - t1;
const done = alerts.get(live.alert.id)!;
const voice = done.outbox!.find((o) => o.channel === "Voice call (Bangla)")!;
const smsOut = done.outbox!.find((o) => o.channel === "SMS (Bangla)")!;
check("all 400 calls and 400 SMS delivered", voice.sent === 400 && smsOut.sent === 400 && !done.outbox!.some((o) => o.inProgress));
check(`sent in parallel (${sendMs} ms; one-by-one would take ≥ ${800 * gatewayDelayMs} ms)`, sendMs < 800 * gatewayDelayMs / 5);
const firstCalls = net.filter((n) => n.url.startsWith("https://ivr.example/")).slice(0, 8).map((n) => decodeURIComponent(new URL(n.url).searchParams.get("to") ?? ""));
const vulnerable = new Set(households.filter((h) => h.priority >= 9).map((h) => h.phoneNumber));
check("the most vulnerable homes are called first", firstCalls.every((p) => vulnerable.has(p)));
check("every call is registered before it is placed", deliveries.forAlert(live.alert.id).length === 400);
gatewayDelayMs = 0;

// ---------- 10. A call answered while the worker is retrying is not lost ----------
const [x, y] = deliveries.forAlert(live.alert.id);
deliveries.report(x.phone, false);
deliveries.report(y.phone, false);
const later = Date.now() + 11 * 60_000;
await deliveries.tick(async () => {
  deliveries.report(y.phone, true); // the IVR webhook arrives (web process) while the worker is placing calls
  return { ok: true };
}, later);
check("webhook during a retry pass is kept (no stale overwrite)", deliveries.forAlert(live.alert.id).find((d) => d.phone === y.phone)?.status === "answered");

// ---------- 11. Telegram "need help" reaches volunteers ----------
areaLists.setContacts("sonagazi", [{ name: "স্বেচ্ছাসেবক", phone: "+8801811000001", role: "volunteer" }]);
const before = net.filter((n) => n.url.startsWith("https://sms.example/")).length;
await handleUpdate({ update_id: 4, callback_query: { id: "cb", from: { id: 4242, first_name: "Amina" }, message: { chat: { id: 4242 }, message_id: 1 }, data: `help:${live.alert.id}` } });
const afterOne = net.filter((n) => n.url.startsWith("https://sms.example/")).length;
await handleUpdate({ update_id: 5, callback_query: { id: "cb", from: { id: 4242, first_name: "Amina" }, message: { chat: { id: 4242 }, message_id: 1 }, data: `help:${live.alert.id}` } });
const afterTwo = net.filter((n) => n.url.startsWith("https://sms.example/")).length;
check("Telegram help request is texted to the area's volunteers", afterOne === before + 1 && replies.forAlert(live.alert.id).some((r) => r.chatId === 4242 && r.status === "help"));
check("repeated help taps do not spam volunteers", afterTwo === afterOne);

// ---------- 12. Unanswered DANGER auto-send happens once, with the verified template ----------
settings.set({ autoSendDangerAfterMin: 45 });
const dz = await flow.createDraft("feni_sadar", { ...feniAt("feni_sadar", "2024-08-20T12"), level: 3 }, "live", "test");
alerts.update(dz.alert.id, (a) => ({ ...a, createdAt: new Date(Date.now() - 50 * 60_000).toISOString(), content: { ...a.content, sms_bn: "AI TEXT" } }));
await Promise.all([escalate(), escalate()]);
await new Promise((r) => setTimeout(r, 300));
const auto = alerts.get(dz.alert.id)!;
check("auto-send fires exactly once", auto.status === "sent" && audit.recent(500).filter((e) => e.alertId === dz.alert.id && e.action.startsWith("auto-sent")).length === 1);
check("auto-send uses the verified template, never AI text", auto.content.sms_bn !== "AI TEXT" && auto.content.sms_bn === templateAlert(auto.facts!).sms_bn);

// ---------- 13. All-clear: only after a warning and once the danger is over; it ends the hold ----------
const stillDanger: Assessment = { ...feniAt("sonagazi", "2024-08-20T12"), level: 3, heldFromDaysAgo: undefined };
check("no all-clear while Danger continues", !flow.allClearAllowed("sonagazi", "live", stillDanger).ok);
check("no all-clear where nothing was sent", !flow.allClearAllowed("hathazari", "live", { areaId: "hathazari", level: 0, signals: [], etaHours: null }).ok);
const held: Assessment = { areaId: "sonagazi", level: 2, signals: [], etaHours: null, heldFromDaysAgo: 1, unheldLevel: 0 };
const ok = flow.allClearAllowed("sonagazi", "live", held);
check("all-clear allowed during the post-Danger hold", ok.ok);
if (ok.ok) {
  const c = flow.createAllClear("sonagazi", "live", ok.last, "test");
  check("all-clear passes every check and says 'withdrawn'", c.result.checks.every((k) => k.ok) && c.result.content.sms_bn.startsWith("সতর্কতা প্রত্যাহার"));
  const sent = await flow.approve(c.alert.id, { id: rahim.id, name: rahim.name, role: rahim.role }, "dashboard");
  if (sent.status === "sent") await sent.sending;
  check("all-clear is sent to households", (alerts.get(c.alert.id)?.outbox?.find((o) => o.channel === "SMS (Bangla)")?.sent ?? 0) === 400);
  check("the hold ends once the all-clear is out", flow.respectAllClear(held).level === 0 && Boolean(flow.respectAllClear(held).clearedAt));
  check("a second all-clear is refused", !flow.allClearAllowed("sonagazi", "live", held).ok);
}

// ---------- 14. Web security: cross-site requests, oversized bodies, bad input, prototype ids ----------
const { proxy } = await import("../src/proxy");
const api = (method: string, h: Record<string, string>, path = "/api/approve") => proxy(new NextRequest(`https://agam.example${path}`, { method, headers: { host: "agam.example", ...h } }));
check("cross-site POST is blocked (CSRF)", api("POST", { origin: "https://evil.example" }).status === 403);
check("cross-site POST without Origin is blocked via Sec-Fetch-Site", api("POST", { "sec-fetch-site": "cross-site" }).status === 403);
check("same-site POST passes", api("POST", { origin: "https://agam.example", "sec-fetch-site": "same-origin" }).status === 200);
check("GET is never blocked", api("GET", { origin: "https://evil.example" }).status === 200);
check("provider webhooks are not CSRF-checked (they use the secret)", api("POST", { origin: "https://sms-gateway.example" }, "/api/sms/inbound").status === 200);
check("oversized bodies are refused", api("POST", { origin: "https://agam.example", "content-length": String(10 * 1024 * 1024) }).status === 413);
const { jsonBody } = await import("../src/lib/http");
check("malformed JSON gives null (→ 400), not a crash", (await jsonBody(new Request("https://x/", { method: "POST", body: "{nope" }))) === null && (await jsonBody(new Request("https://x/", { method: "POST", body: "[1,2]" }))) === null);
check("ids like __proto__ / constructor match no area", !areaById["__proto__" as string] && !areaById["constructor"] && Boolean(areaById.parshuram));

// ---------- 15. AI spending guard: over the hourly cap, no API call is made and the template is used ----------
const { composeAlert } = await import("../src/lib/claude-alert");
const { attempts } = await import("../src/lib/store");
process.env.ANTHROPIC_API_KEY = "test-key-not-real";
for (let i = 0; i < 40; i++) attempts.hit("ai:calls", 60);
const aiBefore = net.filter((n) => n.url.includes("anthropic.com")).length;
const guarded = await composeAlert(dangerFacts);
check("over the AI budget: no API call, verified template, clear note", guarded.source === "template" && /paused/.test(guarded.note ?? "") && net.filter((n) => n.url.includes("anthropic.com")).length === aiBefore);
delete process.env.ANTHROPIC_API_KEY;

console.log(results);
const failed = Object.entries(results).filter(([, ok]) => !ok);
console.log(failed.length ? `FAILED: ${failed.map(([n]) => n).join("; ")}` : `ALL ${Object.keys(results).length} SAFETY CHECKS PASSED`);
fs.rmSync(DIR, { recursive: true, force: true });
process.exit(failed.length ? 1 : 0);
