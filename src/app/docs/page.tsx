import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import geo from "@/data/geo.json";
import DocsLive from "@/components/DocsLive";
import { SYSTEM_PROMPT } from "@/lib/ai-writer";
import backtest from "../../../docs/evaluation-summary.json";

export const metadata: Metadata = {
  title: "Agam — docs: pitch, whitepaper and system status",
  description: "How Agam predicts cross-border flash floods in Bangladesh and gets verified Bangla warnings to every household: problem, architecture, AI design, evaluation, responsible AI, business model and live system status.",
};

const REPO = "https://github.com/samir11441S/agam-flood-warning";
const VIDEO = "https://youtu.be/KXjjIIxUnno";

const NAV = [
  ["overview", "Overview"],
  ["status", "Live system"],
  ["problem", "Problem"],
  ["solution", "How it works"],
  ["architecture", "Architecture"],
  ["ai", "AI design"],
  ["evaluation", "Evaluation"],
  ["responsible", "Responsible AI"],
  ["data", "Data"],
  ["business", "Business"],
  ["scale", "Scale & MCP"],
  ["team", "Team & roadmap"],
  ["judging", "For judges"],
] as const;

const CHECKS = [
  "Alert level stated in SMS and voice call, with the action that matches it (and no false reassurance)",
  "Area named correctly in both",
  "No numbers that are not in the verified facts — including the English summary for officials",
  "SMS fits 3 Bangla SMS parts (≤ 200 characters)",
  "Emergency number 999 included for Warning and Danger",
  "Action checklist has at least 3 items",
  "Voice call names the sender — the local disaster committee",
];

function Section({ id, title, kicker, children }: { id: string; title: string; kicker?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-stone-200 py-10">
      {kicker && <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">{kicker}</p>}
      <h2 className="mb-4 text-2xl font-bold tracking-tight">{title}</h2>
      <div className="space-y-4 leading-relaxed text-stone-700">{children}</div>
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-stone-100 text-stone-600">
          <tr>{head.map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-stone-100 align-top">
              {r.map((c, j) => <td key={j} className="px-3 py-2">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="text-3xl font-bold tracking-tight text-stone-900">{value}</div>
      <div className="mt-1 text-sm text-stone-500">{label}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <h3 className="mb-1.5 font-semibold text-stone-900">{title}</h3>
      <div className="space-y-2 text-sm leading-relaxed text-stone-600">{children}</div>
    </div>
  );
}

function Flow({ steps }: { steps: { title: string; body: string }[] }) {
  return (
    <ol className="grid gap-2 md:grid-cols-5">
      {steps.map((s, i) => (
        <li key={s.title} className="relative rounded-xl border border-stone-200 bg-white p-3 text-sm">
          <span className="text-xs font-semibold text-stone-400">{i + 1}</span>
          <p className="font-semibold text-stone-900">{s.title}</p>
          <p className="mt-1 text-stone-600">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

export default function DocsPage() {
  const pct = Math.round((backtest.onTime / backtest.events) * 100);
  return (
    <div className="min-h-dvh bg-stone-50 text-stone-900">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="text-lg font-bold tracking-tight">
            <span lang="bn">আগাম</span> <span className="text-stone-400">Agam</span> <span className="text-sm font-normal text-stone-400">/ docs</span>
          </Link>
          <Link href="/" className="rounded-full bg-stone-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-stone-700">Open the live app →</Link>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-2 text-sm [scrollbar-width:none]">
          {NAV.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="shrink-0 rounded-full px-2.5 py-1 text-stone-600 hover:bg-stone-100 hover:text-stone-900">{label}</a>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4">
        {/* Overview */}
        <section id="overview" className="scroll-mt-24 py-10">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">International AI Builders Congress 2026 · Idea to Unicorn · ClimateSphere AI → Climate Shield · Team Quantum Builders</p>
          <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight md:text-5xl">Flash-flood warnings that reach every household in time.</h1>
          <p className="mt-4 max-w-3xl text-lg text-stone-600">
            In August 2024, record rain in Tripura sent flash floods into Feni, Cumilla and Noakhali within hours — 5.8 million people affected, 71 dead, and no forecast of a flood that severe.
            The rain <em>was</em> visible across the border hours before the water came. Agam watches it every hour, judges it against each location&apos;s own 30-year history, and turns risk into verified,
            plain-Bangla voice calls and SMS that a local officer approves — reaching the most vulnerable first.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            <Link href="/" className="rounded-full bg-stone-900 px-4 py-2 font-semibold text-white hover:bg-stone-700">▶ Live demo (Feni replay)</Link>
            <a href={VIDEO} className="rounded-full border border-stone-300 bg-white px-4 py-2 hover:bg-stone-100">3-minute video</a>
            <a href={REPO} className="rounded-full border border-stone-300 bg-white px-4 py-2 hover:bg-stone-100">Source code (GitHub)</a>
            <Link href="/field-test" className="rounded-full border border-stone-300 bg-white px-4 py-2 hover:bg-stone-100">Field-test page</Link>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat value={geo.stations.length} label="upstream rain points across the border, checked hourly" />
            <Stat value={geo.areas.length} label="flood-prone upazilas monitored" />
            <Stat value={`${backtest.onTime}/${backtest.events}`} label={`documented area-floods with Danger on or before onset (${backtest.years}-yr backtest)`} />
            <Stat value={backtest.medianDangerEpisodesPerYear} label="median Danger episodes per area per year — no alarm fatigue" />
          </div>
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Prototype for research and demonstration — not an official warning service. Demo households are synthetic, and demo mode can never send to a real phone (officer PIN <code>0000</code>).
          </p>
        </section>

        <Section id="status" title="Live system status" kicker="System dashboard">
          <p>These cards call Agam&apos;s own risk API from your browser right now: the same engine the dashboard, the background worker and the MCP server use.</p>
          <DocsLive />
        </Section>

        <Section id="problem" title="The problem" kicker="Why this matters">
          <div className="grid gap-3 md:grid-cols-3">
            <Card title="Floods arrive in hours">Water from Tripura reached Feni in 5–8 hours in August 2024 (FFWC staff, Prothom Alo). Upstream rain data from India is shared irregularly.</Card>
            <Card title="Forecasts missed it">We checked four global models as issued. One day ahead they predicted 24–35 mm at Udaipur, Tripura for 20 Aug; ECMWF&apos;s own analysis showed 176 mm.</Card>
            <Card title="Warnings don&apos;t reach the last household">Existing warnings are technical (water levels in metres), in standard Bangla, and spread by TV and word of mouth. The elderly, disabled, phone-less and people on chars hear last.</Card>
          </div>
          <p>
            FFWC and Google Flood Hub forecast major rivers well, with days of lead time. Small flashy cross-border rivers — Muhuri, Gumti, Khowai, Someshwari — are not resolved by global models, and no existing tool turns a
            warning into a prioritised, household-level outreach plan.
          </p>
        </Section>

        <Section id="solution" title="How Agam works" kicker="Solution">
          <Flow
            steps={[
              { title: "Watch upstream", body: `${geo.stations.length} rain points in Tripura, Meghalaya, Assam, West Bengal and the Chittagong hills, plus local rain, 9 river points and 4 river mouths (tides) — every hour.` },
              { title: "Judge against local history", body: "2/5/10-year levels per location from 30 yrs of rain, 40 yrs of river flow, 2.5 yrs of tides. Residents' “water rising” reports count too." },
              { title: "Explain the risk", body: "Normal / Watch / Warning / Danger, with the evidence, the estimated arrival time and today's official FFWC/BMD status." },
              { title: "Write & verify the alert", body: "An AI model (free Google Gemini by default) writes a plain-Bangla SMS, voice call and loudspeaker script from verified facts; 7 automatic checks; an officer approves (two for Danger)." },
              { title: "Reach everyone", body: "Voice calls + SMS (retry → backup number), volunteer door-knocks for homes without a phone, mosque/CPP loudspeakers. Residents reply “1 safe / 2 need help”." },
            ]}
          />
        </Section>

        <Section id="architecture" title="Architecture" kicker="Technical whitepaper">
          <div className="grid gap-3 md:grid-cols-2">
            <Card title="Input → processing → output">
              <p><b>Inputs:</b> Open-Meteo live rain, river (GloFAS) and tide; precomputed thresholds; area/station graph with travel times; residents&apos; reports via Telegram and SMS.</p>
              <p><b>Processing:</b> a transparent rule-based risk engine (<code>src/lib/risk.ts</code>) compares rolling 24 h / 72 h / 5-day totals against each location&apos;s return levels, with a per-location bias factor between datasets.</p>
              <p><b>Output:</b> a level per area with evidence → verified alert facts → AI-written Bangla messages → officer approval → five delivery channels → replies and rescue list.</p>
            </Card>
            <Card title="Components">
              <ul className="list-disc space-y-1 pl-5">
                <li><b>Web app</b> — Next.js 16 + React 19: map, replays, alert drafting, approval, outbox, uploads, audit log.</li>
                <li><b>Worker</b> (<code>scripts/worker.mts</code>) — detection every 15 min, escalation, call retries, Telegram bot.</li>
                <li><b>Channels</b> — any Bangladeshi SMS/IVR HTTP gateway or Twilio; Telegram; test mode by default.</li>
                <li><b>MCP server</b> (<code>mcp/server.mts</code>) — the engine as tools for any AI assistant.</li>
                <li><b>Hosting</b> — Vercel for the public demo; Docker Compose (web + worker + data volume) for pilots.</li>
              </ul>
            </Card>
          </div>
          <Table
            head={["Path", "What it is"]}
            rows={[
              [<code key="p">src/lib/risk.ts</code>, "Risk engine: upstream rain, local rain, forecast, river flow, tides and community reports → level"],
              [<code key="p">src/lib/alerts.ts</code>, "Alert facts, Bangla templates, loudspeaker script, volunteer SMS and the 7 safety checks"],
              [<code key="p">src/lib/ai-writer.ts</code>, "AI writes the alert from verified facts (Gemini free tier → Groq free tier → optional Claude); falls back to the template if any check fails"],
              [<code key="p">src/lib/alert-flow.ts</code>, "Draft → approve (1 or 2 officers) → send on every channel → outbox + audit log"],
              [<code key="p">src/lib/escalation.ts</code>, "Officer notification, escalation, SMS approvals, Danger auto-send policy"],
              [<code key="p">src/lib/deliveries.ts</code>, "Call retries → backup number → volunteer hand-off"],
            ]}
          />
        </Section>

        <Section id="ai" title="AI design" kicker="Where AI is used — and where it is not">
          <div className="grid gap-3 md:grid-cols-3">
            <Card title="Rules decide the risk">The alert level comes from a transparent engine with thresholds derived from data. No LLM decides whether people evacuate, so every level can be explained and audited.</Card>
            <Card title="AI writes the words — on free APIs">Google Gemini (free tier: Flash-Lite, then Flash) writes the SMS, a 60–100 word voice script, an optional dialect version, a checklist and an English summary in one structured-JSON call. If Gemini is rate-limited, Groq&apos;s free tier (gpt-oss-120b) takes over; Claude is an optional paid upgrade. Identical facts reuse the earlier verified draft, and calls are capped per hour.</Card>
            <Card title="Code verifies everything">Every draft passes 7 automatic checks or the verified template is used. The AI may only use numbers from an allow-list built from the facts. Agam works fully without an API key.</Card>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Card title="The 7 safety checks (validateAlert)">
              <ol className="list-decimal space-y-1 pl-5">{CHECKS.map((c) => <li key={c}>{c}</li>)}</ol>
            </Card>
            <Card title="Prompt design">
              <ul className="list-disc space-y-1 pl-5">
                <li>Role and context: who listens (rural, elderly, low-literacy) and why accuracy matters.</li>
                <li>Hard rules: only given facts; exact level word, area name and sender; 999 for Warning/Danger.</li>
                <li>One-shot grounding: the verified template is sent as a reference.</li>
                <li>Structured facts in (compact JSON), structured JSON out.</li>
                <li>Failure path: one retry, then the template, and the officer sees which check failed.</li>
              </ul>
            </Card>
          </div>
          <details className="rounded-xl border border-stone-200 bg-white p-4">
            <summary className="cursor-pointer font-semibold">System prompt used in production (read from the code)</summary>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-relaxed text-stone-700">{SYSTEM_PROMPT}</pre>
          </details>
        </Section>

        <Section id="evaluation" title="Evaluation" kicker="We report our misses as clearly as our hits">
          <h3 className="font-semibold text-stone-900">1. Did forecasts see the Feni 2024 rain? (Udaipur, Tripura, 20 Aug)</h3>
          <Table
            head={["Model", "Issued 1 day earlier", "Issued 2 days earlier", "Model's own analysis"]}
            rows={[
              ["ECMWF IFS 0.25°", "29 mm", "37 mm", "176 mm"],
              ["GFS", "35 mm", "14 mm", "15 mm"],
              ["DWD ICON", "24 mm", "15 mm", "27 mm"],
              ["JMA", "30 mm", "24 mm", "56 mm"],
              ["Open-Meteo best match", "24 mm", "15 mm", "197 mm"],
            ]}
          />
          <h3 className="pt-2 font-semibold text-stone-900">2. Honest hourly replays — only data that existed at each hour</h3>
          <Table
            head={["Replay", "First Watch", "First Warning", "First Danger", "Trigger"]}
            rows={[
              ["Feni, Aug 2024", "17 Aug 06:00", "17 Aug 18:00", "19 Aug 12:00 (Feni Sadar, Sonagazi)", "192 mm in 72 h at Belonia + spring tide at the river mouth"],
              ["", "", "", "20 Aug 12:00 (Parshuram, Fulgazi, …)", "172 mm in 24 h at Santirbazar (5-yr level 124 mm)"],
              ["Sylhet, Jun 2024", "13 Jun 18:00", "16 Jun 06:00", "18 Jun 18:00", "Extreme rain over Meghalaya; Surma above 5-yr flow"],
              ["Jamuna, Jul 2024", "30 Jun 24:00", "1 Jul 24:00", "3 Jul 24:00", "Brahmaputra–Jamuna above 5-yr flood flow"],
              ["Chattogram, Jul 2026", "5 Jul 06:00", "8 Jul 18:00", "10 Jul 06:00", "Partial miss — blocked sluices; now covered by residents' reports"],
            ]}
          />
          <h3 className="pt-2 font-semibold text-stone-900">3. {backtest.years}-year backtest ({backtest.period}, observations only)</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat value={`${backtest.onTime}/${backtest.events}`} label={`Danger on or before onset (${pct}%)`} />
            <Stat value={backtest.detected - backtest.onTime} label="more caught within 3 days after onset" />
            <Stat value={backtest.events - backtest.detected} label="missed — published with causes" />
            <Stat value={backtest.medianDangerEpisodesPerYear} label="median Danger episodes / area / year (upper bound on false alarms)" />
          </div>
          <p className="text-sm">
            Misses come from pre-monsoon flash floods over Meghalaya (ERA5&apos;s ~25 km grid under-represents orographic rain), a slow basin-wide 2007 Brahmaputra flood, and very local storms. Fixes: satellite rain (GPM IMERG),
            IMD/BMD gauges, more upstream points. Full method and tables: <a className="underline" href={`${REPO}/blob/main/docs/EVALUATION.md`}>EVALUATION.md</a>.
          </p>
          <p className="text-sm"><b>Next:</b> a 72-case run of the alert writer (24 areas × 3 levels) and resident comprehension tests with the <Link className="underline" href="/field-test">/field-test</Link> page (target ≥ 80% understand what, when, what to do and who sent it).</p>
        </Section>

        <Section id="responsible" title="Responsible AI, safety & privacy" kicker="Ethical AI compliance">
          <div className="grid gap-3 md:grid-cols-2">
            <Card title="Human in the loop">Nothing is sent without a signed-in officer&apos;s approval; optional two-person rule for Danger. The only exception is opt-in and Danger-only: after 45 minutes of escalation with no answer, the verified template — never AI text — is sent.</Card>
            <Card title="No hallucinated numbers">Every number in an AI draft must come from the verified facts. No resident free text reaches the model, so the prompt-injection surface is minimal.</Card>
            <Card title="Fairness & inclusion">Each area is judged against its own history, not one national threshold. Outreach is ordered most vulnerable first (elderly, disabled, pregnant, no phone); voice calls and loudspeakers reach people who cannot read. Dialect output is flagged experimental.</Card>
            <Card title="Privacy">Demo data is synthetic. Real household lists need recorded consent (rows without it are skipped), stay on the committee&apos;s server, are visible only to signed-in officers and are deleted after the pilot. No personal data is sent to the LLM. Field-test answers are anonymous.</Card>
            <Card title="Accountability & security">Hashed, unique PINs with guessing limits per device and in total; Telegram approvals linked by one-time codes (never PINs) and only from the officer&apos;s own chat; per-phone limits on SMS approval codes; one locked write per approval, so an alert can never be sent twice. Every sign-in, draft, approval, upload and send is in the audit log.</Card>
            <Card title="Fail-safe operations">If live rain data stops for 30 minutes, every officer is told to rely on the official bulletin until it returns. When the danger passes, officers send an all-clear (always the verified template) that tells residents it is safe to return and what to watch for.</Card>
            <Card title="Transparency">Prompts are published, misses are published, data limitations are documented, and every message is sent in the local committee&apos;s name. Agam supports official BMD/FFWC/DDM warnings; it does not replace them.</Card>
          </div>
        </Section>

        <Section id="data" title="Data & provenance" kicker="All open data">
          <Table
            head={["Data", "Source", "Used for"]}
            rows={[
              ["Daily rain 1994–2023 (ERA5)", "Open-Meteo Historical Weather API · Copernicus · CC BY 4.0", "Local 2/5/10-year thresholds for 39 points; 30-year backtest"],
              ["Daily river flow 1984–2023 (GloFAS v4)", "Open-Meteo Flood API · Copernicus · CC BY 4.0", "River thresholds for 9 points; replays"],
              ["Archived forecasts 2020–2023", "Open-Meteo Historical Forecast API", "Per-location bias factor between datasets"],
              ["Hourly analysis and forecasts as issued", "Open-Meteo Previous Runs API", "Honest hourly replays"],
              ["Sea level incl. tides, Jul 2023 – Dec 2025", "Open-Meteo Marine API", "Tide thresholds at 6 coastal areas"],
              ["Live rain, river and tide", "Open-Meteo Forecast, Flood and Marine APIs", "Live mode"],
              ["Residents' “water rising” reports", "Telegram, SMS “PANI <area>”, officers", "Community signal: 3 reporters in 6 h → Warning"],
              ["Map", "© OpenStreetMap contributors (ODbL)", "Background map"],
              ["Demo households", "Synthetic (src/lib/households.ts)", "Demo of prioritisation and dispatch only"],
            ]}
          />
          <p className="text-sm">Known limitations — coarse grids, estimated travel times, short tide record — are listed in <a className="underline" href={`${REPO}/blob/main/docs/DATA_PROVENANCE.md`}>DATA_PROVENANCE.md</a>.</p>
        </Section>

        <Section id="business" title="Business model & global readiness" kicker="Citizens never pay">
          <Table
            head={["Customer", "What they buy", "Why"]}
            rows={[
              ["NGOs / donors running anticipatory action", "Objective, auditable triggers per upazila + household outreach + delivery records", "They must justify releasing cash before a flood"],
              ["Union / Upazila Disaster Management Committees (via DDM, donor projects)", "Per-area subscription: dashboard, alerts, dispatch, audit log", "Turns a warning into documented action"],
              ["Microfinance institutions and insurers", "Early flood signals for borrowers' areas; parametric triggers", "Protect clients and portfolios"],
              ["Telecom operators", "Partnership: voice/SMS capacity, Cell Broadcast", "CSR + traffic"],
            ]}
          />
          <div className="grid gap-3 md:grid-cols-2">
            <Card title="Unit cost (assumptions to replace with real quotes)">About <b>Tk 50,000 per union per monsoon</b> (≈ Tk 10 per household) for 5,000 households — mostly SMS and voice calls. AI alert writing is under US$0.05 per alert. Pricing is a hypothesis to validate in the pilot.</Card>
            <Card title="Global by design">Every data source (ERA5, GloFAS, Open-Meteo forecasts) is global and free. A new region is a config entry in <code>geo.json</code> plus a ~15-minute calibration. The same cross-border flash-flood problem exists from Nepal into Bihar, Northeast India, Myanmar, Pakistan and East Africa.</Card>
          </div>
        </Section>

        <Section id="scale" title="Scalability, deployment & MCP" kicker="From demo to pilot">
          <div className="grid gap-3 md:grid-cols-3">
            <Card title="Cloud-ready">Public demo on Vercel. Pilots run with <code>docker compose up -d --build</code>: web server + worker + persistent data volume on any small server, shared by many unions.</Card>
            <Card title="Modular">Engine, alert writer, channels, escalation and bot are separate modules behind one engine; SMS/IVR providers are swappable HTTP gateways; the LLM is optional.</Card>
            <Card title="Open standards">Agam ships an MCP server (stdio) so any AI assistant can ask for verified flood risk instead of guessing.</Card>
          </div>
          <Table
            head={["MCP tool", "What it returns"]}
            rows={[
              [<code key="t">list_areas</code>, "Monitored upazilas, rivers, upstream stations (many in India) and travel times"],
              [<code key="t">get_flood_risk</code>, "Live or replayed level per area, with evidence and expected arrival window"],
              [<code key="t">draft_alert</code>, "Verified Bangla SMS, voice script and checklist + safety-check results (read-only: never sends)"],
            ]}
          />
          <pre className="overflow-x-auto rounded-xl bg-stone-900 p-4 text-xs text-stone-100">{`{
  "mcpServers": {
    "agam": { "command": "npx", "args": ["tsx", "C:/path/to/agam/mcp/server.mts"] }
  }
}`}</pre>
        </Section>

        <Section id="team" title="Team & roadmap" kicker="Quantum Builders">
          <div className="grid gap-3 md:grid-cols-2">
            <Card title="Team">
              <ul className="space-y-1">
                <li><b>MD Samir Hossan</b> — Team Leader: project, build, pitch and submission.</li>
                <li><b>Nadia Islam Priya</b> — Team Coordinator: team, outreach and partners.</li>
                <li>Seeking an <b>NRB collaborator</b> in hydrology, disaster risk or climate data to review the method and open international networks.</li>
              </ul>
            </Card>
            <Card title="Next steps">
              <ol className="list-decimal space-y-1 pl-5">
                <li>Pilot with one Union Disaster Management Committee in Feni or Sunamganj.</li>
                <li>Validate travel times with BWDB/FFWC hourly gauge records.</li>
                <li>Add satellite rain (GPM IMERG Early) and BMD/IMD gauges.</li>
                <li>Field comprehension tests with residents; 72-case alert-writer evaluation.</li>
                <li>Telecom partner for Bangla IVR capacity; remote MCP endpoint for NGOs.</li>
              </ol>
            </Card>
          </div>
        </Section>

        <Section id="judging" title="For judges: where to find the evidence" kicker="Mapped to the Congress criteria">
          <Table
            head={["Criterion", "Evidence in Agam"]}
            rows={[
              ["Innovation (20)", "Watches rain across the border instead of forecasting rivers; per-location history instead of national thresholds; AI for last-mile language, rules for decisions."],
              ["Technical execution (20)", <>Explainable engine, bias correction between datasets, free-tier AI (Gemini → Groq) with structured outputs and 7 checks, MCP server, worker with escalation and retries — <a className="underline" href={REPO}>open source</a>.</>],
              ["Business model + global readiness (20)", <>Four paying customer types, unit costs, global open data and a config-file path to new countries — <a className="underline" href="#business">Business</a>.</>],
              ["Real-world impact + ethical AI (20)", <>Feni 2024 replay, {backtest.onTime}/{backtest.events} backtest, human approval, consent-based data, published misses — <a className="underline" href="#responsible">Responsible AI</a>.</>],
              ["Scalability + NRB collaboration (10)", <>Docker pilot hosting, modular channels, MCP; NRB collaborator being recruited — <a className="underline" href="#scale">Scale</a>.</>],
              ["Presentation (10)", <><a className="underline" href={VIDEO}>3-minute video</a>, live replay demo and this page.</>],
            ]}
          />
        </Section>

        <footer className="border-t border-stone-200 py-8 text-xs text-stone-500">
          Data: Open-Meteo (ERA5, GloFAS, weather models), CC BY 4.0 · Map © OpenStreetMap contributors · Agam is a prototype for research and demonstration, not an official warning service.
        </footer>
      </main>
    </div>
  );
}
