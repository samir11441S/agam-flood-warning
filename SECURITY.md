# Security

Agam sends flood warnings that people act on, so the main threats are: someone sending a fake alert, someone **suppressing** a real one, leaking residents' phone numbers, or the system silently failing during a flood. This page lists the controls in place and how to report a problem.

## Reporting a vulnerability

Please use **GitHub → Security → Report a vulnerability** on this repository (private advisory). Do not open a public issue. We aim to reply within 3 days. `/.well-known/security.txt` points to the same place.

## Controls

### Who can send or stop an alert
- **Officers sign in with a 6–8 digit PIN** (hashed with scrypt, unique per officer). Wrong PINs are limited per client and in total (sign-in pauses after 20 wrong PINs in an hour, and the pause is logged). The limits are stored on disk, so they hold across processes and restarts.
- **Sessions** are HMAC-signed, expire after 12 hours, stop working as soon as an officer is removed, and live in an `httpOnly`, `SameSite=Strict`, `Secure`, `__Host-` cookie.
- **SMS approvals** need the officer's registered number *and* the alert's 6-digit code; 5 wrong codes per phone per hour pause SMS approval for that phone.
- **Telegram approvals** are linked with a one-time 8-digit code from the dashboard (valid 10 minutes, single use, private chats only, 5 tries per chat per hour). PINs are never sent to Telegram, and approve/reject buttons only work for the linked officer in their own chat.
- **One locked write per approval**: an alert can never be sent twice, even if two officers approve at the same moment or the Danger auto-send fires at the same time.
- Optional **two-person rule** for Danger. Every sign-in, draft, approval, rejection, upload and send is in the audit log.
- **Demo mode** (no officers configured) can never send to a real phone.

### Web application
- **Security headers** on every response: Content-Security-Policy (only this site, plus OpenStreetMap tiles; no framing, no plugins, no foreign form targets), HSTS, `X-Frame-Options: DENY`, `nosniff`, a strict Referrer-Policy and Permissions-Policy, COOP/CORP. `X-Powered-By` is removed.
- **CSRF protection** (`src/proxy.ts`): state-changing API requests from another site are rejected (Origin / Sec-Fetch-Site check), on top of the `SameSite=Strict` cookie.
- **Input handling**: request bodies are size-limited (3 MB) and parsed defensively (bad JSON → 400, not a crash); every field is type-checked and length-capped; lookup tables have no prototype, so ids like `__proto__` match nothing.
- **API responses are never cached** (`Cache-Control: no-store`).
- **Public endpoints**: risk levels are read-only; the anonymous field-test form is rate-limited (per client and per day); the CSV export neutralises spreadsheet formulas (CSV injection).
- **Webhooks** (incoming SMS, call status) require `INBOUND_SECRET`, compared in constant time; providers can send it as an `x-agam-secret` header instead of in the URL.

### AI
- The AI never decides the alert level and never sends anything; an officer approves every message (or the verified template — never AI text — goes out under the opt-in Danger auto-send).
- Every draft passes 7 automatic checks (right level *and* matching action, no invented numbers including in the English summary, etc.) or the verified template is used.
- No personal data and no resident free text is sent to the model (limits prompt injection).
- **Spending guard**: AI calls are capped per hour (`AI_CALLS_PER_HOUR`, default 40) and identical facts reuse the earlier verified draft, so a public demo cannot run up the API bill.

### Data
- Demo households are synthetic. Real household lists need recorded consent (rows without it are skipped), are visible only to signed-in officers, can be deleted per area, and stay on the committee's own server (`.agam-data/`, never committed).
- Writes from the web server and the background worker go through a cross-process file lock, so concurrent updates are never lost.
- Secrets live only in environment variables (`.env.local` is git-ignored). The session key is generated automatically if `AGAM_SECRET` is not set — **set `AGAM_SECRET` on any multi-instance host** (e.g. Vercel) so sessions work on every instance.

### Reliability
- If live rain data stops for 30 minutes, every officer is told to use the official FFWC/BMD bulletin until it returns.
- If the AI is down, refuses, or fails a check, the verified template is used — alerts never depend on AI uptime.

### Dependencies
`npm audit --omit=dev` reports **0 vulnerabilities** in production dependencies. A known advisory in `braces` (pulled in by the ESLint config) affects build-time linting only and is not shipped.

## Tests

`npm test` runs both suites, including attacks on the controls above: PIN, SMS-code and Telegram-link guessing, cross-site requests, double approvals, concurrent writes from several processes, wrong-instruction AI drafts and CSV injection.
