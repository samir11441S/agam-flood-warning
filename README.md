# আগাম · Agam — flash-flood warnings that reach every household in time

**Idea to Unicorn · ClimateSphere AI → Climate Shield (climate risk prediction & disaster early warning)** · Team **Quantum Builders**

**Live demo:** https://agam-flood-warning.vercel.app — open a flood replay and press ▶ Play. To draft and approve an alert, click **Officer sign in** (demo PIN `0000`; demo mode never sends to real phones). **Code:** https://github.com/samir11441S/agam-flood-warning

In August 2024, record rain in the hills of Tripura (India) sent flash floods into Feni, Cumilla and Noakhali. Every major weather model forecast missed that rain one to two days ahead. But the rain *was* visible in observations — hours to a day before the water crossed the border.

Agam:

1. **Watches rain upstream, across the border, every hour**: 15 rain points in Tripura, Meghalaya, Assam, West Bengal and the Chittagong hills, plus 24 flood-prone upazilas, 9 river points and 4 river mouths (tides).
2. **Judges it against local history.** Each location's thresholds come from 30 years of rainfall, 40 years of river flow and 2.5 years of tides ("rain this heavy happens once every 2 / 5 years *here*"). Residents' "water rising" reports count as evidence too.
3. **Turns risk into action — safely.** Claude writes a plain-Bangla SMS, a voice-call script, a loudspeaker announcement and an English summary for officials. Seven automatic checks verify every draft; a signed-in officer (or two, for Danger) approves it — from the dashboard, by SMS reply or by Telegram. At night, unanswered alerts escalate to the next officer.
4. **Reaches everyone, most vulnerable first.** Voice calls and SMS to every registered phone (retried, then a backup number), volunteer door-knock lists for homes without a phone, loudspeaker scripts for mosques and CPP volunteers, and "safe / need help" replies from **any phone**: reply to the SMS with `1` or `2`, press 1 or 2 during the voice call, or tap a Telegram button. Help requests go straight to the area's volunteers and onto the rescue list.

> Prototype for research and demonstration — not an official warning service. Household data in the demo is synthetic.

---

## Run it on your computer (Windows)

You need **Node.js 20 or newer** ([nodejs.org](https://nodejs.org), LTS version). Open a terminal in this `agam` folder and run:

```bash
npm install
```

```bash
npm run dev
```

Then open **http://localhost:3000** in your browser. That's it — the four flood replays work without any keys.

To draft and send alerts, click **Officer sign in**. With no officers configured Agam runs in **DEMO MODE**: the PIN is `0000` and nothing can ever be sent to a real phone.

### Optional: let Claude write the alerts

Without a key, Agam uses its built-in verified Bangla templates. To have Claude write the alerts:

1. Create an API key at [console.anthropic.com](https://console.anthropic.com).
2. Copy the file `.env.example` to `.env.local`.
3. Paste your key after `ANTHROPIC_API_KEY=` in `.env.local` (never share this file or put it on GitHub).
4. Stop the dev server (Ctrl+C) and run `npm run dev` again.

### Optional: real phone alerts with replies (Telegram)

This lets judges scan a QR code, receive the alert on their own phone, and answer **"✅ আমি নিরাপদ" (I'm safe)** or **"🆘 সাহায্য দরকার" (Need help)**. Pressing "Need help" asks for their location, which appears as a red pin on the dashboard map.

1. In Telegram, open **@BotFather**, send `/newbot`, and pick a name (for example *Agam Flood Alert*) and a username ending in `bot`.
2. BotFather replies with a **token**. Paste it after `TELEGRAM_BOT_TOKEN=` in `.env.local`.
3. Restart `npm run dev`, then open a **second** terminal in the `agam` folder and run:

```bash
npm run worker
```

4. Open an area in the dashboard: a QR code appears. Scan it with your phone → Telegram opens → press **Start**. You're subscribed.
5. Draft the alert → **Approve & send**. Your phone receives it within a second. Tap a button and watch the dashboard update.

Keep both terminals running during the demo. The worker also runs escalation, call retries and automatic detection (see *Running Agam for real*).

### Sending to real phones (SMS, voice calls, volunteers, loudspeakers)

When an officer presses **Approve & send**, Agam sends through five channels, and the **Outbox** shows each one as **LIVE** (really sent), **TEST** (no provider configured, so nothing left the computer) or **SIMULATED** (demo households, no real numbers):

| Channel | Who | Needs |
|---|---|---|
| Bangla voice call | Every household with a phone, including people who can't read | `VOICE_API_URL` (IVR provider) + uploaded household list |
| Bangla SMS | Every household with a phone | `SMS_API_URL` (any Bangladeshi bulk-SMS gateway) or Twilio + uploaded household list |
| Volunteer door-knock lists | Volunteers; each gets the homes without phones to visit | SMS provider + contacts list |
| Loudspeaker announcement | Imams / temple / CPP announcers, who read it aloud | SMS provider + contacts list |
| Telegram | Smartphone users who scanned the QR code | `TELEGRAM_BOT_TOKEN` |

1. Open an area → **Recipients for this area** → download the templates → fill them in (Excel → *Save as CSV UTF-8*) → upload. Phone numbers must be Bangladeshi mobile numbers (`01XXXXXXXXX`).
2. Get an account with an SMS / voice (IVR) provider, and put its send-URL in `.env.local` (see `.env.example`).
3. Restart the app. The Outbox now shows **LIVE**.

**Only collect phone numbers with people's consent**, and keep the lists on the union's own computer. `.agam-data/` is never uploaded to GitHub.

### Voice playback

The ▶ Play button uses the browser's built-in Bangla voice. **Microsoft Edge** on Windows has one ("Nabanita"/"Pradeep"). Chrome on Android also works.

---

## Running Agam for real (a pilot)

### 1. Officers, PINs and the two-person rule

```bash
npm run officers -- add "Rahim Uddin" 4821 01711000000
```

Adds an officer (name, 4–8 digit PIN, mobile for SMS approvals). The first officer becomes admin and **demo mode switches off**: real sending becomes possible and the demo PIN stops working. Every sign-in, draft, approval, upload and send is written to the **Activity log**.

```bash
npm run officers -- set twoPersonDanger true
```

Danger alerts then need two different officers. Other settings: `escalateAfterMin` (default 15), `autoSendDangerAfterMin` (default 45, or `off`), `autoDetect` (default true). `npm run officers` lists everything. To approve from Telegram, an officer sends `/officer <PIN>` to the bot once.

### 2. The background worker (keep it running)

```bash
npm run worker
```

- Every 15 min it checks live risk and **drafts alerts by itself** at Warning / Danger.
- It asks officer #1 to approve (SMS "reply 1 4821" + Telegram buttons), **escalates to the next officer** every 15 min, and, for Danger only, sends the verified template automatically after 45 min if nobody answers.
- It retries unanswered voice calls after 10 min, then calls the backup number, then sends the home to a volunteer.
- It runs the Telegram bot.

Rehearse without a real flood: `npm run worker -- --test-alert parshuram`.

### 3. Webhooks for your SMS / voice provider

Set `INBOUND_SECRET` in `.env.local`, then give your provider these URLs:

- **Incoming SMS** (officer approvals "1 4821" / "2 4821", residents' answers "1" = safe / "2" = need help, "PANI <area>" reports): `https://<your-site>/api/sms/inbound?secret=<INBOUND_SECRET>&from={sender}&text={message}`
- **Call status and keypad** (retries; the call ends with "press 1 if you are safe, 2 if you need help"): `https://<your-site>/api/voice/status?secret=<INBOUND_SECRET>&to={number}&status={answered|no-answer}&digits={key}`

A resident's reply is matched to their household on the uploaded list (or its backup number) and the latest alert sent to their area in the last 72 h. "Need help" is texted at once to every volunteer on the area's contact list, with the household's name, village and number. Check it with `npm run test:replies`.

### 4. Official warnings, reports and field tests

- On each area, officers record today's **official FFWC / BMD status**. Agam warns when its advisory level is higher, and every message is sent in the local committee's name.
- **Rising-water reports** come from Telegram (🌊), SMS (`PANI <area>`) or are logged by officers. Reports from 3 different people in 6 h raise the level to Warning.
- **`/field-test`** is a phone page to test whether residents understand the alert (see [docs/FIELD-TEST.md](docs/FIELD-TEST.md)).

### 5. Hosting (keeps data, runs the worker)

On any server with Docker:

```bash
docker compose up -d --build
```

This builds the app, runs the web server **and** the worker, and keeps lists, alerts and the audit log in a persistent volume. Put your keys in `.env.local` first. (Vercel works for the dashboard demo, but cannot keep data or run the worker.)

### 6. Weather-data licence

Open-Meteo's free API is for **non-commercial** use. If Agam is paid for, buy an Open-Meteo API plan and set `OPEN_METEO_API_KEY`; requests then use the commercial servers automatically.

## The demo video

The competition video is rendered automatically from the real app: `video/out/agam-demo.mp4` (1920×1080, ~4:50), plus `video/out/agam-demo.srt` captions to upload to YouTube.

To re-render it after a change (keep `npm run dev` running in another terminal):

```bash
npm run video
```

- **Team names:** edit `video/team.json` (team name, members, roles, demo and GitHub links), then re-render. Members still named `[Name]` are left out of the video. Team photos and the logo go in `video/team/` (kept out of git, so faces are not published in the repo).
- **Your own voice (recommended — judges like hearing the team):** record one audio file per scene and save it as `video/voice/<scene-id>.mp3` (or `.wav`). The scene ids are `01-title` … `13-cta`, and the exact narration for each is printed in the captions file. Re-render, and your recordings replace the computer voice automatically.
- **Upload:** YouTube → *Unlisted* (or Public) → upload `agam-demo.mp4`, then *Subtitles → Upload file → With timing* → `agam-demo.srt`. Never set it to Private; the platform marks Private videos as failed.

## Put it online (free)

1. Push this folder to a GitHub repository.
2. Go to [vercel.com](https://vercel.com), sign in with GitHub and choose **Add New → Project** → pick the repo → **Deploy**.
3. (Optional) Under **Settings → Environment Variables**, add `ANTHROPIC_API_KEY`, then redeploy.

Or from this folder with the Vercel CLI: `vercel deploy --prod` (`vercel.json` tells Vercel it is a Next.js app). On Vercel, Agam stores its data in temporary server storage (`/tmp`), so it is right for the public demo but not for a real pilot — use Docker for that.

---

## What's inside

| Path | What it is |
|---|---|
| `src/lib/risk.ts` | The risk engine: upstream rain (24 h / 72 h / 5 days), local rain, forecast, river flow, tides and community reports → Normal / Watch / Warning / Danger |
| `src/lib/alerts.ts` | Alert facts, Bangla templates, loudspeaker script, volunteer SMS and the 7 safety checks |
| `src/lib/claude-alert.ts` | Claude writes the alert from verified facts; falls back to the template if any check fails |
| `src/lib/alert-flow.ts` | Draft → approve (1 or 2 officers) → send on every channel → outbox + audit log |
| `src/lib/escalation.ts` | Officer notification, escalation, SMS approvals, Danger auto-send policy |
| `src/lib/deliveries.ts` | Call retries → backup number → volunteer hand-off |
| `src/lib/officers.ts` | Officer accounts (hashed PINs), signed sessions, settings, audit log |
| `src/lib/channels.ts` | SMS / voice providers (any Bangladeshi HTTP gateway, or Twilio SMS); test mode by default |
| `src/lib/bot.ts` | Telegram bot: subscribe, safe / need-help replies, rising-water reports, officer approvals |
| `src/data/geo.json` | Areas, upstream stations, river and tide points, estimated travel times |
| `src/data/thresholds.json` | Local thresholds from history (`npm run calibrate`) |
| `src/data/replays/*.json` | Hourly replays: Feni 2024, Sylhet 2024, Jamuna 2024, Chattogram 2026 |
| `scripts/worker.mts` | Background worker (detection, escalation, retries, Telegram) |
| `mcp/server.mts` | MCP server, so any AI agent can ask Agam for flood risk |
| `docs/` | Submission, pitch, presentation, evaluation, data provenance, prompts, business, outreach, field test |

### Useful commands

```bash
npm run calibrate
```

Recomputes thresholds from history (takes ~15 minutes because of free-API rate limits).

```bash
npm run replays
```

Rebuilds the flood replays.

```bash
npm run backtest
```

Runs the 30-year backtest and writes `docs/EVALUATION-results.md`.

```bash
npm run mcp
```

Starts the MCP server (stdio).

```bash
npm run replay-report -- feni-2024 --steps
```

Prints the alert level per area every 6 hours of a replay.
