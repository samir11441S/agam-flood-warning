import type { NextRequest } from "next/server";
import { areaById } from "@/lib/data";
import { audit } from "@/lib/officers";
import { requireOfficer } from "@/lib/session";
import { reports } from "@/lib/store";

/** Recent "water rising" reports for an area (last 24 h), from Telegram, SMS or logged by officers. */
export async function GET(request: NextRequest) {
  const areaId = request.nextUrl.searchParams.get("areaId") ?? "";
  if (!areaById[areaId]) return Response.json({ error: "Unknown area" }, { status: 400 });
  return Response.json({ reports: reports.recent(areaId, 24).map(({ name, at, source, note, location }) => ({ name, at, source, note, hasLocation: Boolean(location) })) });
}

/** An officer logs a report received by phone or from a volunteer. */
export async function POST(request: Request) {
  const officer = await requireOfficer();
  if (officer instanceof Response) return officer;
  const { areaId, from, note } = (await request.json()) as { areaId?: string; from?: string; note?: string };
  if (!areaId || !areaById[areaId] || !from?.trim()) return Response.json({ error: "areaId and who reported it are required" }, { status: 400 });
  reports.add({ areaId, name: from.trim().slice(0, 60), at: new Date().toISOString(), source: "volunteer", note: note?.slice(0, 200) });
  audit.add({ who: officer.name, action: "logged a 'water rising' report", areaId, detail: `${from}${note ? ` — ${note}` : ""}` });
  return Response.json({ ok: true });
}
