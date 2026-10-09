"use client";

import { useState } from "react";

export type SessionInfo = { officer: { id: string; name: string; role: string } | null; demoMode: boolean; demoPin?: string };
type AuditEntry = { at: string; who: string; action: string; areaId?: string; detail?: string };

export default function OfficerBar({ session, onChange, askLogin, setAskLogin }: {
  session: SessionInfo | null;
  onChange: () => void;
  askLogin: boolean;
  setAskLogin: (v: boolean) => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<AuditEntry[] | null>(null);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
    const j = await res.json();
    if (!res.ok) return setError(j.error);
    setPin("");
    setError(null);
    setAskLogin(false);
    onChange();
  }

  async function logout() {
    await fetch("/api/session", { method: "DELETE" });
    setLog(null);
    onChange();
  }

  async function openLog() {
    const j = await fetch("/api/audit").then((r) => r.json());
    setLog(j.entries ?? []);
  }

  const officer = session?.officer;
  return (
    <div className="flex items-center gap-2 text-sm">
      {session?.demoMode && (
        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900" title="No officers configured: nothing can be sent to real phones">DEMO MODE</span>
      )}
      {officer ? (
        <>
          <span className="text-stone-600">👤 {officer.name}</span>
          <button onClick={openLog} className="rounded border border-stone-300 px-2 py-1 text-xs hover:bg-stone-100">Activity log</button>
          <button onClick={logout} className="rounded border border-stone-300 px-2 py-1 text-xs hover:bg-stone-100">Sign out</button>
        </>
      ) : (
        <button onClick={() => setAskLogin(true)} className="rounded-md bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white">Officer sign in</button>
      )}

      {askLogin && !officer && (
        <div className="fixed inset-0 z-[2000] grid place-items-center bg-black/40 p-4" onClick={() => setAskLogin(false)}>
          <form onSubmit={login} onClick={(e) => e.stopPropagation()} className="w-full max-w-xs space-y-3 rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-bold">Officer sign in</h2>
            <p className="text-xs text-stone-500">Only union / upazila disaster officers can draft and send alerts. Every action is recorded in the activity log.</p>
            <input autoFocus type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN"
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-lg tracking-widest" aria-label="PIN" />
            {session?.demoMode && (
              <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">
                Demo mode — PIN is <b>{session.demoPin}</b>. Real sending is disabled until officers are added (<code>npm run officers</code>).
              </p>
            )}
            {error && <p className="text-sm text-red-700">{error}</p>}
            <button className="w-full rounded-lg bg-stone-900 py-2 font-semibold text-white">Sign in</button>
          </form>
        </div>
      )}

      {log && (
        <div className="fixed inset-0 z-[2000] grid place-items-center bg-black/40 p-4" onClick={() => setLog(null)}>
          <div onClick={(e) => e.stopPropagation()} className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">Activity log</h2>
              <button onClick={() => setLog(null)} className="text-stone-500" aria-label="Close">✕</button>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="text-stone-500">
                <tr><th className="p-1">Time</th><th className="p-1">Who</th><th className="p-1">Action</th><th className="p-1">Details</th></tr>
              </thead>
              <tbody>
                {log.map((e, i) => (
                  <tr key={i} className="border-t border-stone-100 align-top">
                    <td className="whitespace-nowrap p-1">{new Date(e.at).toLocaleString()}</td>
                    <td className="p-1">{e.who}</td>
                    <td className="p-1">{e.action}{e.areaId ? ` · ${e.areaId}` : ""}</td>
                    <td className="p-1 text-stone-500">{e.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {log.length === 0 && <p className="text-sm text-stone-500">No activity yet.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
