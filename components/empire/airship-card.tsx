"use client";

// Tapping an opportunity airship opens this — you decide. Add it (the deadline
// becomes a task and the airship lands on HQ) or wave it off (it flies away).

import { CalendarPlus, Clock, ExternalLink, MapPin, Plane, ThumbsDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Airship } from "@/lib/client/empire";

const KIND = { hackathon: { label: "Hackathon", color: "#3a86ff" }, jam: { label: "Game jam", color: "#8b5cf6" }, grant: { label: "Grant", color: "#f4a300" } } as Record<string, { label: string; color: string }>;

export function AirshipCard({ a, busy, onAccept, onDismiss, onClose }: { a: Airship; busy: boolean; onAccept: () => void; onDismiss: () => void; onClose: () => void }) {
  const k = KIND[a.kind] ?? KIND.hackathon;
  const days = a.deadline ? Math.ceil((new Date(a.deadline).getTime() - Date.now()) / 86_400_000) : null;
  return (
    <aside className="absolute z-30 inset-x-0 bottom-0 max-h-[70%] rounded-t-3xl sm:inset-x-auto sm:top-4 sm:right-4 sm:bottom-auto sm:w-[min(24rem,calc(100%-2rem))] sm:rounded-3xl bg-card border border-border shadow-2xl overflow-y-auto pointer-events-auto animate-in slide-in-from-bottom-6 sm:slide-in-from-right-4 fade-in-0"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
      <div className="p-5" style={{ background: `linear-gradient(180deg, ${k.color}22, transparent)` }}>
        <div className="flex items-start gap-3">
          <span className="w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center" style={{ background: `${k.color}22`, color: k.color }}><Plane className="w-5 h-5" /></span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: k.color }}>{k.label} · match {a.score}</p>
            <p className="font-semibold leading-snug mt-0.5">{a.title}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
          {days != null && <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5", days <= 7 ? "bg-rose-500/12 text-rose-600 dark:text-rose-400" : "bg-muted text-muted-foreground")}><Clock className="w-3 h-3" />{days <= 0 ? "closes today" : `${days} days left`}</span>}
          {a.location && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground"><MapPin className="w-3 h-3" />{a.location}</span>}
          {a.prize && <span className="rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 px-2 py-0.5">🏆 {a.prize}</span>}
        </div>
        {a.summary && <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{a.summary.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}</p>}
      </div>
      <div className="px-5 grid gap-2">
        <button onClick={onAccept} disabled={busy} className="h-11 rounded-xl bg-foreground text-background font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50">
          <CalendarPlus className="w-4 h-4" /> Add to my tasks{a.deadline ? " with the deadline" : ""}
        </button>
        <div className="grid grid-cols-2 gap-2">
          {a.url && <a href={a.url} target="_blank" rel="noopener noreferrer" className="h-10 rounded-xl border border-border text-sm inline-flex items-center justify-center gap-1.5 hover:bg-muted"><ExternalLink className="w-4 h-4" /> Open</a>}
          <button onClick={onDismiss} disabled={busy} className={cn("h-10 rounded-xl border border-border text-sm inline-flex items-center justify-center gap-1.5 hover:bg-muted", !a.url && "col-span-2")}><ThumbsDown className="w-4 h-4" /> Not for me</button>
        </div>
      </div>
    </aside>
  );
}
