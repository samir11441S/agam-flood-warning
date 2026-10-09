import type { NextRequest } from "next/server";
import { areaById } from "@/lib/data";
import { audit } from "@/lib/officers";
import { requireOfficer } from "@/lib/session";
import { official } from "@/lib/store";

const LABEL = ["no warning / normal", "watch", "warning", "danger"];

export async function GET(request: NextRequest) {
  const areaId = request.nextUrl.searchParams.get("areaId") ?? "";
  return Response.json({ status: official.get(areaId) });
}

/** An officer records the official status from the FFWC / BMD bulletin. */
export async function POST(request: Request) {
  const officer = await requireOfficer();
  if (officer instanceof Response) return officer;
  const { areaId, level, source, note } = (await request.json()) as { areaId?: string; level?: number; source?: string; note?: string };
  if (!areaId || !areaById[areaId] || ![0, 1, 2, 3].includes(Number(level))) return Response.json({ error: "areaId and level 0–3 required" }, { status: 400 });
  official.set(areaId, { level: Number(level) as 0 | 1 | 2 | 3, source: source || "FFWC / BMD bulletin", note, by: officer.name, at: new Date().toISOString() });
  audit.add({ who: officer.name, action: `recorded official status: ${LABEL[Number(level)]}`, areaId, detail: [source, note].filter(Boolean).join(" — ") });
  return Response.json({ status: official.get(areaId) });
}
