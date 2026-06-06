import { getTodayCheckin, getStreaks } from "@/lib/actions/checkin";
import { getBooks, getMonthlyReadingStats } from "@/lib/actions/books";
import { getCourses } from "@/lib/actions/courses";
import { getTodayGoalCompletions } from "@/lib/actions/goals";
import { getJournalEntries } from "@/lib/actions/journal";
import { StreakRing } from "@/components/streak-ring";
import { DailyCheckinWidget } from "@/components/widgets/daily-checkin-widget";
import { QuickGoals } from "@/components/widgets/quick-goals";
import { format } from "date-fns";
import {
  BookOpen,
  GraduationCap,
  Flame,
  Moon,
  NotebookPen,
  Dumbbell,
  Music,
  Star,
} from "lucide-react";

const ISLAMIC_GREETINGS = [
  "بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيم",
  "الحمد لله على كل حال",
  "اللهم بارك لنا في يومنا",
];

export default async function DashboardPage() {
  const [checkin, streaks, readingStats, courses, goals, recentJournal] =
    await Promise.all([
      getTodayCheckin(),
      getStreaks(),
      getMonthlyReadingStats(),
      getCourses(),
      getTodayGoalCompletions(),
      getJournalEntries(),
    ]);

  const now = new Date();
  const dayName = format(now, "EEEE");
  const dateStr = format(now, "MMMM d, yyyy");

  const prayers = [
    { key: "fajr", label: "Fajr", done: checkin?.fajr },
    { key: "dhuhr", label: "Dhuhr", done: checkin?.dhuhr },
    { key: "asr", label: "Asr", done: checkin?.asr },
    { key: "maghrib", label: "Maghrib", done: checkin?.maghrib },
    { key: "isha", label: "Isha", done: checkin?.isha },
  ];
  const prayersDone = prayers.filter((p) => p.done).length;

  const activeCourse = courses.find((c) => c.status === "in_progress");
  const completedGoals = goals.filter((g) => g.completed).length;
  const totalGoals = goals.length;

  const greeting = ISLAMIC_GREETINGS[now.getDay() % ISLAMIC_GREETINGS.length];

  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground tracking-widest uppercase">
            {dayName} · {dateStr}
          </p>
          <h1 className="text-2xl font-bold mt-1">
            As-salamu alaykum, Ajdin{" "}
            <span className="text-[var(--gold)]">✦</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5 font-arabic">
            {greeting}
          </p>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-xs text-muted-foreground">
            Goals today
          </p>
          <p className="text-2xl font-bold text-[var(--gold)]">
            {completedGoals}
            <span className="text-muted-foreground text-base font-normal">
              /{totalGoals}
            </span>
          </p>
        </div>
      </div>

      {/* Streak Rings */}
      <div>
        <h2 className="text-xs text-muted-foreground uppercase tracking-widest mb-4">
          Current Streaks
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-6 p-5 rounded-2xl border border-white/6 bg-card">
          <StreakRing
            value={streaks.prayers}
            label="Prayers"
            color="oklch(0.70 0.17 162)"
          />
          <StreakRing value={streaks.training} label="Training" />
          <StreakRing value={streaks.meditation} label="Meditation" />
          <StreakRing value={streaks.music} label="Music" color="oklch(0.65 0.20 290)" />
          <StreakRing value={streaks.gratitude} label="Gratitude" color="oklch(0.65 0.18 200)" />
          <StreakRing value={streaks.writing} label="Writing" color="oklch(0.60 0.22 25)" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Today's prayers */}
          <div className="rounded-2xl border border-white/6 bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Moon className="w-4 h-4 text-[var(--emerald)]" />
                <h3 className="text-sm font-semibold">Today&apos;s Prayers</h3>
              </div>
              <span className="text-xs text-muted-foreground">
                {prayersDone}/5 completed
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {prayers.map((p) => (
                <div
                  key={p.key}
                  className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border text-xs font-medium transition-colors ${
                    p.done ? "prayer-done" : "prayer-undone"
                  }`}
                >
                  <span className={p.done ? "text-[var(--emerald)]" : ""}>
                    {p.done ? "✓" : "○"}
                  </span>
                  {p.label}
                </div>
              ))}
            </div>
            {prayersDone < 5 && (
              <p className="text-xs text-muted-foreground mt-3 text-center">
                Go to Daily Check-in to log today&apos;s prayers →
              </p>
            )}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              icon={<BookOpen className="w-4 h-4" />}
              label="Books this month"
              value={readingStats.completedThisMonth}
              sub={`${readingStats.currentlyReading} reading`}
              color="var(--gold)"
            />
            <StatCard
              icon={<GraduationCap className="w-4 h-4" />}
              label="Active course"
              value={activeCourse ? `${activeCourse.progress}%` : "—"}
              sub={activeCourse?.title?.slice(0, 20) ?? "None active"}
              color="oklch(0.65 0.20 290)"
            />
            <StatCard
              icon={<Dumbbell className="w-4 h-4" />}
              label="Training streak"
              value={`${streaks.training}d`}
              sub={checkin?.training ? "Done today ✓" : "Not yet today"}
              color="oklch(0.65 0.18 200)"
            />
            <StatCard
              icon={<Music className="w-4 h-4" />}
              label="Music streak"
              value={`${streaks.music}d`}
              sub={checkin?.music ? "Played today ✓" : "Not yet today"}
              color="oklch(0.65 0.20 290)"
            />
          </div>

          {/* Today's check-in summary */}
          <DailyCheckinWidget checkin={checkin} />
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <QuickGoals goals={goals} />

          {/* Recent journal */}
          <div className="rounded-2xl border border-white/6 bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <NotebookPen className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Recent Journal</h3>
            </div>
            {recentJournal.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No entries yet. Start writing to reflect on your day.
              </p>
            ) : (
              <div className="space-y-3">
                {recentJournal.slice(0, 3).map((entry) => (
                  <div key={entry.id} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[10px] uppercase tracking-widest font-medium ${
                          entry.type === "gratitude"
                            ? "text-[var(--emerald)]"
                            : "text-[var(--gold)]"
                        }`}
                      >
                        {entry.type}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(entry.createdAt!), "MMM d")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {entry.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Motivational footer */}
      <div className="rounded-2xl border border-[var(--gold)]/15 bg-[var(--gold-muted)] p-5 flex items-center gap-4">
        <Star className="w-5 h-5 text-[var(--gold)] shrink-0" />
        <div>
          <p className="text-sm font-semibold text-[var(--gold)]">
            Every day is a new beginning.
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            You are building your identity one habit at a time. Stay consistent. Stay grateful.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-white/6 bg-white/2 p-4 space-y-2">
      <div className="flex items-center gap-2" style={{ color }}>
        {icon}
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="text-xl font-bold" style={{ color }}>
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}
