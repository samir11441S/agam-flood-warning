import { cookies, headers } from "next/headers";
import { audit, DEMO_PIN, loginAllowed, officers, recordLogin, signSession } from "@/lib/officers";
import { currentOfficer, SESSION_COOKIE } from "@/lib/session";

export async function GET() {
  return Response.json({ officer: await currentOfficer(), demoMode: officers.demoMode(), demoPin: officers.demoMode() ? DEMO_PIN : undefined });
}

export async function POST(request: Request) {
  const { pin } = (await request.json()) as { pin?: string };
  const key = (await headers()).get("x-forwarded-for") ?? "local";
  if (!loginAllowed(key)) return Response.json({ error: "Too many wrong PINs. Try again in 10 minutes." }, { status: 429 });
  const officer = pin ? officers.verifyPin(pin) : null;
  recordLogin(key, Boolean(officer));
  if (!officer) return Response.json({ error: "Wrong PIN." }, { status: 401 });
  (await cookies()).set(SESSION_COOKIE, signSession(officer), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: 12 * 3600, path: "/" });
  audit.add({ who: officer.name, action: "signed in" });
  return Response.json({ officer });
}

export async function DELETE() {
  const officer = await currentOfficer();
  (await cookies()).delete(SESSION_COOKIE);
  if (officer) audit.add({ who: officer.name, action: "signed out" });
  return Response.json({ ok: true });
}
