"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trophy, Flame, Award, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { setLeaderboardOptIn } from "@/lib/actions/leaderboard";
import type { GlobalLeaderboardEntry } from "@/lib/actions/leaderboard";

function medalColor(rank: number) {
  if (rank === 1) return "#fbbf24";
  if (rank === 2) return "#94a3b8";
  if (rank === 3) return "#c2732a";
  return "var(--muted-foreground)";
}

export function GlobalLeaderboard({
  entries,
  viewerEntry,
  optedIn: initialOptedIn,
}: {
  entries: GlobalLeaderboardEntry[];
  viewerEntry: GlobalLeaderboardEntry | null;
  optedIn: boolean;
}) {
  const router = useRouter();
  const [optedIn, setOptedIn] = useState(initialOptedIn);
  const [toggling, setToggling] = useState(false);

  async function handleToggle() {
    setToggling(true);
    const next = !optedIn;
    await setLeaderboardOptIn(next);
    setOptedIn(next);
    setToggling(false);
    toast.success(next ? "You're on the leaderboard!" : "You've been removed from the leaderboard.");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
        <div>
          <p className="text-sm font-medium">
            {optedIn ? "You're on the public leaderboard" : "Join the public leaderboard"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {optedIn
              ? "Your name, total days, best streak, and badge count are visible to other users."
              : "Opt in to show your total days logged, best streak, and badge count to other users."}
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={toggling}
          className={cn(
            "shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
            optedIn
              ? "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
              : "border-[#173eff]/40 bg-[#173eff]/10 text-[#3758f9] hover:bg-[#173eff]/15"
          )}
        >
          {toggling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : optedIn ? "Hide me" : "Join"}
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="glass p-12 text-center text-muted-foreground">
          <Trophy className="w-12 h-12 mx-auto opacity-15 mb-4" />
          <p className="font-medium">No one&apos;s on the leaderboard yet.</p>
          <p className="text-sm mt-1">Be the first to join.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => (
            <div
              key={e.userId}
              className={cn(
                "flex items-center gap-4 px-4 py-3 rounded-xl border",
                e.isSelf ? "border-[#173eff]/40 bg-[#173eff]/5" : "border-border bg-card"
              )}
            >
              <span className="text-sm font-bold w-6 text-center shrink-0" style={{ color: medalColor(e.rank) }}>
                {e.rank}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{e.name}{e.isSelf && <span className="text-muted-foreground font-normal"> (you)</span>}</p>
                <p className="text-[10px] text-muted-foreground">{e.totalDays} days logged</p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                <Flame className="w-3.5 h-3.5 text-orange-400" />
                {e.bestOverall.streak}d {e.bestOverall.label}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                <Award className="w-3.5 h-3.5 text-[#fbbf24]" />
                {e.badgeCount}
              </div>
            </div>
          ))}
          {viewerEntry && viewerEntry.rank > entries.length && (
            <>
              <div className="text-center text-xs text-muted-foreground py-1">···</div>
              <div className="flex items-center gap-4 px-4 py-3 rounded-xl border border-[#173eff]/40 bg-[#173eff]/5">
                <span className="text-sm font-bold w-6 text-center shrink-0 text-muted-foreground">{viewerEntry.rank}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{viewerEntry.name} <span className="text-muted-foreground font-normal">(you)</span></p>
                  <p className="text-[10px] text-muted-foreground">{viewerEntry.totalDays} days logged</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                  <Flame className="w-3.5 h-3.5 text-orange-400" />
                  {viewerEntry.bestOverall.streak}d {viewerEntry.bestOverall.label}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                  <Award className="w-3.5 h-3.5 text-[#fbbf24]" />
                  {viewerEntry.badgeCount}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
