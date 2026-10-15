import { headers } from "next/headers";
import { fieldTestAlert, fieldTestQuestions } from "@/lib/field-test";
import { jsonBody, str } from "@/lib/http";
import { clientKey } from "@/lib/officers";
import { requireOfficer } from "@/lib/session";
import { attempts, fieldTests } from "@/lib/store";

/** This form is public (residents answer on a volunteer's phone), so writes are rate-limited. */
const PER_CLIENT = { limit: 60, windowMin: 60 };
const ALL_CLIENTS = { limit: 1000, windowMin: 24 * 60 };

/** Saves one anonymous answer sheet (no names, no phone numbers). */
export async function POST(request: Request) {
  const client = `field-test:${clientKey(await headers())}`;
  if (attempts.blocked(client, PER_CLIENT.limit, PER_CLIENT.windowMin) || attempts.blocked("field-test:*", ALL_CLIENTS.limit, ALL_CLIENTS.windowMin)) {
    return Response.json({ error: "Too many answers sent. Please try again later." }, { status: 429 });
  }
  const body = await jsonBody<{ answers: Record<string, unknown>; ageGroup: string; gender: string; canRead: string; area: string }>(request);
  if (!body?.answers || typeof body.answers !== "object" || Array.isArray(body.answers)) return Response.json({ error: "answers required" }, { status: 400 });
  const clean = Object.fromEntries(Object.entries(body.answers).slice(0, 20).map(([k, v]) => [k.slice(0, 20), String(v).slice(0, 80)]));
  attempts.hit(client, PER_CLIENT.windowMin);
  attempts.hit("field-test:*", ALL_CLIENTS.windowMin);
  fieldTests.add({ at: new Date().toISOString(), answers: clean, ageGroup: str(body.ageGroup, 20), gender: str(body.gender, 20), canRead: str(body.canRead, 20), area: str(body.area, 40) });
  return Response.json({ ok: true });
}

/** Officer-only results: comprehension score and a CSV export. */
export async function GET(request: Request) {
  const officer = await requireOfficer();
  if (officer instanceof Response) return officer;
  const all = fieldTests.all();
  const qs = fieldTestQuestions(fieldTestAlert().facts.eta);
  const scored = qs.filter((q) => q.correct);
  const understood = all.filter((a) => scored.every((q) => a.answers[q.id] === q.correct)).length;
  if (new URL(request.url).searchParams.get("format") === "csv") {
    const cols = ["at", "area", "ageGroup", "gender", "canRead", ...qs.map((q) => q.id)];
    // Answers come from a public form: a cell starting with = + - @ would run as a formula in Excel, so neutralise it.
    const cell = (v: unknown) => {
      const s = String(v ?? "");
      return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
    };
    const rows = all.map((a) => [a.at, a.area, a.ageGroup, a.gender, a.canRead, ...qs.map((q) => a.answers[q.id])].map(cell).join(","));
    return new Response("\uFEFF" + [cols.join(","), ...rows].join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=agam-field-test.csv" } });
  }
  return Response.json({
    total: all.length,
    understoodAll: understood,
    perQuestion: scored.map((q) => ({ id: q.id, correct: all.filter((a) => a.answers[q.id] === q.correct).length })),
  });
}
