"use client";

// Landing page: a live, explorable empire city (the same engine as the app,
// with demo data). three.js loads only when the section scrolls into view,
// and the render loop stops whenever it's off screen.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Building } from "@/lib/client/empire";
import type { EmpireEngine } from "@/components/empire/engine";

const DEMO: Building[] = ([
  ["hq", "castle", "HQ", "🏰", 5], ["radar", "tower", "Gig Radar", "📡", 4], ["autopilot", "factory", "Autopilot", "🏭", 3],
  ["deals", "bank", "Deal Desk", "🏦", 3], ["outreach", "office", "Outreach", "🏢", 4], ["vault", "vault", "Money", "💰", 3],
  ["news", "news", "Daily Brief", "📰", 2], ["runner", "factory", "AI Runner", "🤖", 3], ["community", "hall", "Community", "🏛️", 2],
  ["studio", "studio", "Game Studio", "🎮", 4], ["youtube", "studio", "YouTube", "🎬", 3], ["mosque", "mosque", "Faith", "🕌", 3],
  ["library", "library", "Library", "📚", 4], ["gym", "gym", "Gym", "💪", 3], ["home", "house", "Home", "🏡", 2],
] as const).map(([id, kind, label, emoji, level]) => ({ id, kind, label, emoji, level, active: true, working: ["radar", "autopilot", "outreach", "runner"].includes(id), route: "/", status: "", bubbles: [], stats: [] }) as Building);

export function MarketingEmpire() {
  const { status } = useSession();
  const host = useRef<HTMLDivElement>(null);
  const section = useRef<HTMLElement>(null);
  const engine = useRef<EmpireEngine | null>(null);
  const [night, setNight] = useState(false);

  useEffect(() => {
    const el = section.current;
    if (!el) return;
    let disposed = false;
    const io = new IntersectionObserver(async ([entry]) => {
      if (entry.isIntersecting && !engine.current && host.current) {
        const { EmpireEngine } = await import("@/components/empire/engine");
        if (disposed || !host.current) return;
        const e = new EmpireEngine(host.current);
        e.setBuildings(DEMO);
        e.setTimeOfDay(12);
        engine.current = e;
      }
      engine.current?.setActive(entry.isIntersecting);
    }, { threshold: 0.15 });
    io.observe(el);
    return () => { disposed = true; io.disconnect(); engine.current?.dispose(); engine.current = null; };
  }, []);

  const authed = status === "authenticated";
  return (
    <section ref={section} id="empire" className="relative py-24 sm:py-32 px-4 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <p className="section-label mb-3">Your empire</p>
          <h2 className="font-heading text-3xl sm:text-5xl font-bold tracking-tight">Watch your life run like a city</h2>
          <p className="mt-4 text-muted-foreground">Every system you build becomes a building. Automations light up the windows, factories smoke while they work, and the whole city grows as you level up. Drag to explore.</p>
        </div>
        <div className="relative rounded-3xl overflow-hidden border border-border bg-[#bfdcf0] aspect-[4/5] sm:aspect-[16/10] lg:aspect-[16/8]">
          <div ref={host} className="absolute inset-0" />
          <div className="absolute top-3 right-3 flex rounded-xl bg-black/55 backdrop-blur-md p-0.5">
            {([[false, Sun, "Day"], [true, Moon, "Night"]] as const).map(([n, Icon, t]) => (
              <button key={t} onClick={() => { setNight(n); engine.current?.setTimeOfDay(n ? 22 : 12); }} title={t}
                className={cn("w-9 h-9 rounded-lg flex items-center justify-center", night === n ? "bg-white text-black" : "text-white/80")}>
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            <Link href={authed ? "/empire" : "/register"} className="inline-flex items-center gap-2 h-11 px-5 whitespace-nowrap text-sm sm:text-base rounded-full bg-white text-black font-semibold shadow-xl hover:scale-105 transition-transform">
              {authed ? "Open your empire" : "Build your empire — free"} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
