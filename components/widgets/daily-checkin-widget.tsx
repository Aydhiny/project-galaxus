import Link from "next/link";
import { CheckSquare, ArrowRight } from "lucide-react";
import type { DailyCheckin } from "@/lib/db/schema";

const CHECKIN_ITEMS = [
  { key: "training", label: "Training", emoji: "💪" },
  { key: "meditation", label: "Meditation", emoji: "🧘" },
  { key: "music", label: "Music", emoji: "🎵" },
  { key: "design", label: "Design", emoji: "🎨" },
  { key: "youtube", label: "YouTube", emoji: "📹" },
  { key: "writing", label: "Writing", emoji: "✍️" },
  { key: "gratitude", label: "Gratitude", emoji: "🙏" },
] as const;

export function DailyCheckinWidget({
  checkin,
}: {
  checkin: DailyCheckin | null;
}) {
  const done = CHECKIN_ITEMS.filter(
    (item) => checkin?.[item.key as keyof DailyCheckin] === true
  ).length;

  const pct = Math.round((done / CHECKIN_ITEMS.length) * 100);

  return (
    <div className="rounded-2xl border border-white/6 bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CheckSquare className="w-4 h-4 text-[var(--gold)]" />
          <h3 className="text-sm font-semibold">Today&apos;s Check-in</h3>
        </div>
        <Link
          href="/daily"
          className="text-xs text-[var(--gold)] hover:opacity-80 flex items-center gap-1 transition-opacity"
        >
          Update
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
          <span>{done}/{CHECKIN_ITEMS.length} activities</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
          <div
            className="h-full rounded-full progress-bar transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {CHECKIN_ITEMS.map((item) => {
          const isDone = checkin?.[item.key as keyof DailyCheckin] === true;
          return (
            <div
              key={item.key}
              className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg border text-center transition-colors ${
                isDone ? "streak-active" : "streak-inactive"
              }`}
            >
              <span className="text-base">{item.emoji}</span>
              <span
                className={`text-[10px] font-medium ${
                  isDone ? "text-[var(--gold)]" : "text-muted-foreground"
                }`}
              >
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
