import "server-only";
import { cookies } from "next/headers";
import { verifySession, type PublicOfficer } from "./officers";

export const SESSION_COOKIE = "agam_session";

export async function currentOfficer(): Promise<PublicOfficer | null> {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Returns the signed-in officer, or a 401 response to send back. */
export async function requireOfficer(): Promise<PublicOfficer | Response> {
  return (await currentOfficer()) ?? Response.json({ error: "Please sign in as an officer first." }, { status: 401 });
}
