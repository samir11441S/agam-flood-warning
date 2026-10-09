"use client";

import { useEffect, useState } from "react";
import { LEVELS } from "@/lib/types";

type Official = { level: 0 | 1 | 2 | 3; source: string; note?: string; by: string; at: string } | null;

/** Shows the official FFWC / BMD status next to Agam's advisory level, so the two never silently contradict. */
export default function OfficialStatusBox({ areaId, agamLevel, canEdit }: { areaId: string; agamLevel: number; canEdit: boolean }) {
  const [state, setState] = useState<{ areaId: string; status: Official } | null>(null);
  const [editing, setEditing] = useState(false);
  const [level, setLevel] = useState(0);
  const [note, setNote] = useState("");

  useEffect(() => {
    fetch(`/api/official?areaId=${areaId}`).then((r) => r.json()).then((j) => setState({ areaId, status: j.status })).catch(() => {});
  }, [areaId]);

  const status = state?.areaId === areaId ? state.status : null;

  async function save() {
    const res = await fetch("/api/official", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ areaId, level, note }) });
    const j = await res.json();
    if (res.ok) {
      setState({ areaId, status: j.status });
      setEditing(false);
      setNote("");
    }
  }

  const higher = agamLevel > 0 && (status === null || agamLevel > status.level);
  return (
    <div className="space-y-1.5 rounded-lg border border-stone-200 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">Official warning (FFWC / BMD)</span>
        <span className="text-xs">
          <a className="text-sky-700 underline" href="https://www.ffwc.gov.bd" target="_blank" rel="noreferrer">FFWC</a> ·{" "}
          <a className="text-sky-700 underline" href="https://live6.bmd.gov.bd" target="_blank" rel="noreferrer">BMD</a>
        </span>
      </div>
      {status ? (
        <p>
          <span className="rounded px-1.5 py-0.5 text-xs font-semibold text-white" style={{ background: LEVELS[status.level].color }}>{LEVELS[status.level].en}</span>{" "}
          <span className="text-xs text-stone-500">recorded by {status.by}, {new Date(status.at).toLocaleString()}{status.note ? ` — ${status.note}` : ""}</span>
        </p>
      ) : (
        <p className="text-xs text-stone-500">Not recorded yet. Check today&apos;s FFWC / BMD bulletin.</p>
      )}
      {higher && (
        <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">
          Agam&apos;s level is higher than the recorded official status. Agam&apos;s levels are early <b>advisories for the local committee</b> based on upstream rain —
          messages are sent in the committee&apos;s name and do not replace official FFWC / BMD warnings.
        </p>
      )}
      {canEdit && !editing && <button onClick={() => setEditing(true)} className="text-xs text-sky-700 underline">Update from today&apos;s bulletin</button>}
      {canEdit && editing && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select value={level} onChange={(e) => setLevel(Number(e.target.value))} className="rounded border border-stone-300 px-1 py-1" aria-label="Official level">
            {LEVELS.map((l, i) => <option key={i} value={i}>{l.en}</option>)}
          </select>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Muhuri at Parshuram above danger level" className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1" />
          <button onClick={save} className="rounded bg-stone-900 px-2 py-1 text-white">Save</button>
        </div>
      )}
    </div>
  );
}
