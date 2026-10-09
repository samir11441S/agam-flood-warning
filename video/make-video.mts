// Renders the competition demo video: npm run video  (the app must be running: npm run dev)
// Output: video/out/agam-demo.mp4 and agam-demo.srt (upload the .srt to YouTube as captions).
//
// Narration: offline Windows voice by default. To use your own voice, record one file per scene and
// save it as video/voice/<scene-id>.wav or .mp3 (scene ids are printed when the script runs).
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { chromium, type CDPSession, type Locator, type Page } from "playwright-core";
import feni from "../src/data/replays/feni-2024.json";
import sylhet from "../src/data/replays/sylhet-2024.json";
import north from "../src/data/replays/north-2024.json";
import chattogram from "../src/data/replays/chattogram-2026.json";
import { buildFacts, templateAlert } from "../src/lib/alerts";
import { areaById, rainThresholds, replayInputs, replaySteps, riverThresholds, stations, tideThresholds, type Replay } from "../src/lib/data";
import { dispatchPlan, syntheticHouseholds } from "../src/lib/households";
import { assessArea } from "../src/lib/risk";
import type { Level } from "../src/lib/types";
import { banglaPitchScript, banglaScript } from "./script-bn.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.join(HERE, "build");
const OUT = path.join(HERE, "out");
const APP = process.env.APP_URL ?? "http://localhost:3000";
const VOICE = process.env.TTS_VOICE ?? "Microsoft Zira Desktop";
const VOICE_RATE = process.env.TTS_RATE ?? "2"; // slightly brisk, keeps the video under 5 minutes
const FFMPEG = ffmpegInstaller.path;
const W = 1440, H = 810, DSF = 4 / 3; // 1920x1080 output
const LEAD = 0.5, GAP = 0.25, TAIL = 0.7, RATE = 44100;
const ARGS = process.argv.slice(2);
const BN = ARGS.includes("--bn");
/** --3min: the 180-second competition pitch (problem → solution → demo → AI approach → impact). */
const CUT = ARGS.includes("--3min");
const MAX_SECONDS = 180;
const VOICE_DIR = path.join(HERE, BN ? (CUT ? "voice-bn-3min" : "voice-bn") : "voice");
const SUFFIX = (CUT ? "-3min" : "") + (BN ? "-bn" : "");
// Recorded narration is sped up slightly (pitch kept) so the Bangla video stays under 5 minutes.
const VOICE_TEMPO = Number(process.env.VOICE_TEMPO ?? (BN ? "1.12" : "1"));

const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000));
const now = () => Date.now() / 1000;

// ---------- data used in narration (always consistent with the engine) ----------
type Member = { name: string; nameBn?: string; role: string; roleBn?: string; photo?: string };
const team = JSON.parse(fs.readFileSync(path.join(HERE, "team.json"), "utf8")) as { teamName: string; teamNameBn?: string; logo?: string; members: Member[]; demoUrl?: string; repoUrl?: string };
const isPlaceholder = (s: string) => !s || s.startsWith("[");
const summaryFile = path.join(HERE, "../docs/evaluation-summary.json");
const summary = fs.existsSync(summaryFile) ? JSON.parse(fs.readFileSync(summaryFile, "utf8")) : null;

const MONTH = (s: string) => new Date(s.slice(0, 10) + "T00:00:00Z").toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
/** "2024-08-19T12" → "at noon on 19 August" (replays move in 6-hour steps). */
function when(step: string) {
  const day = `${Number(step.slice(8, 10))} ${MONTH(step)}`;
  return { "06": `on the morning of ${day}`, "12": `at noon on ${day}`, "18": `on the evening of ${day}`, "24": `at midnight on ${day}` }[step.slice(11, 13)] ?? `on ${day}`;
}

const assess = (r: Replay, id: string, step: string) =>
  assessArea(areaById[id], replayInputs(r, step), stations, rainThresholds, riverThresholds, tideThresholds);

/** `override` replaces the generated sentence (used where the honest story is "we were late"). */
function replayStory(r: Replay, label: string, override?: string) {
  const steps = replaySteps(r).map((step) => ({ step, level: Math.max(...r.focus.map((id) => assess(r, id, step).level)) as Level }));
  // The slide shows one chip per day: the highest level reached that day.
  const days = [...new Set(steps.map((s) => s.step.slice(0, 10)))].map((date) => ({
    date, label: String(Number(date.slice(8))),
    level: Math.max(...steps.filter((s) => s.step.startsWith(date)).map((s) => s.level)) as Level,
  }));
  const firstWarn = steps.find((d) => d.level >= 2);
  const firstDanger = steps.find((d) => d.level === 3);
  const phrase = firstWarn && firstDanger && firstWarn.step === firstDanger.step
    ? `Danger ${when(firstDanger.step)}`
    : [firstWarn && `Warning ${when(firstWarn.step)}`, firstDanger && `Danger ${when(firstDanger.step)}`].filter(Boolean).join(", then ");
  return {
    title: label, area: r.focus.map((id) => areaById[id].name).slice(0, 3).join(", "), days,
    warnStep: firstWarn?.step ?? null, dangerStep: firstDanger?.step ?? null,
    sentence: override ?? `${label}: ${phrase}.`,
  };
}

const stories = [
  replayStory(feni as Replay, "Feni, August 2024"),
  replayStory(sylhet as Replay, "Sylhet, June 2024"),
  replayStory(north as Replay, "The Jamuna, July 2024"),
  replayStory(chattogram as Replay, "Chattogram, July 2026", "Chattogram, July 2026: we were late. The flooding began days earlier, so we added tides and residents' reports."),
];

const F = feni as Replay;
const feniSteps = replaySteps(F);
const focusLevel = (step: string) => Math.max(...F.focus.map((id) => assess(F, id, step).level));
const watchIdx = feniSteps.findIndex((s) => focusLevel(s) >= 1);
const warnIdx = feniSteps.findIndex((s) => focusLevel(s) >= 2);
const firstDangerIdx = feniSteps.findIndex((s) => focusLevel(s) === 3);
const dangerIdx = feniSteps.findIndex((s) => assess(F, "parshuram", s).level === 3);
const dangerAt = (step: string) => F.focus.filter((id) => assess(F, id, step).level === 3);
// First Danger (the coast): which areas, the upstream rain behind it, and whether a spring tide made it worse.
const firstDangerIds = dangerAt(feniSteps[firstDangerIdx]);
const firstDangerAssessment = assess(F, firstDangerIds[0], feniSteps[firstDangerIdx]);
const coastRain = firstDangerAssessment.signals.find((s) => s.kind === "upstream_rain")!;
const coastTide = firstDangerAssessment.signals.find((s) => s.kind === "tide" && s.value > s.threshold);
// Parshuram's Danger a day later: the demo alert.
const DEMO_STEP = feniSteps[dangerIdx];
const newDangerIds = dangerAt(DEMO_STEP).filter((id) => !firstDangerIds.includes(id));
const demoArea = areaById.parshuram;
const demoAssessment = assess(F, "parshuram", DEMO_STEP);
const demoFacts = buildFacts(demoArea, demoAssessment);
const demoAlert = templateAlert(demoFacts);
const demoPlan = dispatchPlan(syntheticHouseholds(demoArea));
const topSignal = demoAssessment.signals[0];
const names = (ids: string[]) => ids.map((id) => areaById[id].name);
const andList = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const windowHours = (w: string) => (w === "24h" ? "24" : w === "72h" ? "72" : "120");
const place = (w: string) => w.replace(/ \(.*\)/, "");

// ---------- scenes ----------
type Ctx = { page: Page; i: number };
type Scene = {
  id: string;
  kind: "slide" | "app";
  sentences: string[];
  english?: string[];
  setup?: (page: Page) => Promise<void>;
  on?: (ctx: Ctx) => Promise<void>;
};

const fullScenes: Scene[] = [
  { id: "01-title", kind: "slide", sentences: [
    "This is Agam. In Bangla, it means: in advance.",
    "Flash-flood warnings that watch the rain across the border, and reach every household in time.",
  ] },
  { id: "02-problem", kind: "slide", sentences: [
    "On the nineteenth of August 2024, cloudbursts hit the hills of Tripura, just across the border from Feni.",
    "Water from those hills reaches Feni in five to eight hours.",
    "Five point eight million people were affected, half a million fled to shelters, and seventy-one died.",
    "Afterwards, flood forecasters said there had been no forecast of a flood this severe.",
  ] },
  { id: "03-forecast", kind: "slide", sentences: [
    "We checked why.",
    "One day ahead, four global weather models forecast 24 to 35 millimetres of rain for Udaipur, in Tripura.",
    "Close to 200 millimetres actually fell.",
    "The forecasts missed it. But the rain itself was visible across the border, hours before the water arrived.",
  ] },
  { id: "04-how", kind: "slide", sentences: [
    "Agam watches that rain.",
    "Every hour, it checks rain at 15 points across the border, 24 flood-prone upazilas, 9 rivers, and the tides.",
    "Each reading is judged against that place's own history: Danger means rain this heavy comes once in five years, here.",
    "When risk rises, Agam drafts the alert itself. Claude writes it in plain Bangla, seven checks verify it, and a local officer approves.",
    "Then it reaches every household, the most vulnerable first.",
  ] },
  { id: "05-replay", kind: "app", sentences: [
    "Here is the prototype, replaying August 2024 with only the data known at each hour.",
    "On the fifteenth, all is normal.",
    `${cap(when(feniSteps[watchIdx]))}, heavy rain begins in Tripura: Watch.`,
    `${cap(when(feniSteps[warnIdx]))}: Warning.`,
    `${cap(when(feniSteps[firstDangerIdx]))}: Danger for ${andList(names(firstDangerIds))}. ${coastRain.value} millimetres upstream in ${windowHours(coastRain.window)} hours${coastTide ? ", plus a spring tide that stops the water draining" : ""}.`,
    `${cap(when(DEMO_STEP))}: ${topSignal.value} millimetres at ${place(topSignal.where)} in one day, a once-in-five-years rain. Danger for ${andList(names(newDangerIds).slice(0, 3))}.`,
    "The dashed lines trace the water's path across the border.",
  ],
    setup: async (page) => { await openApp(page); },
    on: async ({ page, i }) => {
      if (i === 2) await setSlider(page, watchIdx);
      if (i === 3) await setSlider(page, warnIdx);
      if (i === 4) await setSlider(page, firstDangerIdx);
      if (i === 5) await setSlider(page, dangerIdx);
      if (i === 6) await hover(page, page.locator(".leaflet-overlay-pane path[stroke-dasharray]").first());
    } },
  { id: "06-evidence", kind: "app", sentences: [
    "Every alert explains itself.",
    `At ${place(topSignal.where)}, ${topSignal.value} millimetres of rain fell in ${windowHours(topSignal.window)} hours, above that place's five-year level of ${topSignal.threshold}.`,
    `Expected arrival in Parshuram: ${Math.max(1, demoAssessment.etaHours![0])} to ${demoAssessment.etaHours![1]} hours, an estimate, and labelled as one. No black box.`,
  ],
    on: async ({ page, i }) => {
      if (i === 0) await click(page, page.getByText("Parshuram, Feni"));
      if (i === 1) await hover(page, page.locator("aside li").first());
      if (i === 2) await hover(page, page.getByText("Water may arrive in"));
    } },
  { id: "07-alert", kind: "app", sentences: [
    "A signed-in officer drafts the warning in one click, in plain Bangla.",
    "An SMS, a voice call for people who cannot read, and a loudspeaker announcement for the mosque, all in the name of their own union committee.",
    "The AI never decides the danger level, and it cannot invent a number.",
    "Seven safety checks run on every message. If any check fails, a verified template is sent instead.",
  ],
    on: async ({ page, i }) => {
      if (i === 0) { await click(page, page.getByRole("button", { name: /Draft Bangla alert/ })); await page.getByText("Draft alert — needs human approval").waitFor(); await sleep(0.4); await scrollAside(page, page.getByText("Draft alert — needs human approval")); }
      if (i === 1) await scrollAside(page, page.getByText("Voice call script"));
      if (i === 2) await scrollAside(page, page.getByText("Loudspeaker announcement"));
      if (i === 3) await scrollAside(page, page.getByText("Safety checks"));
    } },
  { id: "08-dispatch", kind: "app", sentences: [
    "The officer approves. For Danger, a committee can require two.",
    `Agam ranks ${demoPlan.total} households: elderly, disabled, pregnant and phone-less first.`,
    "Every phone gets a voice call and an SMS. Unanswered calls are retried, then a backup number, then a volunteer.",
    "Homes without a phone get a volunteer at the door.",
    "People reply with one key, safe or need help, and help requests appear on the rescue map.",
    `Everyone is reached in about ${demoPlan.minutesToReachAll} minutes.`,
  ],
    on: async ({ page, i }) => {
      if (i === 0) { await click(page, page.getByRole("button", { name: /Approve & send/ })); await page.getByText("Dispatch & replies").waitFor(); await sleep(0.4); await scrollAside(page, page.getByText("Dispatch & replies")); }
      if (i === 1) await scrollAside(page, page.getByText("Highest-priority households first"));
      if (i === 2) await scrollAside(page, page.getByText("Outbox — what was sent"));
      if (i === 3) await scrollAside(page, page.getByText("Volunteer door-knock routes"));
      if (i === 4) { await scrollAside(page, page.getByText("Rescue list")); await hover(page, page.locator(".leaflet-overlay-pane path.leaflet-interactive").last()); }
      if (i === 5) await scrollAside(page, page.getByText("Dispatch & replies"));
    } },
  { id: "09-phone", kind: "slide", sentences: [
    "Not everyone has a smartphone, so Agam uses every channel.",
    "Calls and SMS reach any phone, and residents can text PANI to report rising water.",
    "On Telegram, pressing need help drops a pin on the rescue map.",
    "And at night, if one officer does not answer, Agam asks the next.",
  ],
    on: async ({ page, i }) => { if (i === 2) await page.evaluate(() => (window as unknown as { tapHelp: () => void }).tapHelp()); } },
  { id: "10-proof", kind: "slide", sentences: [
    "Does it work?",
    ...stories.map((s) => s.sentence),
    summary
      ? `In a 30-year backtest, Agam raised Danger on or before the onset of ${summary.onTime} of ${summary.events} documented area floods, with a median of ${summary.medianDangerEpisodesPerYear.toFixed(1)} alarms per area per year.`
      : "Every number is reproducible from open data, with one command.",
  ] },
  { id: "11-business", kind: "slide", sentences: [
    "Citizens never pay.",
    "Agam is paid for by those who need trusted early triggers: anticipatory-cash programmes, disaster committees, lenders and insurers.",
    "And it scales: every data source is global and free, so a new region is just a config file and a 15-minute calibration.",
    "Any AI assistant can also query Agam through its MCP server.",
  ] },
  { id: "12-team", kind: "slide", sentences: [
    isPlaceholder(team.teamName) ? "Meet the team behind Agam." : `We are team ${team.teamName}.`,
    team.members.some((m) => !isPlaceholder(m.name))
      ? andList(team.members.filter((m) => !isPlaceholder(m.name)).map((m) => `${m.role} ${m.name}`)) + "."
      : "A small team of builders from Bangladesh.",
  ] },
  { id: "13-cta", kind: "slide", sentences: [
    "Google can predict a flood. Agam makes sure the grandmother on the char hears it, in her language, in time.",
    "We are looking for a pilot union in Feni for the next monsoon.",
    "Thank you.",
  ] },
];

// The 180-second pitch follows the judges' breakdown: 0:00 problem, 0:30 solution, 1:00 demo, 2:00 AI approach, 2:30 impact.
const pitchScenes: Scene[] = [
  { id: "p1-hook", kind: "slide", sentences: [
    "On 19 August 2024, cloudbursts over Tripura sent flash floods into Feni within hours.",
    "5.8 million people were affected, 71 died, and there was no forecast of a flood this severe.",
    "Union disaster committees must warn every village, but the elderly, the disabled and families without phones hear last.",
    "And the same cross-border flash floods threaten Nepal, Northeast India, Myanmar and East Africa.",
  ] },
  { id: "p2-solution", kind: "slide", sentences: [
    "Agam, Bangla for in advance, watches the rain where it falls: across the border, hours before the water arrives.",
    "Every hour it compares rain at 15 upstream points, 24 upazilas, rivers and tides with each place's own history.",
    "When risk rises, AI writes a plain-Bangla voice call and SMS, a local officer approves, and every household is reached, the most vulnerable first.",
    "River forecasts cover big rivers, days ahead. Agam covers small flashy rivers, hours ahead, down to every household.",
  ] },
  { id: "p3-replay", kind: "app", sentences: [
    "Here is the working prototype, replaying August 2024 with only the data known at each hour.",
    `${cap(when(feniSteps[watchIdx]))}, heavy rain in Tripura: Watch.`,
    `${cap(when(feniSteps[warnIdx]))}: Warning.`,
    `${cap(when(feniSteps[firstDangerIdx]))}: Danger for ${andList(names(firstDangerIds))}${coastTide ? ", as heavy rain meets a spring tide" : ""}.`,
    `${cap(when(DEMO_STEP))}: ${topSignal.value} millimetres at ${place(topSignal.where)} in one day, a once-in-five-years rain there.`,
    `Every level explains itself: water may reach Parshuram in ${Math.max(1, demoAssessment.etaHours![0])} to ${demoAssessment.etaHours![1]} hours.`,
  ],
    setup: async (page) => { await openApp(page); },
    on: async ({ page, i }) => {
      if (i === 1) await setSlider(page, watchIdx);
      if (i === 2) await setSlider(page, warnIdx);
      if (i === 3) await setSlider(page, firstDangerIdx);
      if (i === 4) await setSlider(page, dangerIdx);
      if (i === 5) { await click(page, page.getByText("Parshuram, Feni")); await hover(page, page.getByText("Water may arrive in")); }
    } },
  { id: "p4-alert", kind: "app", sentences: [
    "One click, and Claude drafts the alert in plain Bangla: SMS, voice call and mosque announcement.",
    "Seven safety checks pass, and the officer approves.",
    "Calls and SMS go to every phone, most vulnerable first; homes without a phone get a volunteer.",
    "People reply 1 for safe or 2 for help, and help requests go straight to volunteers.",
  ],
    on: async ({ page, i }) => {
      if (i === 0) { await click(page, page.getByRole("button", { name: /Draft Bangla alert/ })); await page.getByText("Draft alert — needs human approval").waitFor(); await sleep(0.3); await scrollAside(page, page.getByText("Draft alert — needs human approval")); }
      if (i === 1) await scrollAside(page, page.getByText("Safety checks"));
      if (i === 2) { await click(page, page.getByRole("button", { name: /Approve & send/ })); await page.getByText("Dispatch & replies").waitFor(); await sleep(0.3); await scrollAside(page, page.getByText("Outbox — what was sent")); }
      if (i === 3) { await scrollAside(page, page.getByText("Any phone can answer")); await hover(page, page.locator(".leaflet-overlay-pane path.leaflet-interactive").last()); }
    } },
  { id: "p5-ai", kind: "slide", sentences: [
    "The AI approach. Input: hourly rain, river and tide data, plus residents' text reports.",
    "Transparent rules, calibrated on 30 years of local data, decide the danger level, so the AI never guesses it.",
    "Claude then writes the message from verified facts only, personalised by area, language and sender; seven guardrails check it, and an officer approves.",
    "Output: calls and SMS, most vulnerable first, and an MCP server so other AI agents can use Agam.",
  ] },
  { id: "p6-impact", kind: "slide", sentences: [
    summary
      ? `In a 30-year backtest, Agam raised Danger in time for ${summary.onTime} of ${summary.events} documented floods, with less than one alarm per area per year.`
      : "Every number is reproducible from open data, with one command.",
    "In a pilot, we will measure every household reached within 30 minutes, and at least 80 percent understanding the alert.",
    "Disaster committees, NGOs and insurers pay, never citizens. Next: a pilot union in Feni, then the region.",
    `We are ${isPlaceholder(team.teamName) ? "the Agam team" : team.teamName}. Agam makes sure the grandmother on the char hears it, in her language, in time.`,
  ] },
];

const scenes = CUT ? pitchScenes : fullScenes;

if (BN) {
  const namesBn = (ids: string[]) => ids.map((id) => areaById[id].nameBn);
  const bn = (CUT ? banglaPitchScript : banglaScript)({
    watchStep: feniSteps[watchIdx], warnStep: feniSteps[warnIdx],
    firstDanger: { step: feniSteps[firstDangerIdx], areasBn: namesBn(firstDangerIds), rain: coastRain, tide: Boolean(coastTide) },
    dangerStep: DEMO_STEP,
    top: topSignal,
    dangerAreasBn: namesBn(newDangerIds),
    eta: [Math.max(1, demoAssessment.etaHours![0]), demoAssessment.etaHours![1]],
    households: demoPlan.total, minutes: demoPlan.minutesToReachAll,
    stories: [
      { labelBn: "ফেনী, দুই হাজার চব্বিশ", warnStep: stories[0].warnStep, dangerStep: stories[0].dangerStep },
      { labelBn: "সিলেট, দুই হাজার চব্বিশ", warnStep: stories[1].warnStep, dangerStep: stories[1].dangerStep },
      { labelBn: "যমুনা, দুই হাজার চব্বিশ", warnStep: stories[2].warnStep, dangerStep: stories[2].dangerStep },
      { labelBn: "চট্টগ্রাম, জুলাই দুই হাজার ছাব্বিশ", warnStep: stories[3].warnStep, dangerStep: stories[3].dangerStep,
        sentenceBn: "চট্টগ্রাম, দুই হাজার ছাব্বিশ: আমরা দেরি করেছিলাম — তাই যোগ করেছি জোয়ার আর এলাকাবাসীর খবর।" },
    ],
    summary, team, isPlaceholder,
  });
  for (const sc of scenes) {
    const b = bn[sc.id];
    if (!b || b.length !== sc.sentences.length) throw new Error(`Bangla script for ${sc.id} must have ${sc.sentences.length} sentences`);
    sc.english = sc.sentences;
    sc.sentences = b;
  }
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------- audio ----------
function readWav(file: string) {
  const buf = fs.readFileSync(file);
  let off = 12;
  while (off < buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "data") return buf.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size % 2);
  }
  throw new Error("no data chunk in " + file);
}

function writeWav(file: string, pcm: Buffer) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, pcm]));
}

const silence = (s: number) => Buffer.alloc(Math.round(s * RATE) * 2);
const pcmSeconds = (pcm: Buffer) => pcm.length / 2 / RATE;

function tts(text: string): Buffer {
  const key = createHash("sha1").update(VOICE + "|" + VOICE_RATE + "|" + text).digest("hex").slice(0, 16);
  const wav = path.join(BUILD, "tts", key + ".wav");
  if (!fs.existsSync(wav)) {
    fs.mkdirSync(path.dirname(wav), { recursive: true });
    const txt = wav.replace(/\.wav$/, ".txt");
    fs.writeFileSync(txt, text);
    execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(HERE, "tts.ps1"), "-TextFile", txt, "-OutFile", wav, "-Voice", VOICE, "-Rate", VOICE_RATE]);
  }
  return readWav(wav);
}

/** Converts a user recording to 44.1 kHz mono PCM. */
function recording(file: string): Buffer {
  const out = path.join(BUILD, "voice-" + path.basename(file) + ".wav");
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", file, ...(VOICE_TEMPO !== 1 ? ["-filter:a", `atempo=${VOICE_TEMPO}`] : []), "-ac", "1", "-ar", String(RATE), "-sample_fmt", "s16", out]);
  return readWav(out);
}

type Timed = { text: string; start: number; end: number };

function sceneAudio(scene: Scene): { pcm: Buffer; timeline: Timed[]; total: number } {
  const override = ["wav", "mp3", "m4a"].map((e) => path.join(VOICE_DIR, `${scene.id}.${e}`)).find((f) => fs.existsSync(f));
  if (BN && !override) throw new Error(`Missing Bangla narration: video/voice-bn/${scene.id}.mp3 (scripts are in video/voice-bn/scripts/)`);
  const timeline: Timed[] = [];
  if (override) {
    const voice = recording(override);
    const dur = pcmSeconds(voice);
    const chars = scene.sentences.reduce((a, s) => a + s.length, 0);
    let t = LEAD;
    for (const s of scene.sentences) {
      const d = (s.length / chars) * dur;
      timeline.push({ text: s, start: t, end: t + d });
      t += d;
    }
    return { pcm: Buffer.concat([silence(LEAD), voice, silence(TAIL)]), timeline, total: LEAD + dur + TAIL };
  }
  const parts: Buffer[] = [silence(LEAD)];
  let t = LEAD;
  for (const s of scene.sentences) {
    const p = tts(s);
    const d = pcmSeconds(p);
    timeline.push({ text: s, start: t, end: t + d });
    parts.push(p, silence(GAP));
    t += d + GAP;
  }
  parts.push(silence(TAIL));
  return { pcm: Buffer.concat(parts), timeline, total: t + TAIL };
}

// ---------- browser helpers ----------
const OVERLAY_JS = `(() => {
  if (document.getElementById("__cap")) return;
  const css = document.createElement("style");
  css.textContent = \`
    nextjs-portal, [data-nextjs-toast], [data-next-badge-root], [data-novoice] { display: none !important; }
    #__cap { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); z-index: 99999; max-width: 1180px; width: max-content;
      background: rgba(2,6,12,.8); color: #fff; font: 500 24px/1.35 Geist, var(--font-bangla), 'Hind Siliguri', system-ui, sans-serif; padding: 10px 22px; border-radius: 10px; text-align: center; }
    #__cap:empty { display: none; }
    #__cur { position: fixed; z-index: 100000; left: 720px; top: 600px; width: 26px; height: 26px; pointer-events: none;
      transition: left .75s cubic-bezier(.3,.7,.2,1), top .75s cubic-bezier(.3,.7,.2,1); filter: drop-shadow(0 2px 3px rgba(0,0,0,.5)); }
    .__ripple { position: fixed; z-index: 99999; width: 14px; height: 14px; border-radius: 50%; border: 3px solid #38bdf8; pointer-events: none;
      transform: translate(-50%, -50%); animation: __rp .6s ease-out forwards; }
    @keyframes __rp { to { width: 64px; height: 64px; opacity: 0; } }\`;
  document.head.appendChild(css);
  const cap = document.createElement("div"); cap.id = "__cap"; document.body.appendChild(cap);
  const cur = document.createElement("div"); cur.id = "__cur";
  cur.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2l16 9-7 2-3 7z" fill="#fff" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  document.body.appendChild(cur);
  window.caption = (t) => { cap.textContent = t || ""; };
  window.cursorTo = (x, y) => { cur.style.left = (x - 4) + "px"; cur.style.top = (y - 2) + "px"; };
  window.ripple = (x, y) => { const r = document.createElement("div"); r.className = "__ripple"; r.style.left = x + "px"; r.style.top = y + "px"; document.body.appendChild(r); setTimeout(() => r.remove(), 700); };
})();`;

async function pointAt(page: Page, loc: Locator) {
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  const box = await loc.boundingBox();
  if (!box) return null;
  const x = box.x + Math.min(box.width / 2, 60), y = box.y + box.height / 2;
  await page.evaluate(([x, y]) => (window as unknown as { cursorTo: (x: number, y: number) => void }).cursorTo(x, y), [x, y]);
  await sleep(0.85);
  return { x, y };
}

async function hover(page: Page, loc: Locator) {
  await pointAt(page, loc);
}

async function click(page: Page, loc: Locator) {
  const p = await pointAt(page, loc);
  if (p) await page.evaluate(([x, y]) => (window as unknown as { ripple: (x: number, y: number) => void }).ripple(x, y), [p.x, p.y]);
  await loc.click();
}

async function setSlider(page: Page, index: number) {
  const slider = page.locator('input[type="range"]');
  const box = await slider.boundingBox();
  const max = Number(await slider.getAttribute("max"));
  if (box) {
    const x = box.x + 8 + ((box.width - 16) * index) / max, y = box.y + box.height / 2;
    await page.evaluate(([x, y]) => (window as unknown as { cursorTo: (x: number, y: number) => void }).cursorTo(x, y), [x, y]);
    await sleep(0.8);
    await page.evaluate(([x, y]) => (window as unknown as { ripple: (x: number, y: number) => void }).ripple(x, y), [x, y]);
  }
  await slider.evaluate((el, v) => {
    const input = el as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, String(v));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, index);
  await sleep(1);
}

async function scrollAside(page: Page, target: Locator) {
  const handle = await target.first().elementHandle();
  if (!handle) return;
  await handle.evaluate((el) => {
    const aside = document.querySelector("aside")!;
    const top = el.getBoundingClientRect().top - aside.getBoundingClientRect().top + aside.scrollTop - 16;
    aside.scrollTo({ top, behavior: "smooth" });
  });
  await sleep(0.9);
}

async function openApp(page: Page) {
  await page.goto(APP, { waitUntil: "networkidle" });
  await page.evaluate(OVERLAY_JS);
  // Drafting needs a signed-in officer. The video runs in demo mode (no officers configured), so nothing can reach a real phone.
  const session = await (await page.request.get(APP + "/api/session")).json() as { demoMode: boolean; demoPin: string | null };
  if (!session.demoMode || !session.demoPin) throw new Error("Record the video in demo mode (no officers configured), so no real alert can be sent.");
  await page.getByRole("button", { name: "Officer sign in" }).click();
  await page.getByLabel("PIN").fill(session.demoPin);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Sign out" }).waitFor();
  await page.getByRole("button", { name: "Replay: Feni, Aug 2024" }).click();
  await page.waitForSelector('input[type="range"]');
  await setSlider(page, 0);
  await page.waitForLoadState("networkidle");
  await sleep(2);
}

// ---------- recording ----------
async function record(page: Page, cdp: CDPSession, scene: Scene, dir: string, timeline: Timed[], total: number) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const frames: number[] = [];
  const onFrame = async (f: { data: string; metadata: { timestamp?: number }; sessionId: number }) => {
    const n = frames.length;
    frames.push(f.metadata.timestamp ?? now());
    fs.writeFileSync(path.join(dir, `${String(n).padStart(6, "0")}.jpg`), Buffer.from(f.data, "base64"));
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  };
  cdp.on("Page.screencastFrame", onFrame);
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080 });
  // Nudge a repaint so the first frame arrives immediately.
  await page.evaluate(() => document.body.style.setProperty("--tick", String(Math.random())));
  while (frames.length === 0) await sleep(0.02);
  const t0 = frames[0];
  for (let i = 0; i < timeline.length; i++) {
    const wait = t0 + timeline[i].start - now();
    if (wait > 0) await sleep(wait);
    await page.evaluate(([text, i, isSlide]) => {
      const w = window as unknown as Record<string, (x: unknown) => void>;
      w.caption(text);
      if (isSlide) w.beat(i);
    }, [timeline[i].text, i, scene.kind === "slide"] as const);
    if (scene.on) await scene.on({ page, i });
  }
  const end = t0 + total;
  const lastEnd = timeline.at(-1)!.end;
  await sleep(Math.max(0, t0 + lastEnd - now()));
  await page.evaluate(() => (window as unknown as { caption: (t: string) => void }).caption(""));
  await sleep(Math.max(0, end - now()));
  await cdp.send("Page.stopScreencast");
  cdp.off("Page.screencastFrame", onFrame);

  const framePath = (k: number) => path.join(dir, `${String(k).padStart(6, "0")}.jpg`).replace(/\\/g, "/");
  const lines: string[] = [];
  frames.forEach((ts, k) => {
    const next = k + 1 < frames.length ? frames[k + 1] : end;
    lines.push(`file '${framePath(k)}'`, `duration ${Math.max(0.001, next - ts).toFixed(4)}`);
  });
  lines.push(`file '${framePath(frames.length - 1)}'`);
  fs.writeFileSync(path.join(dir, "frames.txt"), lines.join("\n"));
  return frames.length;
}

function encodeScene(dir: string, audioFile: string, total: number, out: string) {
  const fadeOut = Math.max(0, total - 0.45).toFixed(2);
  execFileSync(FFMPEG, [
    "-y", "-loglevel", "error",
    "-f", "concat", "-safe", "0", "-i", path.join(dir, "frames.txt"),
    "-i", audioFile,
    "-vf", `fps=30,scale=1920:1080:flags=lanczos,format=yuv420p,fade=t=in:st=0:d=0.35,fade=t=out:st=${fadeOut}:d=0.45`,
    "-af", `afade=t=in:st=0:d=0.2,afade=t=out:st=${fadeOut}:d=0.45`,
    "-t", total.toFixed(3),
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-r", "30",
    "-c:a", "aac", "-b:a", "192k", "-ar", String(RATE), "-ac", "2",
    out,
  ]);
}

const srtTime = (s: number) => {
  const ms = Math.round(s * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), sec = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};

// ---------- main ----------
fs.mkdirSync(BUILD, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
const only = ARGS.find((a) => !a.startsWith("--"));

if (BN) {
  const dir = path.join(VOICE_DIR, "scripts");
  fs.mkdirSync(dir, { recursive: true });
  for (const sc of scenes) fs.writeFileSync(path.join(dir, `${sc.id}.txt`), sc.sentences.join(" "));
  if (ARGS.includes("--scripts-only")) {
    console.log(`Wrote ${scenes.length} Bangla narration scripts to ${dir}`);
    process.exit(0);
  }
  // Recorded clips must match the current script, or the voice and the captions would disagree.
  // clips.json remembers which script text each clip was recorded from.
  const manifestFile = path.join(VOICE_DIR, "clips.json");
  const manifest: Record<string, string> = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, "utf8")) : {};
  const hash = (sc: Scene) => createHash("sha1").update(sc.sentences.join(" ")).digest("hex").slice(0, 12);
  const accept = ARGS.find((a) => a.startsWith("--accept-clips="))?.slice("--accept-clips=".length);
  if (accept) {
    for (const sc of scenes) if (accept === "all" || accept.split(",").includes(sc.id)) manifest[sc.id] = hash(sc);
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 1));
    console.log(`Marked clips as matching the current script: ${accept}`);
    process.exit(0);
  }
  const stale = scenes.filter((sc) => manifest[sc.id] !== hash(sc)).map((sc) => sc.id);
  if (stale.length && !ARGS.includes("--force")) {
    console.error(`These Bangla clips were recorded from an older script: ${stale.join(", ")}.\n` +
      `Record new clips from video/voice-bn/scripts/<scene>.txt, save them as video/voice-bn/<scene>.mp3, then run:\n` +
      `  npx tsx video/make-video.mts --bn --accept-clips=${stale.join(",")}`);
    process.exit(1);
  }
}

if (ARGS.includes("--dry")) {
  let sum = 0;
  for (const sc of scenes) {
    const { total } = sceneAudio(sc);
    sum += total;
    console.log(`${sc.id.padEnd(14)} ${total.toFixed(1)}s`);
  }
  console.log(`total ${Math.floor(sum / 60)}:${String(Math.round(sum % 60)).padStart(2, "0")}`);
  if (CUT && sum > MAX_SECONDS) console.log(`TOO LONG for the ${MAX_SECONDS}-second limit by ${(sum - MAX_SECONDS).toFixed(1)} s`);
  process.exit(0);
}

const health = await fetch(APP + "/api/risk?replay=feni-2024").catch(() => null);
if (!health?.ok) {
  console.error(`The app is not reachable at ${APP}. Start it first with: npm run dev`);
  process.exit(1);
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DSF });
const videoData = {
  team,
  summary,
  alert: { levelBn: demoFacts.levelBn, areaBn: demoFacts.areaBn, sms: demoAlert.sms_bn, checklist: demoAlert.checklist_bn },
  replays: stories.map(({ title, area, days }) => ({ title, area, days })),
};
await ctx.addInitScript((d) => { (window as unknown as { __VIDEO__: unknown }).__VIDEO__ = d; }, videoData);

let appPage: Page | null = null;
let offset = 0;
const srt: string[] = [];
const srtEn: string[] = [];
const sceneFiles: string[] = [];

for (const scene of scenes) {
  const file = path.join(BUILD, `${scene.id}${SUFFIX}.mp4`);
  const { pcm, timeline, total } = sceneAudio(scene);
  const audioFile = path.join(BUILD, `${scene.id}${SUFFIX}.wav`);
  writeWav(audioFile, pcm);

  if (!only || scene.id.startsWith(only)) {
    let page: Page;
    if (scene.kind === "slide") {
      page = await ctx.newPage();
      await page.goto(pathToFileURL(path.join(HERE, "slides.html")).href + `?scene=${scene.id.slice(3)}`, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      await sleep(0.5);
    } else {
      if (!appPage) {
        appPage = await ctx.newPage();
        await scene.setup?.(appPage);
      }
      page = appPage;
      await page.evaluate(OVERLAY_JS);
    }
    const cdp = await ctx.newCDPSession(page);
    const dir = path.join(BUILD, "frames", scene.id);
    const n = await record(page, cdp, scene, dir, timeline, total);
    await cdp.detach();
    encodeScene(dir, audioFile, total, file);
    if (scene.kind === "slide") await page.close();
    console.log(`✓ ${scene.id}  ${total.toFixed(1)}s  ${n} frames`);
  } else {
    console.log(`· ${scene.id}  (kept previous render)`);
  }

  timeline.forEach((t, k) => {
    const time = `${srtTime(offset + t.start)} --> ${srtTime(offset + t.end)}`;
    srt.push(`${srt.length / 4 + 1}`, time, t.text, "");
    srtEn.push(`${srtEn.length / 4 + 1}`, time, scene.english?.[k] ?? t.text, "");
  });
  offset += total;
  sceneFiles.push(file);
}
await browser.close();

const list = path.join(BUILD, `scenes${SUFFIX}.txt`);
fs.writeFileSync(list, sceneFiles.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
const finalMp4 = path.join(OUT, `agam-demo${SUFFIX}.mp4`);
execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", finalMp4]);
fs.writeFileSync(path.join(OUT, `agam-demo${SUFFIX}.srt`), srt.join("\n"));
if (BN) fs.writeFileSync(path.join(OUT, `agam-demo${SUFFIX}.en.srt`), srtEn.join("\n"));
console.log(`\nDone: ${finalMp4}  (${Math.floor(offset / 60)}:${String(Math.round(offset % 60)).padStart(2, "0")})`);
