import {
  Footprints, Flame, CalendarCheck, Trophy, Moon, Heart, BarChart2, Star, Lock,
} from "lucide-react";
import type { Achievement } from "@/lib/achievements";
import { cn } from "@/lib/utils";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Footprints, Flame, CalendarCheck, Trophy, Moon, Heart, BarChart2, Star,
};

export function Achievements({ badges }: { badges: Achievement[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {badges.map((badge) => {
        const Icon = ICONS[badge.icon] ?? Star;
        return (
          <div
            key={badge.id}
            className={cn(
              "rounded-2xl border p-4 flex flex-col items-center text-center gap-2 transition-colors",
              badge.unlocked
                ? "border-[var(--gold)]/30 bg-[var(--gold-muted)]"
                : "border-border bg-card opacity-50"
            )}
          >
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center",
              badge.unlocked ? "bg-[var(--gold)]/15" : "bg-muted"
            )}>
              {badge.unlocked
                ? <Icon className="w-5 h-5 text-[var(--gold)]" />
                : <Lock className="w-4 h-4 text-muted-foreground" />}
            </div>
            <p className="text-xs font-semibold">{badge.label}</p>
            <p className="text-[10px] text-muted-foreground leading-snug">{badge.description}</p>
          </div>
        );
      })}
    </div>
  );
}
