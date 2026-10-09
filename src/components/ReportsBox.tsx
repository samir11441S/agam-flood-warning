"use client";

import { useEffect, useState } from "react";

type Report = { name: string; at: string; source: string; note?: string; hasLocation: boolean };

/** Residents' and volunteers' "water rising" reports — evidence the rain data can miss (breaches, blocked drains, tides). */
export default function ReportsBox({ areaId, canLog, live }: { areaId: string; canLog: boolean; live: boolean }) {
  const [state, setState] = useState<{ areaId: string; list: Report[] } | null>(null);
  const [version, setVersion] = useState(0);
  const [from, setFrom] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    fetch(`/api/reports?areaId=${areaId}`).then((r) => r.json()).then((j) => setState({ areaId, list: j.reports ?? [] })).catch(() => {});
  }, [areaId, version]);

  async function log(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ areaId, from, note }) });
    if (res.ok) {
      setFrom("");
      setNote("");
      setVersion((v) => v + 1);
    }
  }

  const list = state?.areaId === areaId ? state.list : [];
  return (
    <details className="rounded-lg border border-stone-200 p-3 text-sm">
      <summary className="cursor-pointer font-semibold">🌊 Rising-water reports <span className="font-normal text-stone-500">— {list.length} in the last 24 h</span></summary>
      <div className="mt-2 space-y-2 text-xs">
        <p className="text-stone-600">Residents report by Telegram (🌊 button) or SMS (<b>PANI {areaId}</b>). Reports from 3 different people in 6 hours raise the level to Warning{live ? "" : " (live mode only — not used in replays)"}.</p>
        {list.length > 0 && (
          <ul className="space-y-1">
            {list.slice(-8).reverse().map((r, i) => (
              <li key={i} className="rounded bg-stone-50 p-1.5">{new Date(r.at).toLocaleString()} · {r.source} · {r.name}{r.note ? ` — ${r.note}` : ""}{r.hasLocation ? " · 📍" : ""}</li>
            ))}
          </ul>
        )}
        {canLog && (
          <form onSubmit={log} className="flex flex-wrap gap-2">
            <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Who reported (e.g. volunteer Rafiq)" className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1" required />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What they saw" className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1" />
            <button className="rounded bg-stone-900 px-2 py-1 text-white">Log report</button>
          </form>
        )}
      </div>
    </details>
  );
}
