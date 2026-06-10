"use client";

import { useState, useEffect } from "react";
import { Scale, Moon, Droplets, Zap, TrendingUp, TrendingDown, Minus, Frown, Smile, Heart, Star, Meh } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { format, subDays } from "date-fns";

const STORAGE_KEY = "galaxus-metrics";

interface MetricEntry {
  date: string;
  weight?: number;
  sleep?: number;
  water?: number;
  energy?: number;
}

function loadData(): MetricEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MetricEntry[]) : [];
  } catch {
    return [];
  }
}

function saveData(data: MetricEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

const METRICS = [
  {
    key: "weight" as const,
    label: "Weight",
    unit: "kg",
    icon: <Scale className="w-5 h-5" />,
    color: "var(--gold)",
    lineColor: "#C9A84C",
    min: 30,
    max: 200,
    step: 0.1,
    placeholder: "75.5",
  },
  {
    key: "sleep" as const,
    label: "Sleep",
    unit: "hrs",
    icon: <Moon className="w-5 h-5" />,
    color: "var(--emerald)",
    lineColor: "#5DBD8C",
    min: 0,
    max: 24,
    step: 0.5,
    placeholder: "7.5",
  },
  {
    key: "water" as const,
    label: "Water",
    unit: "L",
    icon: <Droplets className="w-5 h-5" />,
    color: "#60a5fa",
    lineColor: "#60a5fa",
    min: 0,
    max: 10,
    step: 0.25,
    placeholder: "2.5",
  },
  {
    key: "energy" as const,
    label: "Energy",
    unit: "/5",
    icon: <Zap className="w-5 h-5" />,
    color: "#f97316",
    lineColor: "#f97316",
    min: 1,
    max: 5,
    step: 1,
    placeholder: "4",
  },
];

function Trend({ current, previous }: { current?: number; previous?: number }) {
  if (current == null || previous == null) return <Minus className="w-4 h-4 text-muted-foreground" />;
  const diff = current - previous;
  if (Math.abs(diff) < 0.01) return <Minus className="w-4 h-4 text-muted-foreground" />;
  return diff > 0 ? (
    <TrendingUp className="w-4 h-4 text-[var(--emerald)]" />
  ) : (
    <TrendingDown className="w-4 h-4 text-red-400" />
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-card/95 backdrop-blur-sm p-3 text-xs shadow-xl">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="font-semibold" style={{ color: p.color }}>
          {p.value}
        </p>
      ))}
    </div>
  );
};

const MOOD_KEY = "galaxus-moods";
function moodColor(n: number) {
  const hue = Math.round(2 + n * 5.2);
  return `oklch(0.66 0.22 ${hue})`;
}
function MoodIcon({ mood }: { mood: number }) {
  if (mood === 0) return <Meh className="w-6 h-6 text-muted-foreground" />;
  if (mood <= 3) return <Frown className="w-6 h-6" style={{ color: moodColor(mood) }} />;
  if (mood <= 5) return <Meh className="w-6 h-6" style={{ color: moodColor(mood) }} />;
  if (mood <= 7) return <Smile className="w-6 h-6" style={{ color: moodColor(mood) }} />;
  if (mood <= 9) return <Heart className="w-6 h-6" style={{ color: moodColor(mood) }} />;
  return <Star className="w-6 h-6" style={{ color: moodColor(mood) }} />;
}

function loadMoods(): { date: string; mood: number }[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(MOOD_KEY) ?? "[]"); } catch { return []; }
}

export default function MetricsPage() {
  const [allData, setAllData] = useState<MetricEntry[]>([]);
  const [moods, setMoods] = useState<{ date: string; mood: number }[]>([]);
  const [form, setForm] = useState<Partial<Record<"weight" | "sleep" | "water" | "energy", string>>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setAllData(loadData());
    setMoods(loadMoods());
  }, []);

  const today = format(new Date(), "yyyy-MM-dd");

  // Last 30 days for charts
  const last30Days = Array.from({ length: 30 }, (_, i) =>
    format(subDays(new Date(), 29 - i), "yyyy-MM-dd")
  );

  const chartData = last30Days.map((date) => {
    const entry = allData.find((d) => d.date === date);
    return {
      date: format(new Date(date + "T00:00"), "MMM d"),
      weight: entry?.weight ?? null,
      sleep: entry?.sleep ?? null,
      water: entry?.water ?? null,
      energy: entry?.energy ?? null,
    };
  });

  // Mood chart data — last 30 days
  const moodChartData = Array.from({ length: 30 }, (_, i) => {
    const date = format(subDays(new Date(), 29 - i), "yyyy-MM-dd");
    const entry = moods.find((m) => m.date === date);
    return {
      date: format(new Date(date + "T00:00"), "MMM d"),
      mood: entry?.mood ?? null,
      emoji: entry?.mood ?? null,
    };
  });
  const avgMood = moods.length > 0 ? (moods.reduce((s, m) => s + m.mood, 0) / moods.length).toFixed(1) : null;
  const todayMood = moods.find(m => m.date === today)?.mood ?? 0;

  // Today's existing entry
  const todayEntry = allData.find((d) => d.date === today);
  const yesterdayEntry = allData.find(
    (d) => d.date === format(subDays(new Date(), 1), "yyyy-MM-dd")
  );

  // Latest values (most recent non-null)
  function latest(key: keyof MetricEntry) {
    const sorted = [...allData].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    return sorted.find((d) => d[key] != null)?.[key] as number | undefined;
  }

  function saveToday() {
    const entry: MetricEntry = {
      date: today,
      weight: form.weight ? parseFloat(form.weight) : todayEntry?.weight,
      sleep: form.sleep ? parseFloat(form.sleep) : todayEntry?.sleep,
      water: form.water ? parseFloat(form.water) : todayEntry?.water,
      energy: form.energy ? parseFloat(form.energy) : todayEntry?.energy,
    };
    const updated = allData.filter((d) => d.date !== today);
    updated.push(entry);
    setAllData(updated);
    saveData(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="page max-w-4xl">
      {/* Header */}
      <div>
        <p className="section-label mb-1">Body</p>
        <h1 className="text-2xl font-bold heading-gradient" style={{ fontFamily: "var(--font-heading)" }}>Body Metrics</h1>
        <p className="text-sm text-muted-foreground mt-1">Track weight, sleep, water & energy</p>
      </div>

      {/* Mood section */}
      <div className="glass p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="section-label mb-1">Today&apos;s Mood</p>
            <div className="flex items-center gap-2 mt-1">
              <MoodIcon mood={todayMood} />
              <div>
                <p className="font-semibold text-sm">{todayMood > 0 ? ["","Awful","Very Bad","Bad","Meh","Okay","Alright","Good","Great","Amazing","Perfect"][todayMood] : "Not logged yet"}</p>
                {avgMood && <p className="text-xs text-muted-foreground">30-day avg: {avgMood}/10</p>}
              </div>
            </div>
          </div>
        </div>
        {moodChartData.some(d => d.mood !== null) ? (
          <ResponsiveContainer width="100%" height={100}>
            <LineChart data={moodChartData} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }} tickLine={false} axisLine={false} interval={5} />
              <YAxis domain={[1, 10]} ticks={[1,5,10]} tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }} tickLine={false} axisLine={false} />
              <Tooltip content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const v = payload[0].value as number;
                return (
                  <div className="rounded-xl border border-white/10 bg-card/95 backdrop-blur-sm p-2 text-xs shadow-xl">
                    <p className="text-muted-foreground">{label}</p>
                    <p className="font-semibold">{v}/10</p>
                  </div>
                );
              }} />
              <Line type="monotone" dataKey="mood" stroke="var(--gold)" strokeWidth={2} dot={false} connectNulls activeDot={{ r: 4, fill: "var(--gold)", strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-xs text-muted-foreground py-4 text-center">Log your mood from the dashboard to see the trend here.</p>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {METRICS.map((m) => {
          const val = latest(m.key);
          const prev = yesterdayEntry?.[m.key] as number | undefined;
          return (
            <div
              key={m.key}
              className="glass p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div style={{ color: m.color }}>{m.icon}</div>
                <Trend current={val} previous={prev} />
              </div>
              <p className="text-2xl font-bold" style={{ color: m.color }}>
                {val != null ? val : "—"}
                <span className="text-xs text-muted-foreground font-normal ml-1">{m.unit}</span>
              </p>
              <p className="text-xs text-muted-foreground">{m.label}</p>
            </div>
          );
        })}
      </div>

      {/* Today's input */}
      <div className="glass p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Log Today</h2>
          <span className="text-xs text-muted-foreground">{format(new Date(), "EEEE, MMM d")}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {METRICS.map((m) => (
            <div key={m.key} className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                <span style={{ color: m.color }}>{m.icon}</span>
                {m.label} ({m.unit})
              </Label>
              <Input
                type="number"
                min={m.min}
                max={m.max}
                step={m.step}
                placeholder={todayEntry?.[m.key]?.toString() ?? m.placeholder}
                value={form[m.key] ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, [m.key]: e.target.value }))
                }
                className="bg-white/5 border-white/10 h-9 text-sm"
              />
            </div>
          ))}
        </div>
        <Button
          onClick={saveToday}
          className={cn(
            "rounded-xl font-semibold text-sm",
            saved
              ? "bg-[var(--emerald)]/20 text-[var(--emerald)] border border-[var(--emerald)]/30"
              : "]"
          )}
        >
          {saved ? "Saved!" : "Save Today's Metrics"}
        </Button>
      </div>

      {/* Charts */}
      <div className="space-y-6">
        {METRICS.map((m) => {
          const hasData = chartData.some((d) => d[m.key] != null);
          return (
            <div key={m.key} className="glass p-5 space-y-3">
              <div className="flex items-center gap-2">
                <span style={{ color: m.color }}>{m.icon}</span>
                <h3 className="text-sm font-semibold">{m.label}</h3>
                <span className="text-xs text-muted-foreground">— last 30 days</span>
              </div>
              {hasData ? (
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }}
                      tickLine={false}
                      axisLine={false}
                      interval={4}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }}
                      tickLine={false}
                      axisLine={false}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                      type="monotone"
                      dataKey={m.key}
                      stroke={m.lineColor}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      activeDot={{ r: 4, fill: m.lineColor, strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[120px] flex items-center justify-center text-xs text-muted-foreground">
                  No data yet — start logging today
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
