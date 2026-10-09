import type { NextRequest } from "next/server";
import { areaById } from "@/lib/data";
import { parseHouseholdCsv } from "@/lib/households";
import { audit } from "@/lib/officers";
import { requireOfficer } from "@/lib/session";
import { areaLists, type Contact } from "@/lib/store";

export async function GET(request: NextRequest) {
  const officer = await requireOfficer();
  if (officer instanceof Response) return officer;
  const areaId = request.nextUrl.searchParams.get("areaId") ?? "";
  if (!areaById[areaId]) return Response.json({ error: "Unknown area" }, { status: 400 });
  const households = areaLists.households(areaId);
  const uploadedAt = areaLists.uploadedAt(areaId);
  const stale = uploadedAt ? Date.now() - Date.parse(uploadedAt) > 365 * 86400_000 : false;
  return Response.json({ households: households?.length ?? 0, withPhone: households?.filter((h) => h.phoneNumber).length ?? 0, contacts: areaLists.contacts(areaId).map(({ name, role }) => ({ name, role })), uploadedAt, stale });
}

/** Body: { areaId, kind: "households" | "contacts", csv }. Contacts CSV columns: name,phone,role (volunteer|announcer). */
export async function POST(request: Request) {
  const officer = await requireOfficer();
  if (officer instanceof Response) return officer;
  const { areaId, kind, csv } = (await request.json()) as { areaId?: string; kind?: string; csv?: string };
  if (!areaId || !areaById[areaId] || !csv) return Response.json({ error: "areaId and csv are required" }, { status: 400 });
  if (kind === "households") {
    const { households, errors } = parseHouseholdCsv(areaId, csv);
    if (!households.length) return Response.json({ error: errors[0] ?? "No rows found", errors }, { status: 400 });
    areaLists.setHouseholds(areaId, households);
    audit.add({ who: officer.name, action: "uploaded household list", areaId, detail: `${households.length} households, ${errors.length} rows skipped` });
    return Response.json({ saved: households.length, withPhone: households.filter((h) => h.phoneNumber).length, errors });
  }
  if (kind === "contacts") {
    const rows = csv.replace(/^\uFEFF/, "").split(/\r?\n/).slice(1).filter((l) => l.trim());
    const contacts: Contact[] = [];
    const errors: string[] = [];
    rows.forEach((line, i) => {
      const [name, rawPhone, role] = line.split(",").map((x) => x.trim());
      const m = (rawPhone ?? "").replace(/[\s-]/g, "").match(/^(?:\+?88)?(01[3-9]\d{8})$/);
      if (!m) return errors.push(`Row ${i + 2}: invalid phone`);
      contacts.push({ name: name || "—", phone: "+88" + m[1], role: role?.toLowerCase().startsWith("ann") ? "announcer" : "volunteer" });
    });
    areaLists.setContacts(areaId, contacts);
    audit.add({ who: officer.name, action: "uploaded contacts list", areaId, detail: `${contacts.length} contacts` });
    return Response.json({ saved: contacts.length, errors });
  }
  return Response.json({ error: "kind must be households or contacts" }, { status: 400 });
}

/** Deletes all personal data held for an area. */
export async function DELETE(request: NextRequest) {
  const officer = await requireOfficer();
  if (officer instanceof Response) return officer;
  const areaId = request.nextUrl.searchParams.get("areaId") ?? "";
  if (!areaById[areaId]) return Response.json({ error: "Unknown area" }, { status: 400 });
  areaLists.clear(areaId);
  audit.add({ who: officer.name, action: "deleted household and contact lists", areaId });
  return Response.json({ ok: true });
}
