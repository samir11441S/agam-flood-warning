"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import geo from "@/data/geo.json";
import type { AlertResponse, AlertStatus, RiskResponse } from "@/lib/api-types";
import { LEVELS, type Area } from "@/lib/types";
import AreaDetail, { LevelBadge } from "./AreaDetail";
import AlertPanel from "./AlertPanel";
import DispatchPanel, { type RescuePin } from "./DispatchPanel";
import PhoneQR from "./PhoneQR";
import ListsPanel from "./ListsPanel";
import OfficialStatusBox from "./OfficialStatusBox";
import ReportsBox from "./ReportsBox";
import OfficerBar, { type SessionInfo } from "./OfficerBar";

const FloodMap = dynamic(() => import("./FloodMap"), { ssr: false, loading: () => <div className="grid h-full place-items-center text-stone-400">Loading map…</div> });

const areas = geo.areas as Area[];
const areaById = Object.fromEntries(areas.map((a) => [a.id, a]));

const SCENARIOS = [
  { id: "chattogram-2026", label: "Replay: Chattogram, Jul 2026" },
  { id: "feni-2024", label: "Replay: Feni, Aug 2024" },
  { id: "sylhet-2024", label: "Replay: Sylhet, Jun 2024" },
  { id: "north-2024", label: "Replay: Jamuna, Jul 2024" },
  { id: "live", label: "Live today" },
];

const fmtDate = (step: string) => {
  const [d, hh] = step.split("T");
  const day = new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return hh === undefined ? day : `${day}, ${hh === "24" ? "24:00" : `${hh}:00`}`;
};

export default function Dashboard() {
  const [scenario, setScenario] = useState("feni-2024");
  const [date, setDate] = useState<string | null>(null);
  const [data, setData] = useState<(RiskResponse & { key: string }) | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [alertState, setAlertState] = useState<{ key: string; data: AlertResponse; status: AlertStatus | null } | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [askLogin, setAskLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sessionVersion, setSessionVersion] = useState(0);
  const [rescues, setRescues] = useState<{ key: string; pins: RescuePin[] } | null>(null);
  const [botName, setBotName] = useState<string | null>(null);
  const [alertLoading, setAlertLoading] = useState(false);

  const requestKey = `${scenario}|${date ?? ""}`;
  const loading = data?.key !== requestKey && error?.key !== requestKey;
  const alertKey = `${requestKey}|${selected}`;
  const alert = alertState?.key === alertKey ? alertState : null;
  const rescuePins = rescues?.key === alertKey ? rescues.pins : [];
  const onRescues = useCallback((pins: RescuePin[]) => setRescues({ key: alertKey, pins }), [alertKey]);

  useEffect(() => {
    fetch("/api/bot").then((r) => r.json()).then((j) => setBotName(j.username ?? null)).catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/session").then((r) => r.json()).then(setSession).catch(() => {});
  }, [sessionVersion]);

  const alertId = alert?.data.alertId;
  const alertDone = alert?.status?.status === "rejected" || alert?.status?.status === "superseded";
  // Follow the alert: approvals (from any channel), outbox, call retries and replies.
  useEffect(() => {
    if (!alertId || alertDone) return;
    let stop = false;
    const poll = () =>
      fetch(`/api/alert-status?alertId=${alertId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((s: AlertStatus | null) => {
          if (!stop && s) setAlertState((prev) => (prev && prev.data.alertId === alertId ? { ...prev, status: s } : prev));
        })
        .catch(() => {});
    poll();
    const id = setInterval(poll, 3000);
    return () => { stop = true; clearInterval(id); };
  }, [alertId, alertDone]);

  const decide = useCallback(async (action: "approve" | "reject") => {
    if (!alert) return;
    setBusy(true);
    const res = await fetch("/api/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alertId: alert.data.alertId, action }) });
    const j = await res.json();
    if (!res.ok) setError({ key: requestKey, message: j.error });
    const s = await fetch(`/api/alert-status?alertId=${alert.data.alertId}`).then((r) => r.json());
    setAlertState((prev) => (prev ? { ...prev, status: s } : prev));
    setBusy(false);
  }, [alert, requestKey]);

  useEffect(() => {
    const qs = scenario === "live" ? "" : `?replay=${scenario}${date ? `&date=${date}` : ""}`;
    let cancelled = false;
    fetch(`/api/risk${qs}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        return j as RiskResponse;
      })
      .then((j) => {
        if (cancelled) return;
        if (j.scenario.mode === "replay" && j.scenario.date !== date) {
          setData({ ...j, key: `${scenario}|${j.scenario.date}` });
          setDate(j.scenario.date);
        } else {
          setData({ ...j, key: `${scenario}|${date ?? ""}` });
        }
      })
      .catch((e) => !cancelled && setError({ key: `${scenario}|${date ?? ""}`, message: e.message }));
    return () => { cancelled = true; };
  }, [scenario, date]);

  const dates = useMemo(() => data?.replay?.dates ?? [], [data]);
  const dateIdx = date ? dates.indexOf(date) : -1;

  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(() => {
      if (dateIdx < 0 || dateIdx >= dates.length - 1) setPlaying(false);
      else setDate(dates[dateIdx + 1]);
    }, 900);
    return () => clearTimeout(id);
  }, [playing, dateIdx, dates]);

  const sorted = useMemo(() => {
    if (!data) return [];
    const focus = new Set(data.replay?.focus ?? []);
    return [...data.assessments].sort((a, b) => Number(focus.has(b.areaId)) - Number(focus.has(a.areaId)) || b.level - a.level);
  }, [data]);
  const counts = [3, 2, 1].map((l) => sorted.filter((a) => a.level === l).length);
  const selectedAssessment = data?.assessments.find((a) => a.areaId === selected) ?? null;

  const draftAlert = useCallback(async () => {
    if (!selected) return;
    if (!session?.officer) return setAskLogin(true);
    setAlertLoading(true);
    try {
      const res = await fetch("/api/alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ areaId: selected, ...(scenario === "live" ? {} : { replay: scenario, date }) }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setAlertState({ key: alertKey, data: j, status: null });
    } catch (e) {
      setError({ key: requestKey, message: (e as Error).message });
    } finally {
      setAlertLoading(false);
    }
  }, [selected, scenario, date, alertKey, requestKey, session]);

  return (
    <div className="flex min-h-dvh flex-col bg-stone-50 text-stone-900 lg:h-dvh">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight"><span lang="bn">আগাম</span> <span className="text-stone-400">Agam</span></h1>
          <p className="text-xs text-stone-500">Flash-flood warnings that watch the rain across the border — and reach every household in time.</p>
        </div>
        <OfficerBar session={session} onChange={() => setSessionVersion((v) => v + 1)} askLogin={askLogin} setAskLogin={setAskLogin} />
        <div className="flex w-full flex-wrap gap-1.5">
          {SCENARIOS.map((s) => (
            <button key={s.id} onClick={() => { setScenario(s.id); setDate(null); setSelected(null); setPlaying(false); }}
              className={`rounded-full border px-3 py-1.5 text-sm ${scenario === s.id ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white hover:bg-stone-100"}`}>
              {s.label}
            </button>
          ))}
        </div>
      </header>

      {data?.replay && (
        <div className="flex flex-wrap items-center gap-3 border-b border-stone-200 bg-white px-4 py-2 text-sm">
          <button onClick={() => { if (dateIdx >= dates.length - 1) setDate(dates[0]); setPlaying((p) => !p); }}
            className="rounded-md bg-stone-900 px-3 py-1 font-medium text-white">{playing ? "❚❚ Pause" : "▶ Play"}</button>
          <input type="range" min={0} max={dates.length - 1} value={Math.max(0, dateIdx)} onChange={(e) => { setPlaying(false); setDate(dates[Number(e.target.value)]); }}
            className="w-48 accent-stone-900 sm:w-72" aria-label="Replay day" />
          <span className="font-semibold">{date && fmtDate(date)}</span>
          <span className="text-stone-500">{data.replay.title} — using only data that existed at this hour</span>
        </div>
      )}

      <main className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
        <div className="relative h-[55vh] shrink-0 lg:h-auto lg:flex-1 lg:shrink">
          {data && <FloodMap assessments={data.assessments} selected={selected} onSelect={setSelected} focus={data.replay?.focus ?? null} rescues={rescuePins} />}
          {loading && <div className="absolute right-3 top-3 z-[1000] rounded bg-white/90 px-2 py-1 text-xs shadow">Updating…</div>}
          <div className="absolute bottom-3 left-3 z-[1000] rounded-lg bg-white/95 p-2 text-xs shadow">
            {[3, 2, 1, 0].map((l) => (
              <div key={l} className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full" style={{ background: LEVELS[l].color }} />{LEVELS[l].en} <span lang="bn" className="text-stone-500">{LEVELS[l].bn}</span></div>
            ))}
            <div className="mt-1 flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-blue-500" />Upstream rain gauge</div>
          </div>
        </div>

        <aside className="w-full border-l border-stone-200 bg-white p-4 lg:w-[460px] lg:overflow-y-auto">
          {error?.key === requestKey && <p className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-800">{error.message}</p>}
          {data && (
            <div className="mb-4 grid grid-cols-3 gap-2 text-center">
              {[3, 2, 1].map((l, i) => (
                <div key={l} className="rounded-lg p-2 text-white" style={{ background: LEVELS[l].color }}>
                  <div className="text-2xl font-bold">{counts[i]}</div>
                  <div className="text-xs">{LEVELS[l].en} areas</div>
                </div>
              ))}
            </div>
          )}

          {selected && selectedAssessment ? (
            <div className="space-y-5">
              <button onClick={() => setSelected(null)} className="text-sm text-stone-500 hover:text-stone-900">← All areas</button>
              <AreaDetail area={areaById[selected]} assessment={selectedAssessment} onAlert={draftAlert} alertLoading={alertLoading} />
              <OfficialStatusBox areaId={selected} agamLevel={selectedAssessment.level} canEdit={Boolean(session?.officer)} />
              <ReportsBox areaId={selected} canLog={Boolean(session?.officer)} live={scenario === "live"} />
              {session?.officer && <ListsPanel areaId={selected} />}
              {botName && <PhoneQR username={botName} areaId={selected} areaBn={areaById[selected].nameBn} />}
              {alert && <AlertPanel data={alert.data} status={alert.status} busy={busy} onApprove={() => decide("approve")} onReject={() => decide("reject")} />}
              {alert?.status?.status === "sent" && <DispatchPanel plan={alert.data.plan} area={areaById[selected]} status={alert.status} onRescues={onRescues} />}
            </div>
          ) : (
            <>
            <details className="mb-3 rounded-lg bg-stone-50 p-3 text-sm text-stone-700">
              <summary className="cursor-pointer font-semibold text-stone-900">How Agam works</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>Watches rain at 13 points upstream — many across the border in Tripura, Meghalaya and Assam — plus local rain, forecasts and river flow.</li>
                <li>Compares it with each place&apos;s own 30–40 years of history (&ldquo;rain this heavy happens once in 2 / 5 years here&rdquo;) and estimates when the water arrives.</li>
                <li>Claude writes a plain-Bangla SMS and voice call from verified facts; automatic checks and a human officer approve it.</li>
                <li>Reaches every household, most vulnerable first: voice calls, SMS, and volunteer door-knocks where there is no phone.</li>
              </ol>
              <p className="mt-2 text-xs text-stone-500">Click an area on the map or in the list to see the evidence and draft an alert.</p>
            </details>
            <ul className="divide-y divide-stone-100">
              {sorted.map((a) => {
                const area = areaById[a.areaId];
                const top = a.signals[0];
                return (
                  <li key={a.areaId}>
                    <button onClick={() => setSelected(a.areaId)} className="flex w-full items-center justify-between gap-2 py-2 text-left hover:bg-stone-50">
                      <span>
                        <span lang="bn" className="font-semibold">{area.nameBn}</span> <span className="text-sm text-stone-500">{area.name}, {area.district}</span>
                        {a.level > 0 && top && <span className="block text-xs text-stone-500">{top.where}: {top.value} {top.unit} ({top.window}){a.etaHours ? ` · arrives in ${Math.max(1, a.etaHours[0])}–${a.etaHours[1]} h` : ""}</span>}
                      </span>
                      <LevelBadge level={a.level} />
                    </button>
                  </li>
                );
              })}
            </ul>
            </>
          )}
          <p className="mt-6 text-xs text-stone-400">
            Data: Open-Meteo (ERA5, GloFAS, weather models), CC BY 4.0. Thresholds computed from 30–40 years of history per location. Prototype for research and demonstration — not an official warning service.
          </p>
        </aside>
      </main>
    </div>
  );
}
