import { getLeaderboardData, getGlobalLeaderboard, getLeaderboardOptIn } from "@/lib/actions/leaderboard";
import { getAchievements } from "@/lib/achievements";
import { Achievements } from "@/components/achievements";
import { LeaderboardTabs } from "@/components/leaderboard-tabs";
import { GlobalLeaderboard } from "@/components/global-leaderboard";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { SpotlightCard } from "@/components/aceternity/spotlight-card";
import {
  Trophy, Flame, Dumbbell, BookOpen, Moon, Music2,
  Star, Sun, TrendingUp, Calendar, BarChart2, Heart, Sparkles, PenLine, Award,
} from "lucide-react";

const HABIT_META = [
  { key: "prayers",    label: "Prayers",        icon: Moon,     color: "#10b981" },
  { key: "training",   label: "Training",        icon: Dumbbell, color: "#f59e0b" },
  { key: "music",      label: "Creative",        icon: Music2,   color: "#f97316" },
  { key: "writing",    label: "Writing",         icon: PenLine,  color: "#a78bfa" },
  { key: "gratitude",  label: "Gratitude",       icon: Heart,    color: "#ec4899" },
  { key: "meditation", label: "Meditation",      icon: Sparkles, color: "#818cf8" },
] as const;

function medalColor(rank: number) {
  if (rank === 0) return "#fbbf24";
  if (rank === 1) return "#94a3b8";
  if (rank === 2) return "#c2732a";
  return "var(--muted-foreground)";
}

export default async function LeaderboardPage() {
  const data = await getLeaderboardData();
  const hasData = data.totalDays > 0;
  const badges = getAchievements(data);
  const [{ entries, viewerEntry }, optedIn] = await Promise.all([
    getGlobalLeaderboard(),
    getLeaderboardOptIn(),
  ]);

  const personalContent = (
    <>
      {!hasData && (
        <div className="glass p-12 text-center text-muted-foreground">
          <Trophy className="w-12 h-12 mx-auto opacity-15 mb-4" />
          <p className="font-medium">No records yet.</p>
          <p className="text-sm mt-1">Head to <a href="/daily" className="text-[#173eff] hover:underline">Daily Check-in</a> and log your first day.</p>
        </div>
      )}

      {/* Achievements */}
      <div>
        <SectionHeader title="Achievements" icon={<Award className="w-4 h-4" />} />
        <div className="mt-3">
          <Achievements badges={badges} />
        </div>
      </div>

      {hasData && (
        <>
          {/* Overall stats */}
          <div>
            <SectionHeader title="Overall Stats" icon={<BarChart2 className="w-4 h-4" />} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
              <StatBox label="Days logged"  value={data.totalDays}        icon={<Calendar className="w-4 h-4" />} color="#173eff" />
              <StatBox label="Best mood"    value={`${data.bestMood}/10`} icon={<Star className="w-4 h-4" />}     color="#818cf8"
                sub={data.bestMoodDate ? format(parseISO(data.bestMoodDate), "MMM d, yyyy") : undefined} />
              <StatBox label="Best day"     value={`${data.bestDayRating}/10`} icon={<Sun className="w-4 h-4" />} color="#fbbf24"
                sub={data.bestDayRatingDate ? format(parseISO(data.bestDayRatingDate), "MMM d, yyyy") : undefined} />
              <StatBox label="Gratitudes"   value={data.totalGratitudes}  icon={<Heart className="w-4 h-4" />}    color="#ec4899" />
            </div>
          </div>

          {/* Streak comparison */}
          <SpotlightCard elevated spotlightColor="rgba(23,62,255,0.12)" padding="p-6">
            <div className="flex items-center gap-2 mb-5">
              <Flame className="w-4 h-4 text-orange-400" />
              <h2 className="text-sm font-semibold">Streaks — Now vs. All-Time Best</h2>
            </div>
            <div className="space-y-4">
              {HABIT_META.map(({ key, label, icon: Icon, color }) => {
                const current = data.currentStreaks[key] ?? 0;
                const best    = data.bestStreaks[key]?.streak ?? 0;
                const pct     = best > 0 ? Math.min(100, Math.round((current / best) * 100)) : 0;
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span style={{ color }}><Icon className="w-3.5 h-3.5" /></span>
                        <span className="font-medium">{label}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
                        <span className="flex items-center gap-1"><Flame className="w-3 h-3 text-orange-400" />{current}d now</span>
                        <span className="flex items-center gap-1"><Trophy className="w-3 h-3 text-[#fbbf24]" />{best}d best</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </SpotlightCard>

          {/* All-time records */}
          <div>
            <SectionHeader title="All-Time Records" icon={<Trophy className="w-4 h-4" />} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              {HABIT_META.map(({ key, label, icon: Icon, color }) => {
                const b     = data.bestStreaks[key]?.streak ?? 0;
                const total = data.habitTotals[key] ?? 0;
                return (
                  <div key={key} className={cn(
                    "flex items-center gap-4 px-4 py-3 rounded-xl border",
                    b >= 30 ? "border-[#fbbf24]/30 bg-[#fbbf24]/5" :
                    b >= 14 ? "border-[#94a3b8]/30 bg-[#94a3b8]/5" :
                    b >= 7  ? "border-[#c2732a]/30 bg-[#c2732a]/5" :
                    "border-border bg-card"
                  )}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: `${color}18`, color }}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-[10px] text-muted-foreground">{total} total days completed</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xl font-bold"
                        style={{ color: b >= 7 ? medalColor(b >= 30 ? 0 : b >= 14 ? 1 : 2) : "var(--muted-foreground)" }}>
                        {b}<span className="text-xs font-normal text-muted-foreground">d</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground">best streak</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Best days */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <SectionHeader title="Top Rated Days" icon={<TrendingUp className="w-4 h-4" />} />
              <div className="space-y-2 mt-3">
                {data.topRatedDays.length === 0
                  ? <p className="text-sm text-muted-foreground">No rated days yet — rate your day in the evening ritual.</p>
                  : data.topRatedDays.map((d, i) => (
                    <div key={d.date} className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-border bg-card">
                      <span className="text-sm font-bold w-5 text-center" style={{ color: medalColor(i) }}>{i + 1}</span>
                      <p className="flex-1 text-sm font-medium">{format(parseISO(d.date), "EEE, MMM d yyyy")}</p>
                      <div className="flex items-center gap-1">
                        <span className="text-lg font-bold" style={{ color: d.rating >= 8 ? "#10b981" : d.rating >= 5 ? "#fbbf24" : "#94a3b8" }}>{d.rating}</span>
                        <span className="text-xs text-muted-foreground">/10</span>
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>

            <div>
              <SectionHeader title="Best Mood Days" icon={<Sparkles className="w-4 h-4" />} />
              <div className="space-y-2 mt-3">
                {data.topMoodDays.length === 0
                  ? <p className="text-sm text-muted-foreground">No mood entries yet — log mood in the Overview flow.</p>
                  : data.topMoodDays.map((d, i) => (
                    <div key={d.date} className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-border bg-card">
                      <span className="text-sm font-bold w-5 text-center" style={{ color: medalColor(i) }}>{i + 1}</span>
                      <p className="flex-1 text-sm font-medium">{format(parseISO(d.date), "EEE, MMM d yyyy")}</p>
                      <div className="flex items-center gap-1">
                        <span className="text-lg font-bold" style={{ color: d.mood >= 8 ? "#10b981" : d.mood >= 5 ? "#fbbf24" : "#94a3b8" }}>{d.mood}</span>
                        <span className="text-xs text-muted-foreground">/10</span>
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );

  const globalContent = <GlobalLeaderboard entries={entries} viewerEntry={viewerEntry} optedIn={optedIn} />;

  return (
    <div className="page max-w-4xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-[0_0_24px_#fbbf2440]"
          style={{ background: "linear-gradient(135deg,#fbbf2420,#f5970820)", border: "1px solid #fbbf2440" }}>
          <Trophy className="w-6 h-6 text-[#fbbf24]" />
        </div>
        <div>
          <p className="section-label mb-1">Records</p>
          <h1 className="text-2xl font-bold heading-gradient" style={{ fontFamily: "var(--font-heading)" }}>Leaderboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {hasData
              ? `${data.totalDays} days logged in the database`
              : "No data yet — start your daily check-in to build records."}
          </p>
        </div>
      </div>

      <LeaderboardTabs personal={personalContent} global={globalContent} />
    </div>
  );
}

function StatBox({ label, value, sub, icon, color }: {
  label: string; value: string | number; sub?: string; icon: React.ReactNode; color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span style={{ color }}>{icon}</span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function SectionHeader({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="flex-1 h-px bg-gradient-to-r from-[#173eff]/20 to-transparent ml-2" />
    </div>
  );
}
