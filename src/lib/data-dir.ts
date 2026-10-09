import path from "node:path";

/**
 * Where Agam keeps alerts, lists, officers and the audit log.
 * On Vercel only /tmp is writable, and it is temporary (per server instance) — fine for the public demo,
 * which runs in demo mode. A real deployment uses a server with a persistent disk (see docker-compose.yml).
 */
export const DATA_DIR = process.env.AGAM_DATA_DIR || (process.env.VERCEL ? path.join("/tmp", "agam-data") : path.join(process.cwd(), ".agam-data"));
