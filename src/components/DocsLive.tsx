"use client";

import { useEffect, useState } from "react";
import type { RiskResponse } from "@/lib/api-types";
import { LEVELS } from "@/lib/types";

type Probe = { label: string; url: string; note: string };
type Result = { ok: true; ms: number; data: RiskResponse } | { ok: false; ms: number; error: string };

const PROBES: Probe[] = [
  { label: "Live today", url: "/api/risk", note: "Open-Meteo rain, river and tide right now + residents' reports" },
  { label: "Feni flood, 20 Aug 2024 12:00", url: "/api/risk?replay=feni-2024&date=2024-08-20T12", note: "Only the data that existed at that hour" },
];

function ProbeCard({ probe }: { probe: Probe }) {
  const [res, setRes] = useState<Result | null>(null);
  useEffect(() => {
    const t0 = performance.now();
    fetch(probe.url)
      .then(async (r) => {
        const j = await r.json();
        const ms = Math.round(performance.now() - t0);
        setRes(r.ok ? { ok: true, ms, data: j } : { ok: false, ms, error: j.error ?? `HTTP ${r.status}` });
      })
      .catch((e) => setRes({ ok: false, ms: Math.round(performance.now() - t0), error: (e as Error).message }));
  }, [probe.url]);

  const counts = res?.ok ? LEVELS.map((_, i) => res.data.assessments.filter((a) => a.level === i).length) : null;
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{probe.label}</p>
          <p className="text-xs text-stone-500">{probe.note}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${!res ? "bg-stone-100 text-stone-500" : res.ok ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
          {!res ? "checking…" : res.ok ? `OK · ${res.ms} ms` : "unavailable"}
        </span>
      </div>
      {counts && res?.ok && (
        <>
          <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
            {LEVELS.map((l, i) => (
              <div key={l.en} className="rounded-lg py-2 text-white" style={{ background: l.color }}>
                <div className="text-xl font-bold">{counts[i]}</div>
                <div className="text-[11px]">{l.en}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-stone-500">{res.data.assessments.length} areas assessed · data as of {res.data.asOf.replace("T", " ")}:00</p>
        </>
      )}
      {res && !res.ok && <p className="mt-2 text-xs text-red-700">{res.error}</p>}
    </div>
  );
}

export default function DocsLive() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {PROBES.map((p) => <ProbeCard key={p.url} probe={p} />)}
    </div>
  );
}
