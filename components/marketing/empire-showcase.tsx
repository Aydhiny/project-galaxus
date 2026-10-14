"use client";

// Landing page hero visual: a live, explorable empire city (the same engine as
// the app, with demo data). three.js loads only when it scrolls into view, and
// the render loop stops whenever it's off screen.

import { useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Building, World, WorldEvent } from "@/lib/client/empire";
import type { EmpireEngine } from "@/components/empire/engine";

const DEMO: Building[] = ([
  ["hq", "castle", "HQ", "🏰", 5], ["radar", "tower", "Gig Radar", "📡", 4], ["autopilot", "factory", "Autopilot", "🏭", 3],
  ["deals", "bank", "Deal Desk", "🏦", 3], ["outreach", "office", "Outreach", "🏢", 4], ["vault", "vault", "Money", "💰", 3],
  ["news", "news", "Daily Brief", "📰", 2], ["runner", "factory", "AI Runner", "🤖", 3], ["community", "hall", "Community", "🏛️", 2],
  ["studio", "studio", "Game Studio", "🎮", 4], ["youtube", "studio", "YouTube", "🎬", 3], ["mosque", "mosque", "Faith", "🕌", 3],
  ["library", "library", "Library", "📚", 4], ["gym", "gym", "Gym", "💪", 3], ["home", "house", "Home", "🏡", 2],
] as const).map(([id, kind, label, emoji, level]) => ({ id, kind, label, emoji, level, active: true, working: ["radar", "autopilot", "outreach", "runner"].includes(id), route: "/", status: "", bubbles: [], stats: [] }) as Building);

const DEMO_WORLD: World = {
  weather: { kind: "sun", intensity: 0, tempC: 21, label: "Clear", place: "", isDay: true, live: false }, week: { kind: "sun", score: 82, why: "" },
  ops: { agents: 5, working: 3, waiting: 0 }, streak: 21, gold: 0.6, neglected: [], events: [], radarScanning: true, distracted: false,
  citizens: [
    { id: 1, name: "Fajr", streak: 32, doneToday: true, sad: false }, { id: 2, name: "Workout", streak: 15, doneToday: true, sad: false },
    { id: 3, name: "Read 10 pages", streak: 8, doneToday: false, sad: false }, { id: 4, name: "Devlog", streak: 0, doneToday: false, sad: true },
  ],
  sky: [{ key: "coding", label: "Coding", level: 12 }, { key: "music", label: "Music", level: 9 }, { key: "faith", label: "Faith", level: 7 }, { key: "fitness", label: "Fitness", level: 5 }, { key: "mind", label: "Mind", level: 6 }, { key: "editing", label: "Editing", level: 4 }, { key: "hustle", label: "Hustle", level: 8 }, { key: "discipline", label: "Discipline", level: 10 }],
  season: { kind: "autumn", ramadan: false, eid: false },
  goals: [
    { id: 1, title: "Ship the game demo", emoji: "🎮", progress: 0.55, done: false },
    { id: 2, title: "First 1,000 subscribers", emoji: "🎬", progress: 1, done: true },
  ],
  airships: [
    { id: 1, title: "Global AI Hackathon", kind: "hackathon", deadline: null, score: 80 },
    { id: 2, title: "Indie Game Jam", kind: "jam", deadline: null, score: 75 },
  ],
};
// A little traffic so the demo city shows what real events look like.
const DEMO_EVENTS: WorldEvent[] = [
  { id: "m", type: "mail", at: "", label: "" }, { id: "j", type: "job", at: "", label: "", target: "outreach" },
  { id: "r", type: "reply", at: "", label: "" }, { id: "h", type: "hotgig", at: "", label: "" },
  { id: "$", type: "money", at: "", label: "", amount: 450, source: "retainer" },
];

export function EmpireCanvas({ className }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const engine = useRef<EmpireEngine | null>(null);
  const [night, setNight] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    let disposed = false;
    let demoTimer: ReturnType<typeof setInterval> | null = null;
    const io = new IntersectionObserver(async ([entry]) => {
      if (entry.isIntersecting && !engine.current && host.current) {
        const { EmpireEngine } = await import("@/components/empire/engine");
        if (disposed || !host.current) return;
        const e = new EmpireEngine(host.current);
        e.setBuildings(DEMO);
        e.setWorld(DEMO_WORLD, null);
        e.setTimeOfDay(12);
        engine.current = e;
        setReady(true);
        let k = 0;
        demoTimer = setInterval(() => { if (!document.hidden) engine.current?.event(DEMO_EVENTS[k++ % DEMO_EVENTS.length]); }, 3500);
      }
      engine.current?.setActive(entry.isIntersecting);
    }, { threshold: 0.1 });
    io.observe(el);
    return () => { disposed = true; io.disconnect(); if (demoTimer) clearInterval(demoTimer); engine.current?.dispose(); engine.current = null; };
  }, []);

  return (
    <div ref={wrap} className={cn("relative overflow-hidden bg-[#bfdcf0]", className)}>
      <div ref={host} className="absolute inset-0" />
      {!ready && <div className="absolute inset-0 animate-pulse bg-gradient-to-b from-[#cfe6f5] to-[#a9cf98]" />}
      <div className="absolute top-3 right-3 flex rounded-xl bg-black/55 backdrop-blur-md p-0.5">
        {([false, true] as const).map((n) => (
          <button key={String(n)} onClick={() => { setNight(n); engine.current?.setTimeOfDay(n ? 22 : 12); }} aria-label={n ? "Night" : "Day"}
            className={cn("w-8 h-8 rounded-lg flex items-center justify-center", night === n ? "bg-white text-black" : "text-white/80")}>
            {n ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
        ))}
      </div>
    </div>
  );
}
