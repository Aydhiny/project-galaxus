"use client";

// Where the city's sky comes from: search a town, use this device's location,
// or go back to Sarajevo. Saved coarse (~1 km) and never shown to visitors.

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, LocateFixed, MapPin, RotateCcw, Search } from "lucide-react";
import { findWeatherPlacesC, getWeatherPlaceC, saveWeatherPlaceC } from "@/lib/client/empire";

type Place = { lat: number; lon: number; name: string; detail?: string };

export function WeatherPlace({ onChanged }: { onChanged: () => void }) {
  const [current, setCurrent] = useState<Place | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [busy, start] = useTransition();

  useEffect(() => { getWeatherPlaceC().then(setCurrent).catch(() => {}); }, []);

  const save = (p: Place | null) => start(async () => {
    try {
      const saved = await saveWeatherPlaceC(p ? { lat: p.lat, lon: p.lon, name: p.name } : null);
      setCurrent(saved); setResults([]); setQ("");
      toast.success(`The sky now follows ${saved.name}.`);
      onChanged();
    } catch (e) { toast.error((e as Error).message); }
  });

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      try { const r = await findWeatherPlacesC(q); setResults(r); if (!r.length) toast.message("No places found."); }
      catch (err) { toast.error((err as Error).message); }
    });
  };

  const here = () => {
    if (!navigator.geolocation) { toast.error("This device can't share its location."); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => save({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: "My location" }),
      () => toast.error("Location permission was denied."),
      { maximumAge: 3_600_000, timeout: 10_000 },
    );
  };

  return (
    <div>
      <p className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Real weather</p>
      <p className="text-sm flex items-center gap-1.5"><MapPin className="w-4 h-4 text-muted-foreground" />The sky follows <b>{current?.name ?? "…"}</b></p>
      <form onSubmit={search} className="mt-2 flex gap-1.5">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a town" maxLength={60}
          className="flex-1 h-9 rounded-lg border border-border bg-background px-2.5 text-sm" />
        <button disabled={busy || q.trim().length < 2} className="h-9 w-9 rounded-lg border border-border inline-flex items-center justify-center disabled:opacity-40" aria-label="Search">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </button>
      </form>
      {results.length > 0 && (
        <ul className="mt-1.5 rounded-lg border border-border divide-y divide-border overflow-hidden">
          {results.map((r) => (
            <li key={`${r.lat},${r.lon}`}>
              <button onClick={() => save(r)} className="w-full text-left px-2.5 py-1.5 text-sm hover:bg-muted">
                {r.name} <span className="text-xs text-muted-foreground">{r.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex gap-1.5">
        <button onClick={here} disabled={busy} className="h-8 px-2.5 rounded-lg border border-border text-xs inline-flex items-center gap-1"><LocateFixed className="w-3.5 h-3.5" /> Use my location</button>
        <button onClick={() => save(null)} disabled={busy} className="h-8 px-2.5 rounded-lg border border-border text-xs inline-flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> Sarajevo</button>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">Live from Open-Meteo, refreshed every 15 minutes. Visitors never see your real weather.</p>
    </div>
  );
}
