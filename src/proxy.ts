import { NextResponse, type NextRequest } from "next/server";

/** Provider webhooks are called server-to-server and authenticate with INBOUND_SECRET instead. */
const WEBHOOKS = ["/api/sms/inbound", "/api/voice/status"];
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
/** Largest accepted API body. A union's household list (5,000 homes) is well under 1 MB. */
const MAX_BODY_BYTES = 3 * 1024 * 1024;

const deny = (status: number, error: string) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Runs before every API request:
 *  • blocks cross-site state-changing requests (CSRF) — a page on another site cannot make an officer's
 *    browser approve or reject an alert, upload lists or sign in;
 *  • refuses oversized bodies before they reach a route.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (SAFE_METHODS.has(request.method) || WEBHOOKS.some((w) => pathname.startsWith(w))) return NextResponse.next();

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return deny(413, "Request too large.");

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (origin) {
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (!host || originHost !== host) return deny(403, "Cross-site request blocked.");
  } else if (site && site !== "same-origin" && site !== "none") {
    return deny(403, "Cross-site request blocked.");
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
