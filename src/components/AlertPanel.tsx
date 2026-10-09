"use client";

import { useState, useSyncExternalStore } from "react";
import type { AlertResponse, AlertStatus } from "@/lib/api-types";

const hasSpeech = () => typeof window !== "undefined" && "speechSynthesis" in window;
const banglaVoice = () => (hasSpeech() ? speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("bn")) : undefined);

function subscribeVoices(onChange: () => void) {
  if (!hasSpeech()) return () => {};
  speechSynthesis.addEventListener("voiceschanged", onChange);
  return () => speechSynthesis.removeEventListener("voiceschanged", onChange);
}

function useBanglaVoice() {
  const voiceUri = useSyncExternalStore(subscribeVoices, () => banglaVoice()?.voiceURI ?? null, () => null);
  const supported = useSyncExternalStore(subscribeVoices, hasSpeech, () => false);
  return { voice: voiceUri ? banglaVoice() ?? null : null, supported };
}

function Speak({ text }: { text: string }) {
  const { voice, supported } = useBanglaVoice();
  const [speaking, setSpeaking] = useState(false);
  if (!supported) return null;
  const play = () => {
    speechSynthesis.cancel();
    if (speaking) return setSpeaking(false);
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "bn-BD";
    if (voice) u.voice = voice;
    u.rate = 0.9;
    u.onend = () => setSpeaking(false);
    setSpeaking(true);
    speechSynthesis.speak(u);
  };
  return (
    <div className="flex items-center gap-2">
      <button onClick={play} className="rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-500">{speaking ? "■ Stop" : "▶ Play voice call"}</button>
      {!voice && <span data-novoice className="text-xs text-stone-500">No Bangla voice installed in this browser — try Microsoft Edge or Chrome on Android.</span>}
    </div>
  );
}

export default function AlertPanel({ data, status, onApprove, onReject, busy }: {
  data: AlertResponse;
  status: AlertStatus | null;
  onApprove: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  const { content, source, checks, note } = data.result;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Draft alert — needs human approval</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${source === "claude" ? "bg-violet-100 text-violet-800" : "bg-stone-200 text-stone-700"}`}>
          {source === "claude" ? "Written by Claude, verified" : "Verified template"}
        </span>
      </div>
      {note && <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">{note}</p>}

      <div className="rounded-lg border border-stone-200 p-3">
        <div className="mb-1 text-xs font-semibold text-stone-500">SMS ({content.sms_bn.length} chars)</div>
        <p lang="bn" className="text-[15px] leading-relaxed">{content.sms_bn}</p>
      </div>

      <div className="space-y-2 rounded-lg border border-stone-200 p-3">
        <div className="text-xs font-semibold text-stone-500">Voice call script</div>
        <p lang="bn" className="text-[15px] leading-relaxed">{content.voice_bn}</p>
        <Speak text={content.voice_bn} />
      </div>

      {content.dialect_voice && (
        <div className="rounded-lg border border-dashed border-violet-300 p-3">
          <div className="mb-1 text-xs font-semibold text-violet-700">Local dialect version (experimental — native speaker must review)</div>
          <p lang="bn" className="text-[15px] leading-relaxed">{content.dialect_voice}</p>
        </div>
      )}

      <div className="rounded-lg border border-stone-200 p-3">
        <div className="mb-1 text-xs font-semibold text-stone-500">What to do now</div>
        <ul lang="bn" className="list-disc space-y-0.5 pl-5 text-[15px]">
          {content.checklist_bn.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      </div>

      <div className="space-y-2 rounded-lg border border-stone-200 p-3">
        <div className="text-xs font-semibold text-stone-500">Loudspeaker announcement (mosque / temple / CPP megaphone)</div>
        <p lang="bn" className="whitespace-pre-line text-[15px] leading-relaxed">{data.announcement}</p>
        <Speak text={data.announcement} />
      </div>

      <div className="rounded-lg bg-stone-50 p-3 text-sm">
        <div className="mb-1 text-xs font-semibold text-stone-500">For officials (English)</div>
        {content.official_summary_en}
      </div>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
        <div className="mb-1 text-xs font-semibold text-emerald-800">Safety checks</div>
        <ul className="grid grid-cols-1 gap-0.5 text-xs sm:grid-cols-2">
          {checks.map((c) => (
            <li key={c.name} className={c.ok ? "text-emerald-800" : "text-red-700"}>{c.ok ? "✓" : "✗"} {c.name}{c.detail ? ` (${c.detail})` : ""}</li>
          ))}
        </ul>
      </div>

      {status?.status === "rejected" && <p className="rounded-md bg-stone-200 p-2 text-sm">Rejected — nothing was sent.</p>}
      {status?.status === "superseded" && <p className="rounded-md bg-stone-200 p-2 text-sm">Replaced by a newer draft.</p>}
      {(!status || status.status === "pending") && (
        <div className="space-y-2">
          {status && status.approvals.length > 0 && (
            <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">
              Approved by {status.approvals.map((a) => a.officer).join(", ")} — waiting for {status.approvalsNeeded - status.approvals.length} more officer (two-person rule for Danger).
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={onApprove} disabled={busy} className="flex-1 rounded-lg bg-red-700 px-4 py-3 font-semibold text-white hover:bg-red-600 disabled:opacity-60">
              Approve &amp; send <span lang="bn">· অনুমোদন ও প্রেরণ</span>
              <span className="block text-xs font-normal opacity-90">voice call · SMS · volunteers · loudspeakers · Telegram — {data.plan.total} {data.plan.source === "demo" ? "demo " : ""}households</span>
            </button>
            <button onClick={onReject} disabled={busy} className="rounded-lg border border-stone-300 px-3 text-sm hover:bg-stone-100">Reject</button>
          </div>
          <p className="text-xs text-stone-500">Approval code <b className="font-mono">{data.code}</b> — officers away from the dashboard can approve by replying <b className="font-mono">1 {data.code}</b> to the alert SMS (or tapping Approve in Telegram).</p>
        </div>
      )}
    </section>
  );
}
