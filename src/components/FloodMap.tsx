"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import { useEffect } from "react";
import geo from "@/data/geo.json";
import { LEVELS, type Area, type Assessment, type Station } from "@/lib/types";
import type { RescuePin } from "./DispatchPanel";

const areas = geo.areas as Area[];
const stations = Object.fromEntries((geo.stations as Station[]).map((s) => [s.id, s]));

function FitTo({ ids: idList, selected }: { ids: string[] | null; selected: string | null }) {
  const map = useMap();
  const idsKey = idList?.join(",") ?? "";
  useEffect(() => {
    const ids = idsKey ? idsKey.split(",") : null;
    const sel = areas.find((a) => a.id === selected);
    if (sel) {
      map.flyTo([sel.lat, sel.lon], 11, { duration: 0.8 });
      return;
    }
    const pts = ids?.length ? areas.filter((a) => ids.includes(a.id)) : areas;
    const ups = pts.flatMap((a) => a.upstream.map((u) => stations[u.station]));
    const all = [...pts, ...ups].map((p) => [p.lat, p.lon] as [number, number]);
    map.fitBounds(all, { padding: [30, 30], maxZoom: ids?.length ? 9 : 7 });
  }, [idsKey, selected, map]);
  return null;
}

export default function FloodMap({
  assessments,
  selected,
  onSelect,
  focus,
  rescues,
}: {
  assessments: Assessment[];
  selected: string | null;
  onSelect: (id: string) => void;
  focus: string[] | null;
  rescues: RescuePin[];
}) {
  const byId = Object.fromEntries(assessments.map((a) => [a.areaId, a]));
  const activeFlows = areas.flatMap((area) => {
    const a = byId[area.id];
    if (!a) return [];
    return a.signals
      .filter((s) => s.kind === "upstream_rain" && s.level >= 1)
      .map((s) => {
        const up = area.upstream.find((u) => stations[u.station].name === s.where)!;
        return { key: `${area.id}-${up.station}`, from: stations[up.station], to: area, level: s.level };
      });
  });
  const wetStations = new Set(activeFlows.map((f) => f.from.id));

  return (
    <MapContainer center={[24.0, 90.6]} zoom={7} className="h-full w-full" scrollWheelZoom>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FitTo ids={focus} selected={selected} />
      {activeFlows.map((f) => (
        <Polyline key={f.key} positions={[[f.from.lat, f.from.lon], [f.to.lat, f.to.lon]]} pathOptions={{ color: LEVELS[f.level].color, weight: 2, dashArray: "6 6", opacity: 0.8 }} />
      ))}
      {Object.values(stations).map((s) => (
        <CircleMarker key={s.id} center={[s.lat, s.lon]} radius={wetStations.has(s.id) ? 7 : 4}
          pathOptions={{ color: "#1d4ed8", fillColor: wetStations.has(s.id) ? "#3b82f6" : "#93c5fd", fillOpacity: 0.9, weight: 1 }}>
          <Tooltip>
            <div className="text-xs"><b>Upstream rain gauge</b><br />{s.name}<br /><span lang="bn">{s.nameBn}</span></div>
          </Tooltip>
        </CircleMarker>
      ))}
      {areas.map((area) => {
        const a = byId[area.id];
        const level = a?.level ?? 0;
        const isSel = selected === area.id;
        return (
          <CircleMarker key={area.id} center={[area.lat, area.lon]} radius={6 + level * 3 + (isSel ? 3 : 0)}
            eventHandlers={{ click: () => onSelect(area.id) }}
            pathOptions={{ color: isSel ? "#111827" : "#ffffff", weight: isSel ? 3 : 1.5, fillColor: LEVELS[level].color, fillOpacity: 0.95 }}>
            <Tooltip direction="top" offset={[0, -6]}>
              <div className="text-xs"><b lang="bn">{area.nameBn}</b> · {area.name}<br />{LEVELS[level].en} <span lang="bn">({LEVELS[level].bn})</span></div>
            </Tooltip>
          </CircleMarker>
        );
      })}
      {rescues.map((p, i) => (
        <CircleMarker key={`${p.label}-${i}`} center={[p.lat, p.lon]} radius={p.live ? 10 : 5}
          pathOptions={{ color: p.live ? "#7f1d1d" : "#ffffff", weight: p.live ? 3 : 1, fillColor: "#dc2626", fillOpacity: 1 }}>
          <Tooltip permanent={p.live} direction="right">
            <div className="text-xs"><b>🆘 {p.live ? "Help requested (live)" : "Help requested"}</b><br /><span lang="bn">{p.label}</span></div>
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
