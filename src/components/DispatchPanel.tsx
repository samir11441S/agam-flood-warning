"use client";

import { useEffect, useMemo, useState } from "react";
import type { AlertStatus, OutboxEntry } from "@/lib/api-types";
import { simulatedPosition, simulatedReply, type DispatchPlan } from "@/lib/households";
import type { Area } from "@/lib/types";

export type RescuePin = { lat: number; lon: number; label: string; live: boolean };

const REPLY_LAG = 30;
const PHONE: Record<string, string> = { smartphone: "Call + SMS", feature: "Call + SMS", none: "Door-knock" };

export default function DispatchPanel({ plan, area, status, onRescues }: {
  plan: DispatchPlan;
  area: Area;
  status: AlertStatus | null;
  onRescues: (pins: RescuePin[]) => void;
}) {
  const [tick, setTick] = useState(0);
  const live = useMemo(() => status?.replies ?? [], [status?.replies]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => Math.min(plan.total + REPLY_LAG, t + Math.ceil(plan.total / 40))), 150);
    return () => clearInterval(id);
  }, [plan.total]);

  // Replies trail outreach slightly: a household answers a few ticks after it is reached.
  const reached = Math.min(plan.total, tick);
  const answeredCount = plan.source === "demo" ? Math.max(0, tick - REPLY_LAG) : 0;
  const sim = useMemo(() => plan.all.slice(0, answeredCount).map((h) => ({ h, reply: simulatedReply(h) })), [plan.all, answeredCount]);
  const helpSim = useMemo(() => sim.filter((s) => s.reply === "help"), [sim]);
  const counts = {
    safe: sim.filter((s) => s.reply === "safe").length + live.filter((r) => r.status === "safe").length,
    help: helpSim.length + live.filter((r) => r.status === "help").length,
    none: sim.filter((s) => s.reply === "none").length,
  };
  const pct = Math.round((reached / plan.total) * 100);

  const pins = useMemo<RescuePin[]>(() => [
    ...live.filter((r) => r.status === "help" && r.location).map((r) => ({ lat: r.location!.lat, lon: r.location!.lon, label: `LIVE: ${r.name || "Telegram user"}`, live: true })),
    ...helpSim.map(({ h }) => ({ ...simulatedPosition(h, area), label: `${h.headBn} · ${h.village}`, live: false })),
  ], [live, helpSim, area]);

  useEffect(() => { onRescues(pins); }, [pins, onRescues]);

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Dispatch &amp; replies</h3>

      {status?.outbox ? <Outbox entries={status.outbox} /> : <p className="text-sm text-stone-500">Sending…</p>}

      {status && status.calls.total > 0 && (
        <div className="rounded-lg border border-stone-200 p-3 text-xs">
          <div className="mb-1 font-semibold text-stone-500">Voice calls — retries and volunteer hand-off</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded bg-emerald-50 p-1.5"><b className="text-base">{status.calls.answered}</b><br />answered</div>
            <div className="rounded bg-amber-50 p-1.5"><b className="text-base">{status.calls.inProgress}</b><br />calling / retrying</div>
            <div className="rounded bg-red-50 p-1.5"><b className="text-base">{status.calls.toVolunteer.length}</b><br />no answer → volunteer</div>
          </div>
          {status.calls.toVolunteer.length > 0 && <p lang="bn" className="mt-1 text-stone-600">{status.calls.toVolunteer.slice(0, 6).map((h) => `${h.headBn} (${h.village})`).join(", ")}</p>}
          <p className="mt-1 text-stone-500">Unanswered calls are retried once after 10 min, then the backup number is called, then a volunteer visits.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        {[
          ["Households", plan.total],
          ["People", plan.people],
          ["Voice calls", plan.voiceCalls],
          ["Door-knocks", plan.total - plan.voiceCalls],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-stone-100 p-2">
            <div className="text-lg font-bold">{v}</div>
            <div className="text-xs text-stone-500">{k}</div>
          </div>
        ))}
      </div>
      <div>
        <div className="mb-1 flex justify-between text-xs text-stone-600">
          <span>Reached {reached}/{plan.total}</span>
          <span>everyone reached in ≈{plan.minutesToReachAll} min</span>
        </div>
        <div className="h-3 rounded bg-stone-100"><div className="h-3 rounded bg-emerald-600 transition-all" style={{ width: `${pct}%` }} /></div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-emerald-50 p-2"><div className="text-lg font-bold text-emerald-700">{counts.safe}</div><div className="text-xs text-emerald-800">✅ Safe</div></div>
        <div className="rounded-lg bg-red-50 p-2"><div className="text-lg font-bold text-red-700">{counts.help}</div><div className="text-xs text-red-800">🆘 Need help</div></div>
        <div className="rounded-lg bg-amber-50 p-2"><div className="text-lg font-bold text-amber-700">{counts.none}</div><div className="text-xs text-amber-800">No answer → volunteer</div></div>
      </div>

      {(live.some((r) => r.status === "help") || helpSim.length > 0) && (
        <div>
          <div className="mb-1 text-xs font-semibold text-red-700">Rescue list — most vulnerable first</div>
          <ul className="max-h-48 space-y-1 overflow-auto text-xs">
            {live.filter((r) => r.status === "help").map((r) => (
              <li key={r.chatId} className="rounded border border-red-300 bg-red-50 p-1.5">
                <b>LIVE</b> · {r.name || "Telegram user"} · {new Date(r.at).toLocaleTimeString()} · {r.location ? `📍 ${r.location.lat.toFixed(4)}, ${r.location.lon.toFixed(4)}` : "waiting for location…"}
              </li>
            ))}
            {[...helpSim].sort((a, b) => b.h.priority - a.h.priority).map(({ h }) => (
              <li key={h.id} className="rounded bg-red-50/60 p-1.5">
                <span lang="bn">{h.headBn} · {h.village} · {h.reasons.slice(0, 2).join(", ")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div className="mb-1 text-xs font-semibold text-stone-500">Highest-priority households first</div>
        <div className="max-h-48 overflow-auto rounded-lg border border-stone-200">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-stone-50 text-stone-500">
              <tr><th className="p-1.5">Household</th><th className="p-1.5">Why first</th><th className="p-1.5">Channel</th></tr>
            </thead>
            <tbody>
              {plan.priorityFirst.map((h) => (
                <tr key={h.id} className="border-t border-stone-100">
                  <td className="p-1.5"><span lang="bn">{h.headBn}</span><div className="text-stone-400" lang="bn">{h.village}</div></td>
                  <td className="p-1.5" lang="bn">{h.reasons.slice(0, 3).join(", ")}</td>
                  <td className="p-1.5">{PHONE[h.phone]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="mb-1 text-xs font-semibold text-stone-500">Volunteer door-knock routes (households without a phone)</div>
        <ul className="space-y-1 text-xs">
          {plan.doorKnock.map((t) => (
            <li key={t.volunteer} className="rounded bg-stone-50 p-1.5">
              <b lang="bn">{t.volunteer}</b>: {t.households.length} homes · <span lang="bn">{[...new Set(t.households.map((h) => h.village))].join(", ")}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-stone-400">{plan.source === "uploaded" ? "Using the household list uploaded for this area." : "Households and their replies are synthetic demo data."}{plan.source === "demo" ? " In a real pilot, the union disaster committee’s own household list is used and no data leaves the union." : ""}</p>
    </section>
  );
}

const MODE_STYLE: Record<string, string> = { live: "bg-emerald-600 text-white", test: "bg-amber-400 text-amber-950", simulated: "bg-stone-300 text-stone-700" };

function Outbox({ entries }: { entries: OutboxEntry[] }) {
  return (
    <div className="space-y-2 rounded-lg border border-stone-200 p-3">
      <div className="text-xs font-semibold text-stone-500">Outbox — what was sent, by channel</div>
      {entries.map((e) => (
        <details key={e.channel} className="rounded bg-stone-50 p-2 text-xs">
          <summary className="flex cursor-pointer items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${MODE_STYLE[e.mode]}`}>{e.mode}</span>
            <span className="font-medium">{e.channel}</span>
            <span className="ml-auto text-stone-500">{e.mode === "simulated" ? `${e.recipients} (demo, not sent)` : e.mode === "test" ? `${e.recipients} ready (test mode, not sent)` : `${e.sent}/${e.recipients} sent${e.failed ? `, ${e.failed} failed` : ""}`}</span>
          </summary>
          <p lang="bn" className="mt-1 whitespace-pre-line text-stone-700">{e.sample}</p>
          {e.note && <p className="mt-1 text-stone-500">{e.note}</p>}
        </details>
      ))}
      <p className="text-[11px] text-stone-500"><b>LIVE</b> = really sent · <b>TEST</b> = provider not configured, nothing left this computer · <b>SIMULATED</b> = demo data only.</p>
    </div>
  );
}
