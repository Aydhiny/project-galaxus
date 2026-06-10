"use client";

import { useEffect, useState, useRef } from "react";
import { useAmbientStore } from "@/lib/store/ambient";

const IDLE_MS = 3 * 60 * 1000; // 3 minutes

const QUOTES = [
  { text: "Whoever treads a path seeking knowledge, Allah will make easy for him the path to Jannah.", source: "Muslim" },
  { text: "The best of you are those who are best to their families.", source: "Tirmidhi" },
  { text: "Take benefit of five before five: your youth before your old age, your health before your sickness.", source: "Ibn Abbas" },
  { text: "Be in this world as if you were a stranger or a traveller along a path.", source: "Bukhari" },
  { text: "Verily, with hardship comes ease.", source: "Quran 94:5" },
  { text: "The strong person is not the one who overcomes people — it is the one who controls himself when angry.", source: "Bukhari" },
  { text: "Discipline is the bridge between goals and accomplishment.", source: "Jim Rohn" },
  { text: "Small daily improvements over time lead to stunning results.", source: "" },
  { text: "Do not lose hope, nor be sad.", source: "Quran 3:139" },
];

/* Analog clock SVG */
function AnalogClock({ now }: { now: Date }) {
  const h = now.getHours() % 12;
  const m = now.getMinutes();
  const s = now.getSeconds();

  const secDeg  = s * 6;
  const minDeg  = m * 6 + s * 0.1;
  const hourDeg = h * 30 + m * 0.5;

  return (
    <svg viewBox="0 0 200 200" style={{ width: 220, height: 220 }}>
      {/* Face */}
      <circle cx="100" cy="100" r="94" fill="none" stroke="oklch(1 0 0 / 8%)" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="90" fill="oklch(0 0 0 / 35%)" />
      {/* Hour marks */}
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * 30 - 90) * (Math.PI / 180);
        const r1 = 75, r2 = i % 3 === 0 ? 82 : 78;
        return (
          <line key={i}
            x1={100 + r1 * Math.cos(a)} y1={100 + r1 * Math.sin(a)}
            x2={100 + r2 * Math.cos(a)} y2={100 + r2 * Math.sin(a)}
            stroke={i % 3 === 0 ? "oklch(1 0 0 / 60%)" : "oklch(1 0 0 / 25%)"}
            strokeWidth={i % 3 === 0 ? 2 : 1} strokeLinecap="round" />
        );
      })}
      {/* Hour hand */}
      <line x1="100" y1="100" x2={100 + 52 * Math.sin(hourDeg * Math.PI / 180)} y2={100 - 52 * Math.cos(hourDeg * Math.PI / 180)}
        stroke="oklch(1 0 0 / 90%)" strokeWidth="4" strokeLinecap="round" />
      {/* Minute hand */}
      <line x1="100" y1="100" x2={100 + 70 * Math.sin(minDeg * Math.PI / 180)} y2={100 - 70 * Math.cos(minDeg * Math.PI / 180)}
        stroke="oklch(1 0 0 / 80%)" strokeWidth="2.5" strokeLinecap="round" />
      {/* Second hand */}
      <line x1={100 - 16 * Math.sin(secDeg * Math.PI / 180)} y1={100 + 16 * Math.cos(secDeg * Math.PI / 180)}
            x2={100 + 78 * Math.sin(secDeg * Math.PI / 180)} y2={100 - 78 * Math.cos(secDeg * Math.PI / 180)}
        stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" />
      {/* Centre dot */}
      <circle cx="100" cy="100" r="4" fill="var(--gold)" />
    </svg>
  );
}

export function Screensaver() {
  const [active, setActive] = useState(false);
  const [now, setNow] = useState(new Date());
  const [quoteIdx, setQuoteIdx] = useState(0);
  const [fadeIn, setFadeIn] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { rainVol, fireVol, brownVol } = useAmbientStore();

  /* Inactivity timer */
  const resetTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setActive(true), IDLE_MS);
  };

  useEffect(() => {
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"] as const;
    const dismiss = () => {
      if (active) { setActive(false); setFadeIn(false); }
      resetTimer();
    };
    events.forEach(ev => window.addEventListener(ev, dismiss, { passive: true }));
    resetTimer();
    return () => {
      events.forEach(ev => window.removeEventListener(ev, dismiss));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [active]);

  /* Clock tick */
  useEffect(() => {
    if (!active) return;
    const iv = setInterval(() => setNow(new Date()), 1000);
    setFadeIn(true);
    return () => clearInterval(iv);
  }, [active]);

  /* Rotate quotes every 20s */
  useEffect(() => {
    if (!active) return;
    const iv = setInterval(() => setQuoteIdx(i => (i + 1) % QUOTES.length), 20000);
    return () => clearInterval(iv);
  }, [active]);

  if (!active) return null;

  const q = QUOTES[quoteIdx];
  const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const sounds = [rainVol > 0 && "Rain", fireVol > 0 && "Fire", brownVol > 0 && "Brown"].filter(Boolean).join(" · ");

  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col items-center justify-center"
      style={{
        background: "oklch(0 0 0 / 85%)",
        backdropFilter: "blur(2px)",
        opacity: fadeIn ? 1 : 0,
        transition: "opacity 1.2s ease",
      }}
    >
      {/* Clock + time */}
      <div className="flex flex-col items-center gap-2">
        <AnalogClock now={now} />
        <p className="text-5xl font-bold tabular-nums text-foreground/90" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-0.02em" }}>
          {timeStr}
        </p>
        <p className="text-sm text-muted-foreground tracking-wider uppercase">{dateStr}</p>
      </div>

      {/* Active sounds indicator */}
      {sounds && (
        <p className="mt-6 text-xs text-muted-foreground/60 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--gold)] animate-pulse" />
          {sounds}
        </p>
      )}

      {/* Quote */}
      <div className="mt-12 max-w-md text-center px-8 space-y-2">
        <p className="text-base text-foreground/70 italic leading-relaxed" style={{ fontFamily: "var(--font-heading)" }}>
          &ldquo;{q.text}&rdquo;
        </p>
        {q.source && <p className="text-xs text-muted-foreground/50">— {q.source}</p>}
      </div>

      {/* Dismiss hint */}
      <p className="mt-12 text-[10px] text-muted-foreground/30 uppercase tracking-[0.2em]">
        Move mouse or press any key to return
      </p>
    </div>
  );
}
