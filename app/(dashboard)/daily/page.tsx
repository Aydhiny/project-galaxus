"use client";

import { useState, useTransition, useEffect } from "react";
import { upsertCheckin, getTodayCheckin } from "@/lib/actions/checkin";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, Save, Moon, Sun, Sunrise, Dumbbell, Sparkles, Music2, NotebookPen, BookOpen, Check, BedDouble, Star, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";

const PRAYERS = [
  { key: "fajr",    label: "Fajr",    time: "Dawn",      Icon: Moon },
  { key: "dhuhr",   label: "Dhuhr",   time: "Midday",    Icon: Sun },
  { key: "asr",     label: "Asr",     time: "Afternoon", Icon: Sun },
  { key: "maghrib", label: "Maghrib", time: "Sunset",    Icon: Sunrise },
  { key: "isha",    label: "Isha",    time: "Night",     Icon: Moon },
] as const;

const HABIT_SECTIONS = [
  {
    title: "Physical",
    Icon: Dumbbell,
    items: [
      { key: "training", label: "Training", subKey: "trainingMinutes", subLabel: "Minutes trained" },
    ],
  },
  {
    title: "Mental",
    Icon: Sparkles,
    items: [
      { key: "meditation", label: "Meditation", subKey: "meditationMinutes", subLabel: "Minutes meditated" },
    ],
  },
  {
    title: "Creative",
    Icon: Music2,
    items: [
      { key: "music", label: "Music / Production", subKey: "musicMinutes", subLabel: "Minutes in music" },
      { key: "design", label: "Design", subKey: null, subLabel: null },
      { key: "youtube", label: "YouTube Content", subKey: null, subLabel: null },
    ],
  },
  {
    title: "Personal",
    Icon: NotebookPen,
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
      // Auto-derive gratitude boolean from text; auto-compute sleep hours from times
      const gratitude = state.gratitude || state.gratitudeText.trim().length > 0;
      let sleepHours = state.sleepHours;
      if (!sleepHours && state.bedTime && state.wakeTime) {
        const [bh, bm] = state.bedTime.split(":").map(Number);
        const [wh, wm] = state.wakeTime.split(":").map(Number);
        let mins = (wh * 60 + wm) - (bh * 60 + bm);
        if (mins < 0) mins += 24 * 60; // crossed midnight
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
    <div className="p-6 space-y-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">
            Daily Check-in
          </p>
          <h1 className="text-xl font-bold mt-0.5">{todayDisplay}</h1>
        </div>
        <Button
          onClick={save}
          disabled={pending}
          className="bg-[var(--gold)] hover:bg-[var(--gold)]/90 text-[oklch(0.08_0.01_85)] font-semibold rounded-xl gap-2"
        >
          {pending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save
        </Button>
      </div>

      {/* Prayers */}
      <div className="rounded-2xl border border-[var(--emerald)]/20 bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Moon className="w-4 h-4 text-[var(--emerald)]" />
            <h2 className="font-semibold">Prayers (Salah)</h2>
          </div>
          <span className="text-sm text-[var(--emerald)] font-medium">
            {prayersDone}/5
          </span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {PRAYERS.map((p) => (
            <button
              key={p.key}
              onClick={() => toggle(p.key)}
              className={`flex flex-col items-center gap-1.5 py-4 px-2 rounded-xl border transition-all ${
                state[p.key]
                  ? "prayer-done"
                  : "prayer-undone hover:border-[var(--emerald)]/30"
              }`}
            >
              <p.Icon className="w-5 h-5" />
              <span className="text-xs font-medium">{p.label}</span>
              <span className="text-[10px] text-muted-foreground">{p.time}</span>
            </button>
          ))}
        </div>

        {/* Quran pages */}
        <div className="pt-2 border-t border-white/6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium flex items-center gap-1.5"><BookOpen className="w-4 h-4" /> Quran Pages</span>
            <span className="text-lg font-bold text-[var(--emerald)]">
              {state.quranPages}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={50}
            value={state.quranPages}
            onChange={(e) => setNum("quranPages", Number(e.target.value))}
            className="w-full accent-[var(--emerald)] h-2"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>0</span>
            <span>50 pages</span>
          </div>
        </div>
      </div>

      {/* Habit sections */}
      {HABIT_SECTIONS.map((section) => (
        <div
          key={section.title}
          className="rounded-2xl border border-white/6 bg-card p-6 space-y-4"
        >
          <div className="flex items-center gap-2">
            <section.Icon className="w-5 h-5 text-[var(--gold)]" />
            <h2 className="font-semibold">{section.title}</h2>
          </div>

          <div className="space-y-4">
            {section.items.map((item) => (
              <div key={item.key} className="space-y-3">
                <button
                  onClick={() => toggle(item.key as keyof CheckinState)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${
                    state[item.key as keyof CheckinState]
                      ? "streak-active"
                      : "streak-inactive hover:border-white/12"
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                      state[item.key as keyof CheckinState]
                        ? "border-[var(--gold)] bg-[var(--gold)]"
                        : "border-white/20"
                    }`}
                  >
                    {state[item.key as keyof CheckinState] && (
                      <Check className="w-3 h-3 text-[var(--primary-foreground)]" />
                    )}
                  </div>
                  <span
                    className={`text-sm font-medium ${
                      state[item.key as keyof CheckinState]
                        ? "text-[var(--gold)]"
                        : "text-foreground"
                    }`}
                  >
                    {item.label}
                  </span>
                </button>

                {item.subKey && state[item.key as keyof CheckinState] && (
                  <div className="pl-4 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{item.subLabel}</span>
                      <span className="text-[var(--gold)] font-medium">
                        {state[item.subKey as keyof CheckinState]}m
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={240}
                      step={5}
                      value={Number(state[item.subKey as keyof CheckinState])}
                      onChange={(e) =>
                        setNum(item.subKey as keyof CheckinState, Number(e.target.value))
                      }
                      className="w-full accent-[var(--gold)] h-2"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>0m</span>
                      <span>240m</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Gratitude — expanded text */}
      <div className="rounded-2xl border border-white/6 bg-card p-6 space-y-4">
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
                placeholder={["People, moments, or blessings…", "Something small you noticed today…", "Something you&apos;re proud of…"][i]}
                className="flex-1 bg-white/5 border border-white/8 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-[var(--gold)]/40"
              />
            </div>
          );
        })}
      </div>

      {/* Sleep */}
      <div className="rounded-2xl border border-white/6 bg-card p-6 space-y-4">
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
              className="w-full bg-white/5 border border-white/8 rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-[var(--emerald)]/40" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground uppercase tracking-widest">Wake time</label>
            <input type="time" value={state.wakeTime}
              onChange={e => setState(s => ({ ...s, wakeTime: e.target.value }))}
              className="w-full bg-white/5 border border-white/8 rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-[var(--emerald)]/40" />
          </div>
        </div>
        {/* Sleep quality 1-5 stars */}
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

      {/* Notes */}
      <div className="rounded-2xl border border-white/6 bg-card p-6 space-y-3">
        <div className="flex items-center gap-2">
          <NotebookPen className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold">Daily Notes</h2>
        </div>
        <textarea
          value={state.notes}
          onChange={(e) => setState((s) => ({ ...s, notes: e.target.value }))}
          placeholder="How was your day? Any reflections..."
          rows={4}
          className="w-full bg-white/5 border border-white/8 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-[var(--gold)]/40"
        />
      </div>

      <Button
        onClick={save}
        disabled={pending}
        className="w-full h-12 bg-[var(--gold)] hover:bg-[var(--gold)]/90 text-[oklch(0.08_0.01_85)] font-semibold rounded-xl gap-2 text-base"
      >
        {pending ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <>
            <Save className="w-5 h-5" />
            Save Today&apos;s Check-in
          </>
        )}
      </Button>
    </div>
  );
}
