"use client";

import { useState, useTransition, useEffect } from "react";
import { upsertCheckin, getTodayCheckin } from "@/lib/actions/checkin";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, Moon, Sun, Sunrise, Dumbbell, Sparkles, Music2, NotebookPen, BookOpen, Check, BedDouble, Star, Heart } from "lucide-react";
import { ShineButton } from "@/components/lw/shine-button";
import { InteractiveGradientCard } from "@/components/lw/interactive-gradient";

const PRAYERS = [
  { key: "fajr",    label: "Fajr",    arabic: "الفجر",  time: "Dawn",      Icon: Moon },
  { key: "dhuhr",   label: "Dhuhr",   arabic: "الظهر",  time: "Midday",    Icon: Sun },
  { key: "asr",     label: "Asr",     arabic: "العصر",  time: "Afternoon", Icon: Sun },
  { key: "maghrib", label: "Maghrib", arabic: "المغرب", time: "Sunset",    Icon: Sunrise },
  { key: "isha",    label: "Isha",    arabic: "العشاء",  time: "Night",     Icon: Moon },
] as const;

const HABIT_SECTIONS = [
  {
    title: "Physical",
    Icon: Dumbbell,
    color: "oklch(0.70 0.19 32)",
    items: [
      { key: "training", label: "Training", subKey: "trainingMinutes", subLabel: "Minutes trained" },
    ],
  },
  {
    title: "Mental",
    Icon: Sparkles,
    color: "oklch(0.65 0.20 290)",
    items: [
      { key: "meditation", label: "Meditation", subKey: "meditationMinutes", subLabel: "Minutes meditated" },
    ],
  },
  {
    title: "Creative",
    Icon: Music2,
    color: "var(--gold)",
    items: [
      { key: "music", label: "Music / Production", subKey: "musicMinutes", subLabel: "Minutes in music" },
      { key: "design", label: "Design", subKey: null, subLabel: null },
      { key: "youtube", label: "YouTube Content", subKey: null, subLabel: null },
    ],
  },
  {
    title: "Personal",
    Icon: NotebookPen,
    color: "#06b6d4",
    items: [
      { key: "writing", label: "Writing", subKey: null, subLabel: null },
    ],
  },
] as const;

type CheckinState = {
  fajr: boolean; dhuhr: boolean; asr: boolean; maghrib: boolean; isha: boolean;
  quranPages: number;
  training: boolean; trainingMinutes: number;
  meditation: boolean; meditationMinutes: number;
  music: boolean; musicMinutes: number;
  design: boolean; youtube: boolean; writing: boolean;
  gratitude: boolean; gratitudeText: string;
  notes: string;
  sleepHours: number | null; sleepQuality: number | null;
  bedTime: string; wakeTime: string;
};

const defaultState: CheckinState = {
  fajr: false, dhuhr: false, asr: false, maghrib: false, isha: false,
  quranPages: 0,
  training: false, trainingMinutes: 0,
  meditation: false, meditationMinutes: 0,
  music: false, musicMinutes: 0,
  design: false, youtube: false, writing: false,
  gratitude: false, gratitudeText: "",
  notes: "",
  sleepHours: null, sleepQuality: null,
  bedTime: "", wakeTime: "",
};

export default function DailyPage() {
  const [state, setState] = useState<CheckinState>(defaultState);
  const [pending, startTransition] = useTransition();
  const [loaded, setLoaded] = useState(false);

  const today = format(new Date(), "yyyy-MM-dd");
  const todayDisplay = format(new Date(), "EEEE, MMMM d");

  useEffect(() => {
    getTodayCheckin().then((checkin) => {
      if (checkin) {
        setState({
          fajr: checkin.fajr ?? false,
          dhuhr: checkin.dhuhr ?? false,
          asr: checkin.asr ?? false,
          maghrib: checkin.maghrib ?? false,
          isha: checkin.isha ?? false,
          quranPages: checkin.quranPages ?? 0,
          training: checkin.training ?? false,
          trainingMinutes: checkin.trainingMinutes ?? 0,
          meditation: checkin.meditation ?? false,
          meditationMinutes: checkin.meditationMinutes ?? 0,
          music: checkin.music ?? false,
          musicMinutes: checkin.musicMinutes ?? 0,
          design: checkin.design ?? false,
          youtube: checkin.youtube ?? false,
          writing: checkin.writing ?? false,
          gratitude: checkin.gratitude ?? false,
          gratitudeText: checkin.gratitudeText ?? "",
          notes: checkin.notes ?? "",
          sleepHours: checkin.sleepHours ?? null,
          sleepQuality: checkin.sleepQuality ?? null,
          bedTime: checkin.bedTime ?? "",
          wakeTime: checkin.wakeTime ?? "",
        });
      }
      setLoaded(true);
    });
  }, []);

  function toggle(key: keyof CheckinState) {
    setState((s) => ({ ...s, [key]: !s[key as keyof typeof s] }));
  }

  function setNum(key: keyof CheckinState, value: number) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function save() {
    startTransition(async () => {
      const gratitude = state.gratitude || state.gratitudeText.trim().length > 0;
      let sleepHours = state.sleepHours;
      if (!sleepHours && state.bedTime && state.wakeTime) {
        const [bh, bm] = state.bedTime.split(":").map(Number);
        const [wh, wm] = state.wakeTime.split(":").map(Number);
        let mins = (wh * 60 + wm) - (bh * 60 + bm);
        if (mins < 0) mins += 24 * 60;
        sleepHours = parseFloat((mins / 60).toFixed(1));
      }
      await upsertCheckin(today, { ...state, gratitude, sleepHours });
      toast.success("Check-in saved");
    });
  }

  const prayersDone = PRAYERS.filter((p) => state[p.key]).length;

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 max-w-2xl mx-auto page-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Daily Check-in</p>
          <h1 className="text-2xl font-bold mt-0.5 lw-gradient-text">{todayDisplay}</h1>
        </div>
        <ShineButton
          onClick={save}
          disabled={pending}
          size="md"
          className="gap-2 disabled:opacity-60"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {pending ? "Saving…" : "Save"}
        </ShineButton>
      </div>

      {/* Prayers */}
      <InteractiveGradientCard glowColor="#173eff18" borderColor="#173eff" className="bg-card">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Moon className="w-4 h-4 text-[#3758f9]" />
              <h2 className="font-semibold">Prayers (Salah)</h2>
            </div>
            <span className="text-sm font-bold px-3 py-1 rounded-full bg-[#173eff15] text-[#3758f9] border border-[#173eff30]">
              {prayersDone}/5
            </span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {PRAYERS.map((p) => (
              <button
                key={p.key}
                onClick={() => toggle(p.key)}
                className={`flex flex-col items-center gap-2 py-5 px-2 rounded-xl border transition-all duration-300 min-h-[90px] ${
                  state[p.key] ? "prayer-done" : "prayer-undone"
                }`}
              >
                <p.Icon className="w-5 h-5" />
                <span className="text-sm font-bold">{p.label}</span>
                <span className="text-[11px] font-medium opacity-70" style={{ fontFamily: "serif" }}>{p.arabic}</span>
                {state[p.key] && (
                  <div className="w-5 h-5 rounded-full bg-[#173eff] flex items-center justify-center shadow-[0_0_8px_#173eff80]">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Quran pages */}
          <div className="pt-2 border-t border-white/6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-[#3758f9]" /> Quran Pages
              </span>
              <span className="text-lg font-bold text-[#3758f9]">{state.quranPages}</span>
            </div>
            <input
              type="range"
              min={0}
              max={50}
              value={state.quranPages}
              onChange={(e) => setNum("quranPages", Number(e.target.value))}
              className="w-full accent-[#173eff] h-2"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>0</span>
              <span>50 pages</span>
            </div>
          </div>
        </div>
      </InteractiveGradientCard>

      {/* Habit sections */}
      {HABIT_SECTIONS.map((section) => (
        <InteractiveGradientCard
          key={section.title}
          glowColor="#173eff12"
          borderColor="#173eff"
          className="bg-card"
        >
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <section.Icon className="w-5 h-5" style={{ color: section.color }} />
              <h2 className="font-semibold">{section.title}</h2>
            </div>

            <div className="space-y-4">
              {section.items.map((item) => {
                const isActive = !!state[item.key as keyof CheckinState];
                return (
                  <div key={item.key} className="space-y-3">
                    <button
                      onClick={() => toggle(item.key as keyof CheckinState)}
                      className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all duration-300 ${
                        isActive ? "streak-active" : "streak-inactive hover:border-white/12"
                      }`}
                      style={isActive ? {
                        borderLeftWidth: "3px",
                        borderLeftColor: "#173eff",
                      } : {}}
                    >
                      <div
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                          isActive
                            ? "border-[#173eff] bg-[#173eff] shadow-[0_0_10px_#173eff60]"
                            : "border-white/20"
                        }`}
                      >
                        {isActive && (
                          <Check className="w-3 h-3 text-white" />
                        )}
                      </div>
                      <span
                        className={`text-sm font-medium transition-colors ${
                          isActive ? "text-[#3758f9]" : "text-foreground"
                        }`}
                      >
                        {item.label}
                      </span>
                      {isActive && (
                        <div className="ml-auto w-2 h-2 rounded-full bg-[#173eff] animate-pulse" />
                      )}
                    </button>

                    {item.subKey && isActive && (
                      <div className="pl-4 space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{item.subLabel}</span>
                          <span className="text-[#3758f9] font-medium">
                            {state[item.subKey as keyof CheckinState]}m
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={240}
                          step={5}
                          value={Number(state[item.subKey as keyof CheckinState])}
                          onChange={(e) => setNum(item.subKey as keyof CheckinState, Number(e.target.value))}
                          className="w-full accent-[#173eff] h-2"
                        />
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>0m</span>
                          <span>240m</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </InteractiveGradientCard>
      ))}

      {/* Gratitude */}
      <InteractiveGradientCard glowColor="#ff174420" borderColor="#f43f5e" className="bg-card">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-rose-400" />
            <h2 className="font-semibold">Gratitude</h2>
            <span className="text-xs text-muted-foreground ml-auto">3 things you&apos;re grateful for</span>
          </div>
          {["1.", "2.", "3."].map((n, i) => {
            const lines = state.gratitudeText.split("\n");
            return (
              <div key={n} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-4 shrink-0">{n}</span>
                <input
                  value={lines[i] ?? ""}
                  onChange={e => {
                    const arr = [lines[0] ?? "", lines[1] ?? "", lines[2] ?? ""];
                    arr[i] = e.target.value;
                    setState(s => ({ ...s, gratitudeText: arr.join("\n"), gratitude: arr.some(l => l.trim().length > 0) }));
                  }}
                  placeholder={["People, moments, or blessings…", "Something small you noticed today…", "Something you're proud of…"][i]}
                  className="flex-1 bg-white/5 border border-white/8 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                />
              </div>
            );
          })}
        </div>
      </InteractiveGradientCard>

      {/* Sleep */}
      <InteractiveGradientCard glowColor="#06b6d420" borderColor="#06b6d4" className="bg-card">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <BedDouble className="w-5 h-5 text-[var(--emerald)]" />
            <h2 className="font-semibold">Sleep</h2>
            {state.sleepHours && (
              <span className="text-sm text-[var(--emerald)] font-semibold ml-auto">{state.sleepHours}h</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground uppercase tracking-widest">Bed time</label>
              <input type="time" value={state.bedTime}
                onChange={e => setState(s => ({ ...s, bedTime: e.target.value }))}
                className="w-full bg-white/5 border border-white/8 rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground uppercase tracking-widest">Wake time</label>
              <input type="time" value={state.wakeTime}
                onChange={e => setState(s => ({ ...s, wakeTime: e.target.value }))}
                className="w-full bg-white/5 border border-white/8 rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground uppercase tracking-widest">Quality</label>
            <div className="flex gap-2">
              {[1,2,3,4,5].map(n => (
                <button key={n} type="button"
                  onClick={() => setState(s => ({ ...s, sleepQuality: s.sleepQuality === n ? null : n }))}
                  className="w-10 h-10 rounded-xl border transition-all"
                  style={state.sleepQuality && state.sleepQuality >= n
                    ? { background: "var(--emerald)", borderColor: "var(--emerald)", color: "white" }
                    : { borderColor: "oklch(1 0 0 / 8%)", color: "oklch(1 0 0 / 40%)" }}>
                  <Star className="w-4 h-4 mx-auto" fill={state.sleepQuality && state.sleepQuality >= n ? "currentColor" : "none"} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </InteractiveGradientCard>

      {/* Notes */}
      <InteractiveGradientCard glowColor="#173eff10" borderColor="#173eff" className="bg-card">
        <div className="p-6 space-y-3">
          <div className="flex items-center gap-2">
            <NotebookPen className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold">Daily Notes</h2>
          </div>
          <textarea
            value={state.notes}
            onChange={(e) => setState((s) => ({ ...s, notes: e.target.value }))}
            placeholder="How was your day? Any reflections..."
            rows={4}
            className="w-full bg-white/5 border border-white/8 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none"
          />
        </div>
      </InteractiveGradientCard>

      <ShineButton
        onClick={save}
        disabled={pending}
        size="lg"
        className="w-full !rounded-xl disabled:opacity-60"
      >
        {pending ? (
          <span className="flex items-center gap-2 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" />
            Saving…
          </span>
        ) : (
          "Save Today's Check-in"
        )}
      </ShineButton>
    </div>
  );
}
