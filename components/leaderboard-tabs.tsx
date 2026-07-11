"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function LeaderboardTabs({ personal, global }: { personal: ReactNode; global: ReactNode }) {
  const [tab, setTab] = useState<"personal" | "global">("personal");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1.5 p-1 rounded-xl border border-border bg-muted/30 w-fit">
        {(["personal", "global"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all",
              tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "personal" ? "My Records" : "Global"}
          </button>
        ))}
      </div>
      {tab === "personal" ? personal : global}
    </div>
  );
}
