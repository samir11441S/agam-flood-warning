// Small helpers for route handlers: malformed input gets a clear 400 instead of a crash (500).

/** Parses a JSON object body. Returns null for invalid JSON or anything that is not a plain object. */
export async function jsonBody<T extends Record<string, unknown>>(request: Request): Promise<Partial<T> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Partial<T>) : null;
  } catch {
    return null;
  }
}

export const badRequest = (error = "Invalid request body.") => Response.json({ error }, { status: 400 });

/** A string field, trimmed and length-capped; anything else becomes undefined. */
export const str = (v: unknown, max = 200): string | undefined => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
