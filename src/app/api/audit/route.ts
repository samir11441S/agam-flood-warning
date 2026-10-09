import { audit } from "@/lib/officers";
import { requireOfficer } from "@/lib/session";

export async function GET() {
  const officer = await requireOfficer();
  if (officer instanceof Response) return officer;
  return Response.json({ entries: audit.recent(100) });
}
