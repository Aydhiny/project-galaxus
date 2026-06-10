"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ChevronRight, ChevronLeft, Sun, Moon, Star, Check, Flame, Droplets, BookOpen, Dumbbell, Sparkles, Frown, Minus, Smile, Heart, Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type FlowMode = "morning" | "evening";

interface DayRecord {
  date: string;
  morningDone: boolean;
  eveningDone: boolean;
  intention: string;
  priorities: string[];
  mood: number;
  eveningMood: number;
  gratitude: string[];
  dayRating: number;
  yesterdayRating: number;
  tomorrowNote: string;
}

const STORAGE_KEY = "galaxus-overview";
const MOOD_STORAGE = "galaxus-moods";

/* ─── Data helpers ───────────────────────────────────────────────────────── */

function loadRecord(date: string): DayRecord {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return all[date] ?? {
      date, morningDone: false, eveningDone: false,
      intention: "", priorities: ["", "", ""],
      mood: 0, eveningMood: 0,
      gratitude: ["", "", ""],
      dayRating: 0, yesterdayRating: 0,
      tomorrowNote: "",
    };
  } catch { return { date, morningDone: false, eveningDone: false, intention: "", priorities: ["", "", ""], mood: 0, eveningMood: 0, gratitude: ["", "", ""], dayRating: 0, yesterdayRating: 0, tomorrowNote: "" }; }
}

function saveRecord(rec: DayRecord) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    all[rec.date] = rec;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

function saveMood(date: string, mood: number) {
  try {
    const arr = JSON.parse(localStorage.getItem(MOOD_STORAGE) ?? "[]");
    const idx = arr.findIndex((e: any) => e.date === date);
    if (idx >= 0) arr[idx].mood = mood; else arr.push({ date, mood });
    localStorage.setItem(MOOD_STORAGE, JSON.stringify(arr));
  } catch { /* ignore */ }
}

/* ─── Static data ────────────────────────────────────────────────────────── */

const INTENTIONS = ["Focus", "Create", "Worship", "Rest", "Learn", "Reflect", "Connect", "Grind", "Heal", "Build"];

function moodColor(n: number) {
  const hue = Math.round(2 + n * 5.2);
  return `oklch(0.66 0.22 ${hue})`;
}
const YESTERDAY_ICONS = [null, Frown, Minus, Smile, Heart, Star] as const;
const MOOD_LABELS = ["", "Awful", "Very Bad", "Bad", "Meh", "Okay", "Alright", "Good", "Great", "Amazing", "Perfect"];

const MORNING_STEPS = ["welcome", "yesterday", "intention", "priorities", "mood", "done"] as const;
const EVENING_STEPS = ["welcome", "habits", "rating", "gratitude", "tomorrow", "done"] as const;

type MorningStep = typeof MORNING_STEPS[number];
type EveningStep = typeof EVENING_STEPS[number];

/* ─── Sub-step components ────────────────────────────────────────────────── */

function MoodPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex gap-2 flex-wrap justify-center">
        {[1,2,3,4,5,6,7,8,9,10].map(n => (
          <button key={n} onClick={() => onChange(n)}
            className={cn("w-10 h-10 rounded-xl text-sm font-bold transition-all duration-150 border",
              value === n ? "border-transparent scale-110 text-white" : "border-border hover:border-[var(--gold)]/30 hover:scale-105 bg-card text-muted-foreground"
            )}
            style={value === n ? { background: moodColor(n) } : {}}>
            {n}
          </button>
        ))}
      </div>
      {value > 0 && (
        <p className="text-sm font-medium animate-in fade-in" style={{ color: moodColor(value) }}>{MOOD_LABELS[value]}</p>
      )}
    </div>
  );
}

function RatingPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-2 justify-center">
      {[1,2,3,4,5,6,7,8,9,10].map(n => (
        <button key={n} onClick={() => onChange(n)}
          className={cn("w-10 h-10 rounded-lg text-sm font-bold transition-all border",
            value >= n ? "bg-[var(--gold)] text-[oklch(0.08_0.01_85)] border-[var(--gold)]" : "border-border text-muted-foreground hover:border-[var(--gold)]/40 bg-card"
          )}>
          {n}
        </button>
      ))}
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────── */

export default function OverviewPage() {
  const today = format(new Date(), "yyyy-MM-dd");
  const hour = new Date().getHours();
  const defaultMode: FlowMode = hour < 14 ? "morning" : "evening";

  const [mode, setMode] = useState<FlowMode>(defaultMode);
  const [stepIdx, setStepIdx] = useState(0);
  const [rec, setRec] = useState<DayRecord>(() => loadRecord(today));
  const [transitioning, setTransitioning] = useState(false);

  const steps = mode === "morning" ? MORNING_STEPS : EVENING_STEPS;
  const step = steps[stepIdx] as string;
  const isLast = stepIdx === steps.length - 1;
  const isFirst = stepIdx === 0;

  function patch(updates: Partial<DayRecord>) {
    setRec(r => { const next = { ...r, ...updates }; saveRecord(next); return next; });
  }

  function go(dir: 1 | -1) {
    if (transitioning) return;
    setTransitioning(true);
    setTimeout(() => { setStepIdx(i => i + dir); setTransitioning(false); }, 150);
  }

  function next() {
    if (isLast) return;
    // On last real step before "done", mark as complete
    const lastReal = steps.length - 2;
    if (stepIdx === lastReal) {
      if (mode === "morning") {
        patch({ morningDone: true });
        if (rec.mood > 0) saveMood(today, rec.mood);
      } else {
        patch({ eveningDone: true });
        if (rec.eveningMood > 0) saveMood(today, rec.eveningMood);
      }
      toast.success(mode === "morning" ? "Morning ritual complete! Bismillah" : "Day complete! Great reflection");
    }
    go(1);
  }

  const greeting = hour < 5 ? "As-salamu alaykum" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  /* ── Step renders ── */

  const renderStep = () => {
    switch (step) {
      /* ── Welcome ─────────────────────────────────────────────── */
      case "welcome":
        return (
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ background: "var(--gold-muted)", border: "1px solid oklch(from var(--gold) l c h / 25%)" }}>
              {mode === "morning" ? <Sun className="w-10 h-10 text-[var(--gold)]" /> : <Moon className="w-10 h-10 text-[var(--gold)]" />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-[0.2em] mb-2">
                {format(new Date(), "EEEE, MMMM d")}
              </p>
              <h1 className="text-3xl font-bold" style={{ fontFamily: "var(--font-heading)" }}>
                {greeting}, Ajdin.
              </h1>
              <p className="text-muted-foreground mt-2 text-sm">
                بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيم
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setMode("morning")}
                className={cn("flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all",
                  mode === "morning" ? "bg-[var(--gold-muted)] border-[var(--gold)]/30 text-[var(--gold)]" : "border-border text-muted-foreground hover:bg-accent")}>
                <Sun className="w-4 h-4" /> Morning flow
                {rec.morningDone && <Check className="w-3.5 h-3.5 text-[var(--gold)]" />}
              </button>
              <button onClick={() => setMode("evening")}
                className={cn("flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all",
                  mode === "evening" ? "bg-[var(--gold-muted)] border-[var(--gold)]/30 text-[var(--gold)]" : "border-border text-muted-foreground hover:bg-accent")}>
                <Moon className="w-4 h-4" /> Evening flow
                {rec.eveningDone && <Check className="w-3.5 h-3.5 text-[var(--gold)]" />}
              </button>
            </div>
          </div>
        );

      /* ── Yesterday (morning) ─────────────────────────────────── */
      case "yesterday":
        return (
          <div className="flex flex-col items-center gap-8 text-center">
            <h2 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
              How was yesterday?
            </h2>
            <div className="flex gap-3">
              {[1,2,3,4,5].map(n => {
                const Icon = YESTERDAY_ICONS[n]!;
                return (
                <button key={n} onClick={() => patch({ yesterdayRating: n })}
                  className={cn("w-16 h-16 rounded-2xl transition-all border flex items-center justify-center",
                    rec.yesterdayRating === n ? "border-[var(--gold)]/50 bg-[var(--gold-muted)] scale-110" : "border-border hover:scale-105 bg-card text-muted-foreground"
                  )}>
                  <Icon className="w-7 h-7" style={rec.yesterdayRating === n ? { color: "var(--gold)" } : {}} />
                </button>
                );
              })}
            </div>
            {rec.yesterdayRating > 0 && (
              <p className="text-sm text-muted-foreground animate-in fade-in">
                {["That&apos;s okay — today is a new start.", "Every day teaches something.", "Onwards from here.", "That&apos;s a good day.", "Alhamdulillah!"][rec.yesterdayRating-1]}
              </p>
            )}
          </div>
        );

      /* ── Intention (morning) ─────────────────────────────────── */
      case "intention":
        return (
          <div className="flex flex-col items-center gap-8 text-center w-full">
            <h2 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
              One word for today.
            </h2>
            <p className="text-sm text-muted-foreground -mt-4">What energy do you want to carry?</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {INTENTIONS.map(w => (
                <button key={w} onClick={() => patch({ intention: w })}
                  className={cn("px-4 py-2 rounded-xl text-sm font-medium border transition-all",
                    rec.intention === w ? "bg-[var(--gold-muted)] border-[var(--gold)]/30 text-[var(--gold)]" : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}>
                  {w}
                </button>
              ))}
            </div>
            <input
              value={rec.intention}
              onChange={e => patch({ intention: e.target.value })}
              placeholder="or type your own…"
              className="w-full max-w-xs text-center bg-transparent border-b border-border pb-1 text-sm outline-none placeholder:text-muted-foreground/40 focus:border-[var(--gold)]/40"
            />
          </div>
        );

      /* ── Priorities (morning) ────────────────────────────────── */
      case "priorities":
        return (
          <div className="flex flex-col items-center gap-6 text-center w-full">
            <h2 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
              Top 3 priorities today.
            </h2>
            <p className="text-sm text-muted-foreground -mt-3">What actually matters?</p>
            <div className="w-full max-w-sm space-y-3">
              {[0,1,2].map(i => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: "var(--gold-muted)", color: "var(--gold)" }}>{i+1}</span>
                  <input
                    value={rec.priorities[i] ?? ""}
                    onChange={e => {
                      const p = [...rec.priorities];
                      p[i] = e.target.value;
                      patch({ priorities: p });
                    }}
                    placeholder={["Most important task", "Second priority", "Third priority"][i]}
                    className="flex-1 bg-transparent border-b border-border pb-1 text-sm outline-none placeholder:text-muted-foreground/40 focus:border-[var(--gold)]/40"
                  />
                </div>
              ))}
            </div>
          </div>
        );

      /* ── Mood (morning) ──────────────────────────────────────── */
      case "mood":
        return (
          <div className="flex flex-col items-center gap-6 text-center">
            <h2 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
              How are you feeling right now?
            </h2>
            <MoodPicker value={rec.mood} onChange={v => patch({ mood: v })} />
          </div>
        );

      /* ── Evening: habits quick-review ────────────────────────── */
      case "habits":
        return (
          <div className="flex flex-col items-center gap-6 text-center w-full">
            <h2 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
              How did your habits go?
            </h2>
            <div className="w-full max-w-sm space-y-3">
              {[
                { icon: <Sparkles className="w-4 h-4" />, label: "Prayers", color: "var(--emerald)" },
                { icon: <Dumbbell className="w-4 h-4" />, label: "Training", color: "oklch(0.70 0.19 32)" },
                { icon: <BookOpen className="w-4 h-4" />, label: "Reading", color: "oklch(0.65 0.20 290)" },
                { icon: <Flame className="w-4 h-4" />, label: "Creative work", color: "var(--gold)" },
                { icon: <Droplets className="w-4 h-4" />, label: "Hydration", color: "#60a5fa" },
              ].map(({ icon, label, color }) => {
                const key = `habit_${label}` as keyof DayRecord;
                const checked = !!(rec as any)[key];
                return (
                  <button key={label} onClick={() => patch({ [key]: !checked } as any)}
                    className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all",
                      checked ? "border-[var(--gold)]/30 bg-[var(--gold-muted)]" : "border-border bg-card hover:bg-accent")}>
                    <span style={{ color }}>{icon}</span>
                    <span className="flex-1 text-left text-sm font-medium">{label}</span>
                    <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                      checked ? "bg-[var(--gold)] border-[var(--gold)]" : "border-border")}>
                      {checked && <Check className="w-3 h-3 text-[oklch(0.08_0.01_85)]" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );

      /* ── Evening: day rating ─────────────────────────────────── */
      case "rating":
        return (
          <div className="flex flex-col items-center gap-8 text-center">
            <h2 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
              Rate today overall.
            </h2>
            <RatingPicker value={rec.dayRating} onChange={v => patch({ dayRating: v })} />
            {rec.dayRating > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-muted-foreground mb-4">Evening mood</p>
                <MoodPicker value={rec.eveningMood} onChange={v => patch({ eveningMood: v })} />
              </div>
            )}
          </div>
        );

      /* ── Evening: gratitude ──────────────────────────────────── */
      case "gratitude":
        return (
          <div className="flex flex-col items-center gap-6 text-center w-full">
            <Star className="w-8 h-8 text-[var(--gold)]" />
            <h2 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
              Three things you&apos;re grateful for.
            </h2>
            <div className="w-full max-w-sm space-y-3">
              {[0,1,2].map(i => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-[var(--gold)] mt-1">{[<Sun key="s" className="w-4 h-4"/>, <Star key="st" className="w-4 h-4"/>, <Leaf key="l" className="w-4 h-4"/>][i]}</span>
                  <input
                    value={rec.gratitude[i] ?? ""}
                    onChange={e => { const g = [...rec.gratitude]; g[i] = e.target.value; patch({ gratitude: g }); }}
                    placeholder={["I'm grateful for…", "Also grateful for…", "And for…"][i]}
                    className="flex-1 bg-transparent border-b border-border pb-1 text-sm outline-none placeholder:text-muted-foreground/40 focus:border-[var(--gold)]/40"
                  />
                </div>
              ))}
            </div>
          </div>
        );

      /* ── Evening: tomorrow ───────────────────────────────────── */
      case "tomorrow":
        return (
          <div className="flex flex-col items-center gap-6 text-center w-full">
            <h2 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
              Anything for tomorrow?
            </h2>
            <Textarea
              value={rec.tomorrowNote}
              onChange={e => patch({ tomorrowNote: e.target.value })}
              placeholder="A note, a task, something to remember…"
              className="w-full max-w-sm min-h-[120px] resize-none bg-card/50 border-border text-sm"
            />
          </div>
        );

      /* ── Done ────────────────────────────────────────────────── */
      case "done":
        return (
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="w-24 h-24 rounded-full flex items-center justify-center"
              style={{ background: "var(--gold-muted)", border: "1px solid oklch(from var(--gold) l c h / 30%)", boxShadow: "0 0 40px oklch(from var(--gold) l c h / 20%)" }}>
              {mode === "morning" ? <Sun className="w-12 h-12 text-[var(--gold)]" /> : <Moon className="w-12 h-12 text-[var(--gold)]" />}
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-bold text-[var(--gold)]" style={{ fontFamily: "var(--font-heading)" }}>
                {mode === "morning" ? "Bismillah!" : "Alhamdulillah!"}
              </h2>
              <p className="text-muted-foreground text-sm">
                {mode === "morning"
                  ? `Your intention: ${rec.intention || "—"}  ·  ${rec.priorities.filter(Boolean).length} priorities set`
                  : `Day rated ${rec.dayRating}/10  ·  ${rec.gratitude.filter(Boolean).length} gratitudes logged`}
              </p>
            </div>
            {mode === "morning" && rec.priorities.filter(Boolean).length > 0 && (
              <div className="w-full max-w-xs space-y-2">
                {rec.priorities.filter(Boolean).map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-left">
                    <span className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0"
                      style={{ background: "var(--gold-muted)", color: "var(--gold)" }}>{i+1}</span>
                    <span className="text-foreground/80">{p}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-3">
              <Button onClick={() => { setStepIdx(0); setMode(mode === "morning" ? "evening" : "morning"); }}
                variant="ghost" className="text-sm">
                {mode === "morning" ? "Evening flow →" : "← Morning flow"}
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] items-center justify-center px-6 py-12">
      {/* Progress dots */}
      <div className="flex gap-2 mb-12">
        {steps.map((_, i) => (
          <div key={i} className={cn("rounded-full transition-all duration-300",
            i === stepIdx ? "w-6 h-2 bg-[var(--gold)]" : i < stepIdx ? "w-2 h-2 bg-[var(--gold)]/50" : "w-2 h-2 bg-border"
          )} />
        ))}
      </div>

      {/* Step content */}
      <div className={cn("w-full max-w-md transition-all duration-150", transitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0")}
        style={{ transform: transitioning ? "translateY(8px)" : "translateY(0)" }}>
        {renderStep()}
      </div>

      {/* Navigation */}
      {!isLast && (
        <div className="flex items-center gap-4 mt-12">
          {!isFirst && (
            <button onClick={() => go(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          )}
          <button
            onClick={next}
            className={cn("flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all",
              "bg-[var(--gold)] text-[oklch(0.08_0.01_85)] hover:opacity-90"
            )}>
            {stepIdx === steps.length - 2 ? (mode === "morning" ? "Begin the day" : "Complete") : "Continue"}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
