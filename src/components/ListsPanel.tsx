"use client";

import { useEffect, useState } from "react";

type Info = { households: number; withPhone: number; contacts: { name: string; role: string }[]; uploadedAt: string | null; stale: boolean };

export default function ListsPanel({ areaId }: { areaId: string }) {
  const [info, setInfo] = useState<{ areaId: string; data: Info } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    fetch(`/api/lists?areaId=${areaId}`).then((r) => r.json()).then((data) => setInfo({ areaId, data })).catch(() => {});
  }, [areaId, version]);

  async function upload(kind: "households" | "contacts", file: File) {
    const res = await fetch("/api/lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ areaId, kind, csv: await file.text() }) });
    const j = await res.json();
    setMsg(res.ok ? `Saved ${j.saved} ${kind}${j.errors?.length ? ` · ${j.errors.length} row(s) skipped: ${j.errors[0]}` : ""}` : j.error);
    setVersion((v) => v + 1);
  }

  const d = info?.areaId === areaId ? info.data : null;
  const vols = d?.contacts.filter((c) => c.role === "volunteer").length ?? 0;
  const anns = d?.contacts.filter((c) => c.role === "announcer").length ?? 0;
  return (
    <details className="rounded-lg border border-stone-200 p-3 text-sm">
      <summary className="cursor-pointer font-semibold">Recipients for this area <span className="font-normal text-stone-500">
        — {d?.households ? `${d.households} households (${d.withPhone} with phone)` : "demo households"} · {vols} volunteers · {anns} announcers</span></summary>
      <div className="mt-2 space-y-2 text-xs">
        <p className="text-stone-600">Upload the union&apos;s own lists (CSV, e.g. saved from Excel). Real phone numbers come only from these files.</p>
        <label className="block">Household list · <a className="text-sky-700 underline" href="/templates/households.csv" download>template</a>
          <input type="file" accept=".csv,text/csv" className="mt-1 block w-full" onChange={(e) => e.target.files?.[0] && upload("households", e.target.files[0])} />
        </label>
        <label className="block">Volunteers &amp; announcers (imams, CPP) · <a className="text-sky-700 underline" href="/templates/contacts.csv" download>template</a>
          <input type="file" accept=".csv,text/csv" className="mt-1 block w-full" onChange={(e) => e.target.files?.[0] && upload("contacts", e.target.files[0])} />
        </label>
        {d?.stale && <p className="rounded bg-amber-50 p-1.5 text-amber-900">This list is more than a year old — please ask the union to update it.</p>}
        {d?.uploadedAt && <p className="text-stone-500">List uploaded {new Date(d.uploadedAt).toLocaleDateString()}.</p>}
        <p className="text-stone-500">Only include households that agreed (consent column = yes). Lists stay on this computer.</p>
        {(d?.households || d?.contacts.length) ? (
          <button className="rounded border border-red-300 px-2 py-1 text-red-700 hover:bg-red-50" onClick={async () => {
            if (!confirm("Delete this area's household and contact lists? This cannot be undone.")) return;
            await fetch(`/api/lists?areaId=${areaId}`, { method: "DELETE" });
            setMsg("Lists deleted.");
            setVersion((v) => v + 1);
          }}>Delete this area&apos;s lists</button>
        ) : null}
        {msg && <p className="rounded bg-stone-100 p-1.5">{msg}</p>}
      </div>
    </details>
  );
}
