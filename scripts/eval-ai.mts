// Live evaluation of the AI alert writer with your real (free) keys from .env.local.
//   npm run eval:ai                 6 cases (2 areas × Watch/Warning/Danger) — safe for a free quota
//   npm run eval:ai -- --all        all 72 cases (24 areas × 3 levels) → writes docs/AI-EVAL.md
//   npm run eval:ai -- --gap 8      seconds between calls (default 6, stays under free per-minute limits)
// Uses a temporary data folder, so no cached drafts are reused and nothing is sent to anyone.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.AGAM_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agam-eval-"));
process.env.AI_CALLS_PER_HOUR = "100000"; // the evaluation paces itself instead

const args = process.argv.slice(2);
const all = args.includes("--all");
const gap = Number(args[args.indexOf("--gap") + 1]) || 6;

const { activeWriters, composeAlert } = await import("../src/lib/ai-writer");
const { buildFacts } = await import("../src/lib/alerts");
const { areas } = await import("../src/lib/data");
type Assessment = import("../src/lib/types").Assessment;

const writers = activeWriters();
if (!writers.length) {
  console.log("No AI key found. Put GEMINI_API_KEY=... (free: https://aistudio.google.com/apikey) in .env.local, then run again.");
  process.exit(1);
}
console.log("Providers:", writers.map((w) => `${w.name} [${w.models.join(", ")}]`).join(" → "));

const picked = all ? areas : areas.filter((a) => ["parshuram", "sunamganj"].includes(a.id));
const cases = picked.flatMap((area) => ([1, 2, 3] as const).map((level) => ({ area, level })));
type Row = { area: string; level: string; ok: boolean; writer: string; ms: number; note: string; sms: string };
const rows: Row[] = [];

for (const [i, { area, level }] of cases.entries()) {
  const a: Assessment = {
    areaId: area.id, level, etaHours: [3, 10],
    signals: [{ kind: "upstream_rain", level, where: "Belonia (S. Tripura)", whereBn: "বিলোনিয়া (দক্ষিণ ত্রিপুরা)", value: level === 3 ? 192 : level === 2 ? 130 : 95, threshold: level === 3 ? 160 : 120, unit: "mm", window: "72h", etaHours: [3, 10] }],
  };
  const facts = buildFacts(area, a);
  const t0 = Date.now();
  const r = await composeAlert(facts);
  const row: Row = { area: area.name, level: facts.levelEn, ok: r.source === "ai" && r.checks.every((c) => c.ok), writer: r.writer ?? "template", ms: Date.now() - t0, note: r.note ?? "", sms: r.content.sms_bn };
  rows.push(row);
  console.log(`${String(i + 1).padStart(2)}/${cases.length} ${row.ok ? "PASS" : "----"} ${row.area} ${row.level.padEnd(7)} ${String(row.ms).padStart(5)} ms  ${row.writer}${row.note ? `  (${row.note.slice(0, 120)})` : ""}`);
  if (i < cases.length - 1) await new Promise((res) => setTimeout(res, gap * 1000));
}

const passed = rows.filter((r) => r.ok).length;
const byWriter = Object.entries(rows.reduce<Record<string, number>>((m, r) => ({ ...m, [r.writer]: (m[r.writer] ?? 0) + 1 }), {}));
const median = [...rows].map((r) => r.ms).sort((x, y) => x - y)[Math.floor(rows.length / 2)];
console.log(`\nAI drafts passing all 7 checks: ${passed}/${rows.length} · median ${median} ms · written by: ${byWriter.map(([w, n]) => `${w} ×${n}`).join(", ")}`);
console.log("(Anything not passing was replaced by the verified template — residents never receive an unchecked draft.)");

if (all) {
  const md = [
    "# AI alert-writer evaluation (live)",
    "",
    `Run on ${new Date().toISOString().slice(0, 10)} with \`npm run eval:ai -- --all\`: ${rows.length} cases (${picked.length} areas × Watch / Warning / Danger), real API calls, no cached drafts.`,
    "",
    `**AI drafts passing all 7 safety checks: ${passed} of ${rows.length} (${Math.round((100 * passed) / rows.length)}%).** Median time per draft: ${median} ms. Every other case was sent as the verified template, so no unchecked text could reach residents.`,
    "",
    `Written by: ${byWriter.map(([w, n]) => `${w} (${n})`).join(", ")}.`,
    "",
    "| Area | Level | Result | Writer | Time | SMS |",
    "|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.area} | ${r.level} | ${r.ok ? "pass" : "template"} | ${r.writer} | ${r.ms} ms | ${r.sms.replace(/\|/g, "/")} |`),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(process.cwd(), "docs", "AI-EVAL.md"), md);
  fs.writeFileSync(path.join(process.cwd(), "docs", "ai-eval-summary.json"), JSON.stringify({ date: new Date().toISOString().slice(0, 10), cases: rows.length, passed, medianMs: median, writers: Object.fromEntries(byWriter) }, null, 2) + "\n");
  console.log("Wrote docs/AI-EVAL.md and docs/ai-eval-summary.json");
}
fs.rmSync(process.env.AGAM_DATA_DIR!, { recursive: true, force: true });
