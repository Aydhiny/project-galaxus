"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Cloud, CloudRain, Flame, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPublicEmpireC, type PublicEmpire } from "@/lib/client/empire";
import type { EmpireEngine } from "./engine";

const hud = "font-hud uppercase tracking-wide";
const ICON = { sun: Sun, clouds: Cloud, rain: CloudRain } as const;

/** Someone else's city, read-only: shapes, levels, weather, streak — nothing personal. */
export function VisitView({ userId }: { userId: number }) {
  const mount = useRef<HTMLDivElement>(null);
  const engine = useRef<EmpireEngine | null>(null);
  const [city, setCity] = useState<PublicEmpire | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    Promise.all([import("./engine"), getPublicEmpireC(userId)]).then(([{ EmpireEngine }, data]) => {
      if (disposed || !mount.current) return;
      const e = new EmpireEngine(mount.current);
      e.onPick = (id) => e.focus(id);
      engine.current = e;
      e.setActive(true);
      e.setStyle(data.style);
      e.setBuildings(data.buildings);
      e.setWorld(data.world, null);
      setCity(data);
    }).catch((err) => setError((err as Error).message));
    return () => { disposed = true; engine.current?.dispose(); engine.current = null; };
  }, [userId]);

  const Icon = city ? ICON[city.world.week.kind] : Sun;
  return (
    <div className="absolute inset-0 z-20 overflow-hidden bg-[#bfdcf0]">
      <div ref={mount} className="absolute inset-0" />
      <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-20 max-w-[calc(100%-1.5rem)] rounded-2xl bg-black/55 text-white backdrop-blur-md px-3 py-2 sm:px-4 sm:py-3">
        <Link href="/empire/world" className="text-[11px] text-white/70 hover:text-white inline-flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> World</Link>
        <p className={cn("text-lg sm:text-2xl leading-none mt-1 truncate", hud)}>{city ? city.name : error ? "Not available" : "Flying in…"}</p>
        {city && (
          <p className="mt-1.5 text-[11px] text-white/70 flex flex-wrap items-center gap-2">
            <span>LV {city.level} · {city.rank}</span>
            <span className="inline-flex items-center gap-1"><Flame className="w-3 h-3" />{city.world.streak}</span>
            <span className="inline-flex items-center gap-1"><Icon className="w-3 h-3" />{city.world.week.kind === "sun" ? "sunny" : city.world.week.kind === "clouds" ? "cloudy" : "rainy"} week</span>
          </p>
        )}
        {error && <p className="mt-1 text-xs text-white/70">{error}</p>}
      </div>
    </div>
  );
}
