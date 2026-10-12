"use client";

// The card that opens when you tap a building. Each building gets its own
// layout: a live list from its real data (top gigs, this month's payments,
// today's prayers, latest commits, …), pinned notes, stats, and shortcuts to
// the pages where you act on it.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, DoorOpen, Loader2, X } from "lucide-react";
import { BrandIcon, type Brand } from "@/components/brand-icon";
import { cn } from "@/lib/utils";
import { getInteriorC, type Building, type Interior } from "@/lib/client/empire";

const hud = "font-hud uppercase tracking-wide";
const cache = new Map<string, { at: number; data: Interior }>();

type Spec = { accent: string; listTitle?: string; boardTitle?: string; empty?: string; actions: { label: string; href: string }[]; brand?: Brand };
const SPECS: Record<string, Spec> = {
  radar: { accent: "#3ddc84", brand: "reddit", listTitle: "Top gigs right now", actions: [{ label: "Open Gig radar", href: "/gigs" }, { label: "Opportunities", href: "/opportunities" }] },
  autopilot: { accent: "#ea4335", brand: "gmail", listTitle: "Latest emails", actions: [{ label: "Autopilot settings", href: "/gigs" }, { label: "Deal desk", href: "/deals" }] },
  deals: { accent: "#10b981", listTitle: "Open deals", actions: [{ label: "Open Deal desk", href: "/deals" }] },
  outreach: { accent: "#25d366", brand: "whatsapp", listTitle: "Pipeline", actions: [{ label: "Open Outreach", href: "/outreach" }] },
  vault: { accent: "#e0b44c", brand: "stripe", listTitle: "This month's payments", actions: [{ label: "Add a payment", href: "/money" }, { label: "Money", href: "/money" }] },
  news: { accent: "#f97316", brand: "rss", listTitle: "Today's headlines", actions: [{ label: "Read the brief", href: "/brief" }] },
  runner: { accent: "#d97757", brand: "claude", listTitle: "Recent Claude jobs", actions: [{ label: "Connections", href: "/connections" }, { label: "Voice", href: "/voice" }] },
  community: { accent: "#5865f2", brand: "discord", listTitle: "Servers you joined", actions: [{ label: "Find communities", href: "/community" }] },
  studio: { accent: "#7c5cff", brand: "unity", listTitle: "Latest commits", boardTitle: "Playtest notes", actions: [{ label: "Game dev", href: "/game" }, { label: "Beat catalog", href: "/beats" }] },
  youtube: { accent: "#ff0033", brand: "youtube", listTitle: "Latest uploads", actions: [{ label: "YouTube studio", href: "/youtube" }] },
  mosque: { accent: "#1f9d7a", listTitle: "Today's prayers", actions: [{ label: "Spiritual", href: "/spiritual" }, { label: "Duas & Dhikr", href: "/duas" }] },
  library: { accent: "#b4553f", listTitle: "Finished books", actions: [{ label: "Reading", href: "/reading" }, { label: "Diary", href: "/diary" }] },
  gym: { accent: "#e63946", listTitle: "Recent sessions", boardTitle: "Personal records", actions: [{ label: "Training", href: "/training" }, { label: "Home workout", href: "/workout" }] },
  home: { accent: "#f59e0b", listTitle: "Hold the line", actions: [{ label: "Hold the line", href: "/hold" }] },
  hq: { accent: "#14b8a6", listTitle: "Your skills", actions: [{ label: "Level screen", href: "/level" }, { label: "World & contest", href: "/empire/world" }] },
};

export function BuildingCard({ b, onClose, onEnter, onNavigate }: { b: Building; onClose: () => void; onEnter: () => void; onNavigate: (href: string) => void }) {
  const spec = SPECS[b.id] ?? SPECS.hq;
  const [data, setData] = useState<Interior | null>(() => cache.get(b.id)?.data ?? null);

  useEffect(() => {
    const hit = cache.get(b.id);
    if (hit && Date.now() - hit.at < 60_000) return;
    let off = false;
    getInteriorC(b.id).then((d) => { cache.set(b.id, { at: Date.now(), data: d }); if (!off) setData(d); }).catch(() => {});
    return () => { off = true; };
  }, [b.id]);

  const stats = [...b.stats, ...(data?.shelf ?? [])].filter((s, i, a) => a.findIndex((x) => x.label === s.label) === i).slice(0, 6);
  return (
    <aside className="absolute z-30 inset-x-0 bottom-0 max-h-[70%] rounded-t-3xl sm:inset-x-auto sm:top-4 sm:right-4 sm:bottom-24 sm:max-h-none sm:w-[min(25rem,calc(100%-2rem))] sm:rounded-3xl bg-card border border-border shadow-2xl flex flex-col overflow-hidden pointer-events-auto animate-in slide-in-from-bottom-6 sm:slide-in-from-right-4 fade-in-0">
      <div className="relative px-4 sm:px-5 pt-4 pb-4" style={{ background: `linear-gradient(180deg, ${spec.accent}22, transparent)` }}>
        <span className="sm:hidden block mx-auto -mt-1 mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
        <div className="flex items-start gap-3">
          <span className="w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center text-2xl" style={{ background: `${spec.accent}22` }}>
            {spec.brand ? <BrandIcon name={spec.brand} className="w-6 h-6" /> : <span>{b.emoji}</span>}
          </span>
          <div className="flex-1 min-w-0">
            <p className={cn("text-xl sm:text-2xl leading-none truncate", hud)}>{b.label}</p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
              <span className={cn("w-1.5 h-1.5 rounded-full", b.working ? "bg-emerald-500 animate-pulse" : b.active ? "bg-emerald-500" : "bg-muted-foreground/40")} />
              {b.working ? "Working right now" : b.active ? "Switched on" : "Idle"} · LV {b.level}{b.neglected ? " · needs attention" : ""}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        {b.status && <p className="mt-3 text-sm">{b.status}</p>}
        {b.bubbles.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {b.bubbles.map((x) => <span key={x.text} className="rounded-full border border-border bg-background/70 px-2.5 py-0.5 text-xs font-medium">{x.text}</span>)}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5 pb-4 space-y-4">
        {stats.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl bg-muted/50 p-3">
                <p className={cn("text-lg leading-none tabular-nums truncate", hud)}>{s.value}</p>
                <p className="text-[11px] text-muted-foreground mt-1 leading-tight">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        <section>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{data?.screen.title ?? spec.listTitle}</p>
          {!data ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-3"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading live data…</div>
          ) : (
            <ul className="rounded-xl border border-border divide-y divide-border overflow-hidden">
              {data.screen.lines.map((l, i) => {
                const done = l.startsWith("✓"), pending = l.startsWith("○");
                return (
                  <li key={i} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: pending ? "var(--muted-foreground)" : spec.accent, opacity: pending ? 0.4 : 1 }} />
                    <span className={cn("min-w-0 truncate", done && "font-medium", pending && "text-muted-foreground")}>{l.replace(/^[•▶✓○📖💪+]\s?/, "")}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {data && data.board.length > 0 && (
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{spec.boardTitle ?? "Pinned"}</p>
            <div className="grid gap-2">
              {data.board.map((n, i) => (
                <p key={i} className="rounded-lg px-3 py-2 text-xs leading-snug border" style={{ background: `${["#fde68a", "#a5f3fc", "#fbcfe8", "#bbf7d0", "#ddd6fe"][i % 5]}33`, borderColor: `${spec.accent}33` }}>{n}</p>
              ))}
            </div>
          </section>
        )}

        <section className="flex flex-wrap gap-2">
          {spec.actions.map((a) => (
            <Link key={a.href + a.label} href={a.href} onClick={(e) => { e.preventDefault(); onNavigate(a.href); }}
              className="h-9 px-3 rounded-lg border border-border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-muted">
              {a.label} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          ))}
        </section>
      </div>

      <div className="px-4 sm:px-5 pt-3 border-t border-border" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <button onClick={onEnter} className="w-full h-11 rounded-xl text-white font-medium inline-flex items-center justify-center gap-2" style={{ background: spec.accent }} data-no-sfx>
          <DoorOpen className="w-4 h-4" /> Step inside {b.label}
        </button>
      </div>
    </aside>
  );
}
