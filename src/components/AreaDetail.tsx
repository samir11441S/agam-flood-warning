"use client";

import { toBn } from "@/lib/alerts";
import { LEVELS, type Area, type Assessment, type SignalKind } from "@/lib/types";

const KIND: Record<SignalKind, { en: string; bn: string }> = {
  upstream_rain: { en: "Upstream rain (across the border)", bn: "উজানের বৃষ্টি" },
  local_rain: { en: "Local rain", bn: "স্থানীয় বৃষ্টি" },
  forecast_rain: { en: "Forecast rain", bn: "বৃষ্টির পূর্বাভাস" },
  river: { en: "River flow (GloFAS)", bn: "নদীর প্রবাহ" },
  tide: { en: "High tide at the river mouth (drainage slowed)", bn: "জোয়ার" },
  community: { en: "Residents report rising water", bn: "এলাকাবাসীর রিপোর্ট" },
};

const THRESHOLD_NOTE: Record<SignalKind, string> = {
  upstream_rain: "≈2/5-year rainfall at this place",
  local_rain: "≈2/5-year rainfall at this place",
  forecast_rain: "≈2/5-year rainfall at this place",
  river: "≈2/5-year flood flow",
  tide: "top 5% of daily high tides (adds one level when it is also raining)",
  community: "3 reports = Warning",
};

export function LevelBadge({ level, large }: { level: 0 | 1 | 2 | 3; large?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold text-white ${large ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs"}`} style={{ background: LEVELS[level].color }}>
      <span lang="bn">{LEVELS[level].bn}</span>
      <span className="opacity-80">· {LEVELS[level].en}</span>
    </span>
  );
}

export default function AreaDetail({ area, assessment, onAlert, alertLoading }: {
  area: Area;
  assessment: Assessment;
  onAlert: () => void;
  alertLoading: boolean;
}) {
  return (
    <section className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold"><span lang="bn">{area.nameBn}</span> <span className="text-base font-normal text-stone-500">{area.name}, {area.district}</span></h2>
          <p className="text-sm text-stone-500">River: {area.river} · Hazard: {area.hazard === "flash" ? "flash flood" : area.hazard === "riverine" ? "riverine flood" : "flash + riverine"}</p>
        </div>
        <LevelBadge level={assessment.level} large />
      </header>

      {assessment.etaHours && assessment.level > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
          Water may arrive in <b>{Math.max(1, assessment.etaHours[0])}–{assessment.etaHours[1]} hours</b> <span className="text-xs">(estimate)</span>
          <span lang="bn" className="ml-2">(আনুমানিক {toBn(Math.max(1, assessment.etaHours[0]))}–{toBn(assessment.etaHours[1])} ঘণ্টা)</span>
        </div>
      )}

      {assessment.heldFromDaysAgo && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
          Danger was raised {assessment.heldFromDaysAgo} day{assessment.heldFromDaysAgo > 1 ? "s" : ""} ago. Rain has eased, but flood water stays high — held at Warning until an officer gives the all-clear.
        </div>
      )}

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Why — evidence from data</h3>
        <ul className="space-y-2">
          {assessment.signals.map((s, i) => {
            const pct = Math.min(150, (s.value / Math.max(1, s.threshold)) * 100);
            return (
              <li key={i} className="rounded-lg border border-stone-200 p-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span><b>{KIND[s.kind].en}</b> · {s.where}</span>
                  <span className="whitespace-nowrap font-mono text-xs" style={{ color: LEVELS[s.level].color }}>{s.value} / {s.threshold} {s.unit}</span>
                </div>
                <div className="relative mt-1 h-2 rounded bg-stone-100">
                  <div className="h-2 rounded" style={{ width: `${pct / 1.5}%`, background: LEVELS[s.level].color }} />
                  <div className="absolute top-[-2px] h-3 w-0.5 bg-stone-700" style={{ left: `${100 / 1.5}%` }} title="threshold" />
                </div>
                <div className="mt-1 text-xs text-stone-500">
                  {s.window} · threshold = {THRESHOLD_NOTE[s.kind]}
                  {s.etaHours && <> · estimated travel time {s.etaHours[0]}–{s.etaHours[1]} h</>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <button onClick={onAlert} disabled={assessment.level === 0 || alertLoading}
        className="w-full rounded-lg bg-stone-900 px-4 py-3 font-semibold text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-300">
        {alertLoading ? "Writing alert…" : assessment.level === 0 ? "No alert needed" : <>Draft Bangla alert <span lang="bn">· সতর্কবার্তা তৈরি করুন</span></>}
      </button>
    </section>
  );
}
