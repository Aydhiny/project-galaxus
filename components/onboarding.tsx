"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Sun, Moon, CheckSquare, Dumbbell, Music2,
  ChevronRight, X, Home, Target, Sparkles,
} from "lucide-react";
import confetti from "canvas-confetti";

const ONBOARDING_KEY = "galaxus-onboarded-v1";

/* ── Steps ────────────────────────────────────────────────────────────────── */

const STEPS = [
  {
    id: "welcome",
    glyph: "✦",
    glyphColor: "#173eff",
    glowColor: "#173eff",
    title: "As-salamu alaykum.",
    subtitle: "Welcome to Galaxus",
    body: "Your personal universe of growth, faith, and creativity. This is your space. Let's show you around — it takes less than a minute.",
    href: null,
  },
  {
    id: "overview",
    Icon: Sun,
    glowColor: "#f59e0b",
    title: "Start every day with intention.",
    subtitle: "Morning & Evening Ritual",
    body: "Set your mood, word of intention, and top 3 priorities each morning. Each evening: review habits, rate your day, and log gratitude. This is the heartbeat of Galaxus.",
    href: "/overview",
  },
  {
    id: "checkin",
    Icon: CheckSquare,
    glowColor: "#10b981",
    title: "Build habits that stick.",
    subtitle: "Daily Check-in",
    body: "Log all 5 prayers, training, music, reading, writing, and meditation in one tap. Streaks build momentum — every day you show up counts.",
    href: "/daily",
  },
  {
    id: "feed",
    Icon: Home,
    glowColor: "#173eff",
    title: "Your command center.",
    subtitle: "The Feed",
    body: "At a glance: streak rings for every habit, today's check-in status, the Hijri date, and a daily Islamic quote to ground you. Everything in one view.",
    href: "/dashboard",
  },
  {
    id: "spiritual",
    Icon: Moon,
    glowColor: "#a78bfa",
    title: "Deepen your connection.",
    subtitle: "Spiritual Hub",
    body: "Track all 5 prayers, Quran pages, and dhikr counts. Built-in Qibla compass, duas library, and streak fire to keep you consistent.",
    href: "/spiritual",
  },
  {
    id: "body",
    Icon: Dumbbell,
    glowColor: "#f97316",
    title: "Strengthen the vessel.",
    subtitle: "Body & Mind",
    body: "Log training sessions with exercises and sets. Track meditation minutes. Monitor body metrics over time. Strong body, strong mind, strong deen.",
    href: "/training",
  },
  {
    id: "goals",
    Icon: Target,
    glowColor: "#ec4899",
    title: "Dream. Plan. Execute.",
    subtitle: "Goals & Review",
    body: "Set long-term goals, break them into milestones, and review your week every Sunday. Your year-in-review shows how far you've come.",
    href: "/goals",
  },
  {
    id: "creative",
    Icon: Music2,
    glowColor: "#f59e0b",
    title: "Feed your soul.",
    subtitle: "Creative & Journal",
    body: "Catalogue your beats with audio playback. Write journal entries. Track books you're reading. Your creative life deserves a home too.",
    href: "/creative",
  },
  {
    id: "done",
    Icon: Sparkles,
    glowColor: "#173eff",
    title: "Bismillah.",
    subtitle: "Your universe is ready.",
    body: "Everything is set up. Go build the best version of yourself — one day at a time. We'll be here tracking every step of the journey.",
    href: null,
  },
] as const;

/* ── Deterministic stars (no random at render — avoids hydration mismatch) ── */

const STARS = Array.from({ length: 90 }, (_, i) => ({
  left:     ((i * 13 + 7)  % 97),
  size:     1 + (i % 3) * 0.8,
  delay:    (i * 0.19)     % 6,
  duration: 4 + (i % 5),
  opacity:  0.25 + (i % 6) * 0.08,
  twinkle:  i % 4 === 0,
}));

/* ── Component ────────────────────────────────────────────────────────────── */

export function OnboardingFlow() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [step, setStep]       = useState(0);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(ONBOARDING_KEY)) setVisible(true);
  }, []);

  const finish = useCallback(() => {
    localStorage.setItem(ONBOARDING_KEY, "1");
    setVisible(false);
  }, []);

  const goNext = useCallback(() => {
    if (step === STEPS.length - 1) {
      confetti({
        particleCount: 160,
        spread: 90,
        origin: { y: 0.55 },
        colors: ["#173eff", "#a78bfa", "#f59e0b", "#10b981", "#ffffff"],
        scalar: 1.1,
      });
      setTimeout(finish, 900);
      return;
    }
    setExiting(true);
    setTimeout(() => { setStep(s => s + 1); setExiting(false); }, 180);
  }, [step, finish]);

  const skip = useCallback(() => {
    setExiting(true);
    setTimeout(finish, 200);
  }, [finish]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!visible) return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goNext(); }
      if (e.key === "Escape") skip();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, goNext, skip]);

  if (!visible) return null;

  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;
  const prog    = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center">
      {/* ── Dark starfield backdrop ────────────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 50% 30%, #0d1633 0%, #070b18 60%, #02040e 100%)" }}
      />

      {/* ── Ambient glows ─────────────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full blur-[140px] opacity-20 bg-[#173eff]" />
        <div className="absolute bottom-[-5%] right-1/4 w-[500px] h-[300px] rounded-full blur-[120px] opacity-10 bg-[#a78bfa]" />
        <div className="absolute top-1/3 left-0 w-[300px] h-[300px] rounded-full blur-[100px] opacity-8 bg-[#0ea5e9]" />
      </div>

      {/* ── Falling stars ─────────────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {STARS.map((s, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${s.left}%`,
              top: "-20px",
              width:  `${s.size}px`,
              height: `${s.size * 3}px`,
              opacity: s.opacity,
              background: i % 3 === 0
                ? "linear-gradient(180deg, #ffffff 0%, #173eff80 100%)"
                : i % 3 === 1
                ? "linear-gradient(180deg, #ffffff 0%, #a78bfa80 100%)"
                : "linear-gradient(180deg, #f59e0b 0%, transparent 100%)",
              animation: s.twinkle
                ? `star-twinkle ${s.duration * 0.6}s ease-in-out ${s.delay}s infinite`
                : `star-fall ${s.duration}s linear ${s.delay}s infinite`,
            }}
          />
        ))}
      </div>

      {/* ── Skip button ───────────────────────────────────────────── */}
      <button
        onClick={skip}
        className="absolute top-5 right-5 z-10 flex items-center gap-1.5 text-white/30 hover:text-white/60 transition-colors text-sm px-3 py-1.5 rounded-xl hover:bg-white/5"
      >
        <X className="w-3.5 h-3.5" /> Skip tour
      </button>

      {/* ── Progress bar ──────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/5">
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{
            width: `${prog}%`,
            background: "linear-gradient(90deg, #173eff, #a78bfa)",
            boxShadow: "0 0 8px #173eff80",
          }}
        />
      </div>

      {/* ── Step card ─────────────────────────────────────────────── */}
      <div
        className="relative z-10 w-full max-w-lg mx-5"
        style={{
          animation: exiting
            ? "none"
            : "onboard-step-in 0.35s cubic-bezier(0.22,1,0.36,1) both",
          opacity: exiting ? 0 : 1,
          transform: exiting ? "translateY(12px) scale(0.97)" : undefined,
          transition: exiting ? "opacity 0.18s ease, transform 0.18s ease" : undefined,
        }}
      >
        <div
          className="rounded-3xl border border-white/[0.09] p-8 md:p-10 relative overflow-hidden"
          style={{
            background: "rgba(8, 12, 28, 0.88)",
            backdropFilter: "blur(40px) saturate(180%)",
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 40px 100px rgba(0,0,0,0.7), 0 0 60px ${current.glowColor}20`,
            animation: "onboard-glow-pulse 3s ease-in-out infinite",
          }}
        >
          {/* Corner accent */}
          <div
            className="absolute top-0 right-0 w-40 h-40 rounded-full blur-[60px] opacity-20 pointer-events-none"
            style={{ background: current.glowColor, transform: "translate(40%, -40%)" }}
          />

          {/* Icon */}
          <div className="flex justify-center mb-7">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center relative"
              style={{
                background: `radial-gradient(circle at 35% 35%, ${current.glowColor}30 0%, ${current.glowColor}08 100%)`,
                border: `1px solid ${current.glowColor}35`,
                boxShadow: `0 0 40px ${current.glowColor}25, inset 0 1px 0 ${current.glowColor}20`,
              }}
            >
              {"glyph" in current ? (
                <span
                  className="text-4xl font-bold"
                  style={{ color: current.glowColor, filter: `drop-shadow(0 0 12px ${current.glowColor})` }}
                >
                  {current.glyph}
                </span>
              ) : (
                <current.Icon
                  className="w-9 h-9"
                  style={{ color: current.glowColor, filter: `drop-shadow(0 0 10px ${current.glowColor}90)` }}
                />
              )}

              {/* Orbiting dot */}
              <div
                className="absolute w-2.5 h-2.5 rounded-full"
                style={{
                  background: current.glowColor,
                  boxShadow: `0 0 8px ${current.glowColor}`,
                  top: "-5px", right: "-5px",
                  animation: "pulse-glow 1.5s ease-in-out infinite",
                }}
              />
            </div>
          </div>

          {/* Text */}
          <div className="text-center space-y-3 mb-8">
            <p
              className="text-[11px] font-bold uppercase tracking-[0.22em]"
              style={{ color: current.glowColor }}
            >
              {current.subtitle}
            </p>
            <h2
              className="text-2xl md:text-3xl font-bold text-white leading-tight"
              style={{ fontFamily: "var(--font-heading)", textShadow: `0 0 40px ${current.glowColor}30` }}
            >
              {current.title}
            </h2>
            <p className="text-white/50 text-sm md:text-base leading-relaxed max-w-sm mx-auto">
              {current.body}
            </p>
          </div>

          {/* Progress dots */}
          <div className="flex justify-center gap-1.5 mb-7">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => { if (i < step || i === step) return; setExiting(true); setTimeout(() => { setStep(i); setExiting(false); }, 180); }}
                className="rounded-full transition-all duration-300"
                style={{
                  width:  i === step ? "20px" : "6px",
                  height: "6px",
                  background: i === step
                    ? current.glowColor
                    : i < step ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.12)",
                  boxShadow: i === step ? `0 0 8px ${current.glowColor}` : undefined,
                }}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {"href" in current && current.href && (
              <button
                onClick={() => { router.push(current.href!); skip(); }}
                className="flex-1 py-3 px-4 rounded-2xl text-sm font-medium border border-white/10 text-white/40 hover:text-white/70 hover:border-white/20 hover:bg-white/5 transition-all"
              >
                Explore now →
              </button>
            )}
            <button
              onClick={goNext}
              className={cn(
                "flex items-center justify-center gap-2 py-3 px-6 rounded-2xl text-sm font-semibold text-white transition-all duration-200",
                "hover:scale-[1.02] active:scale-[0.98]",
                "href" in current && current.href ? "flex-1" : "w-full"
              )}
              style={{
                background: `linear-gradient(135deg, ${current.glowColor} 0%, ${current.glowColor}cc 100%)`,
                boxShadow: `0 0 24px ${current.glowColor}40, 0 4px 12px rgba(0,0,0,0.3)`,
              }}
            >
              {isLast ? "Begin →" : (
                <>Next <ChevronRight className="w-4 h-4" /></>
              )}
            </button>
          </div>

          {/* Step counter */}
          <p className="text-center text-[10px] text-white/20 mt-4 font-mono">
            {step + 1} / {STEPS.length}
          </p>
        </div>
      </div>
    </div>
  );
}
