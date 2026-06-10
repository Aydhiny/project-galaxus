import { getRecentCheckins } from "@/lib/actions/checkin";
import { getBooks } from "@/lib/actions/books";
import { getCourses } from "@/lib/actions/courses";
import { getJournalEntries } from "@/lib/actions/journal";
import { BarChart3, TrendingUp, Trophy, Calendar, Star } from "lucide-react";
import { format, startOfWeek, endOfWeek, subWeeks, eachDayOfInterval, isWithinInterval } from "date-fns";
import type { DailyCheckin } from "@/lib/db/schema";

// ─── Helpers ────────────────────────────────────────────────────────────────

function getWeekInterval(offset = 0) {
  const now = subWeeks(new Date(), offset);
  return {
    start: startOfWeek(now, { weekStartsOn: 1 }),
    end: endOfWeek(now, { weekStartsOn: 1 }),
  };
}

function allPrayers(row: DailyCheckin) {
  return !!(row.fajr && row.dhuhr && row.asr && row.maghrib && row.isha);
}

function prayerCount(row: DailyCheckin) {
  return [row.fajr, row.dhuhr, row.asr, row.maghrib, row.isha].filter(Boolean).length;
}

const PRAYER_NAMES = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
const HABIT_KEYS = [
  { key: "prayers", label: "Prayers", color: "bg-[var(--emerald)]" },
  { key: "training", label: "Training", color: "bg-orange-500" },
  { key: "meditation", label: "Meditation", color: "bg-purple-500" },
  { key: "music", label: "Music", color: "bg-blue-500" },
  { key: "gratitude", label: "Gratitude", color: "bg-rose-500" },
  { key: "writing", label: "Writing", color: "bg-[var(--gold)]" },
];

const QUOTES = [
  "The secret of getting ahead is getting started. — Mark Twain",
  "Discipline is the bridge between goals and accomplishment. — Jim Rohn",
  "Whoever treads a path in search of knowledge, Allah will make easy for him the path to Jannah.",
  "Small daily improvements over time lead to stunning results.",
  "You don't rise to the level of your goals — you fall to the level of your systems.",
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function ReviewPage() {
  const [checkins, books, courses, journalEntries] = await Promise.all([
    getRecentCheckins(60),
    getBooks(),
    getCourses(),
    getJournalEntries(),
  ]);

  const thisWeek = getWeekInterval(0);
  const lastWeek = getWeekInterval(1);

  const days = eachDayOfInterval({ start: thisWeek.start, end: thisWeek.end });

  function checkinsInRange(interval: { start: Date; end: Date }) {
    return checkins.filter((c) =>
      isWithinInterval(new Date(c.date + "T12:00"), interval)
    );
  }

  const thisWeekCheckins = checkinsInRange(thisWeek);
  const lastWeekCheckins = checkinsInRange(lastWeek);

  // ── This week stats
  const totalPrayers = thisWeekCheckins.reduce((acc, r) => acc + prayerCount(r), 0);
  const trainingDays = thisWeekCheckins.filter((r) => r.training).length;
  const meditationDays = thisWeekCheckins.filter((r) => r.meditation).length;
  const musicDays = thisWeekCheckins.filter((r) => r.music).length;
  const gratitudeDays = thisWeekCheckins.filter((r) => r.gratitude).length;
  const writingDays = thisWeekCheckins.filter((r) => r.writing).length;

  // ── Last week stats
  const lastPrayers = lastWeekCheckins.reduce((acc, r) => acc + prayerCount(r), 0);
  const lastTraining = lastWeekCheckins.filter((r) => r.training).length;
  const lastMeditation = lastWeekCheckins.filter((r) => r.meditation).length;

  // ── Books & courses completed this week
  const booksThisWeek = books.filter((b) => {
    if (!b.completedAt) return false;
    return isWithinInterval(new Date(b.completedAt + "T12:00"), thisWeek);
  }).length;

  const journalThisWeek = journalEntries.filter((e) => {
    return isWithinInterval(new Date(e.date + "T12:00"), thisWeek);
  }).length;

  // ── Weekly wins
  const wins: string[] = [];
  if (trainingDays >= 5) wins.push(`You trained ${trainingDays}/7 days this week 💪`);
  else if (trainingDays >= 3) wins.push(`${trainingDays} training sessions completed`);
  if (totalPrayers === 35) wins.push("Perfect prayer week — all 35 prayers ✨");
  else if (totalPrayers >= 25) wins.push(`${totalPrayers}/35 prayers this week — keep going`);
  if (meditationDays >= 5) wins.push(`Meditated ${meditationDays} days — mental clarity is building`);
  if (musicDays >= 4) wins.push(`${musicDays} days of music production — the craft is growing`);
  if (journalThisWeek >= 5) wins.push(`${journalThisWeek} journal entries — great reflection habit`);
  if (booksThisWeek > 0) wins.push(`Finished ${booksThisWeek} book${booksThisWeek > 1 ? "s" : ""} this week 📚`);
  if (wins.length === 0) wins.push("This week is an opportunity — every day is a new start.");

  // ── Quote
  const quote = QUOTES[new Date().getDay() % QUOTES.length];

  // ── Helper: get checkin for a specific day
  function checkinForDay(day: Date): DailyCheckin | null {
    const dateStr = format(day, "yyyy-MM-dd");
    return thisWeekCheckins.find((c) => c.date === dateStr) ?? null;
  }

  function getHabitDone(row: DailyCheckin | null, key: string): boolean {
    if (!row) return false;
    if (key === "prayers") return allPrayers(row);
    return !!(row as any)[key];
  }

  function delta(current: number, prev: number) {
    const diff = current - prev;
    if (diff === 0) return <span className="text-muted-foreground text-xs">—</span>;
    return (
      <span className={diff > 0 ? "text-[var(--emerald)] text-xs" : "text-red-400 text-xs"}>
        {diff > 0 ? "+" : ""}{diff}
      </span>
    );
  }

  return (
    <div className="page max-w-4xl">
      {/* Header */}
      <div>
        <p className="section-label mb-1">Reflect</p>
        <h1 className="text-2xl font-bold heading-gradient" style={{ fontFamily: "var(--font-heading)" }}>Weekly Review</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {format(thisWeek.start, "MMM d")} – {format(thisWeek.end, "MMM d, yyyy")}
        </p>
      </div>

      {/* Weekly habit grid */}
      <div className="glass p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Calendar className="w-4 h-4 text-[var(--gold)]" />
          <h2 className="text-sm font-semibold">Week at a Glance</h2>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-8 gap-1 text-[10px] text-muted-foreground">
          <div />
          {days.map((d) => (
            <div key={d.toISOString()} className="text-center font-medium">
              {format(d, "EEE")}
              <br />
              <span className="opacity-60">{format(d, "d")}</span>
            </div>
          ))}
        </div>

        {/* Habit rows */}
        {HABIT_KEYS.map((h) => (
          <div key={h.key} className="grid grid-cols-8 gap-1 items-center">
            <span className="text-[10px] text-muted-foreground truncate pr-1">{h.label}</span>
            {days.map((d) => {
              const row = checkinForDay(d);
              const done = getHabitDone(row, h.key);
              const isPast = d <= new Date();
              return (
                <div
                  key={d.toISOString()}
                  className={`h-7 rounded-lg flex items-center justify-center ${
                    done
                      ? `${h.color} opacity-80`
                      : isPast
                      ? "bg-white/5"
                      : "bg-white/[0.02] border border-dashed border-white/8"
                  }`}
                >
                  {done && <span className="text-white text-[10px]">✓</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Prayers", icon: <Star className="w-4 h-4" />, value: `${totalPrayers}/35`, prev: lastPrayers, curr: totalPrayers, color: "var(--emerald)" },
          { label: "Training", icon: <TrendingUp className="w-4 h-4" />, value: `${trainingDays}/7 days`, prev: lastTraining, curr: trainingDays, color: "var(--gold)" },
          { label: "Meditation", icon: <BarChart3 className="w-4 h-4" />, value: `${meditationDays}/7 days`, prev: lastMeditation, curr: meditationDays, color: "#a78bfa" },
          { label: "Music", icon: <BarChart3 className="w-4 h-4" />, value: `${musicDays}/7 days`, prev: null, curr: musicDays, color: "#60a5fa" },
          { label: "Journal Entries", icon: <BarChart3 className="w-4 h-4" />, value: `${journalThisWeek}`, prev: null, curr: null, color: "#f97316" },
          { label: "Books Finished", icon: <Trophy className="w-4 h-4" />, value: `${booksThisWeek}`, prev: null, curr: null, color: "var(--gold)" },
        ].map((card, i) => (
          <div key={i} className="glass p-4 space-y-2">
            <div className="flex items-center gap-1.5" style={{ color: card.color }}>
              {card.icon}
              <span className="text-xs text-muted-foreground">{card.label}</span>
            </div>
            <p className="text-xl font-bold" style={{ color: card.color }}>{card.value}</p>
            {card.prev != null && card.curr != null && (
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                vs last week: {delta(card.curr, card.prev)}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Weekly wins */}
      <div className="glass p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-[var(--gold)]" />
          <h2 className="text-sm font-semibold">Weekly Wins</h2>
        </div>
        <ul className="space-y-2">
          {wins.map((w, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
              <span className="text-[var(--gold)] mt-0.5">›</span>
              {w}
            </li>
          ))}
        </ul>
      </div>

      {/* Per-day prayer breakdown */}
      <div className="glass p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Star className="w-4 h-4 text-[var(--emerald)]" /> Daily Prayers Breakdown
        </h2>
        <div className="space-y-2">
          {days.map((d) => {
            const row = checkinForDay(d);
            const prayers = [row?.fajr, row?.dhuhr, row?.asr, row?.maghrib, row?.isha];
            const count = prayers.filter(Boolean).length;
            return (
              <div key={d.toISOString()} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-10 shrink-0">{format(d, "EEE")}</span>
                <div className="flex gap-1.5">
                  {PRAYER_NAMES.map((name, pi) => (
                    <div
                      key={name}
                      title={name}
                      className={`w-7 h-7 rounded-lg text-[9px] flex items-center justify-center font-medium ${
                        prayers[pi]
                          ? "bg-[var(--emerald)]/20 text-[var(--emerald)] border border-[var(--emerald)]/40"
                          : "bg-white/5 text-muted-foreground border border-white/6"
                      }`}
                    >
                      {name[0]}
                    </div>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">{count}/5</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Motivational quote */}
      <div className="glass p-5 text-center space-y-2">
        <p className="text-sm text-foreground/70 italic leading-relaxed">"{quote}"</p>
      </div>
    </div>
  );
}
