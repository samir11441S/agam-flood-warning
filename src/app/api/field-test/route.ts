import { fieldTestAlert, fieldTestQuestions } from "@/lib/field-test";
import { requireOfficer } from "@/lib/session";
import { fieldTests } from "@/lib/store";

/** Saves one anonymous answer sheet (no names, no phone numbers). */
export async function POST(request: Request) {
  const body = (await request.json()) as { answers?: Record<string, string>; ageGroup?: string; gender?: string; canRead?: string; area?: string };
  if (!body.answers || typeof body.answers !== "object") return Response.json({ error: "answers required" }, { status: 400 });
  const clean = Object.fromEntries(Object.entries(body.answers).map(([k, v]) => [k.slice(0, 20), String(v).slice(0, 80)]));
  fieldTests.add({ at: new Date().toISOString(), answers: clean, ageGroup: body.ageGroup?.slice(0, 20), gender: body.gender?.slice(0, 20), canRead: body.canRead?.slice(0, 20), area: body.area?.slice(0, 40) });
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
    const rows = all.map((a) => [a.at, a.area, a.ageGroup, a.gender, a.canRead, ...qs.map((q) => a.answers[q.id])].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    return new Response("\uFEFF" + [cols.join(","), ...rows].join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=agam-field-test.csv" } });
  }
  return Response.json({
    total: all.length,
    understoodAll: understood,
    perQuestion: scored.map((q) => ({ id: q.id, correct: all.filter((a) => a.answers[q.id] === q.correct).length })),
  });
}
