"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import { Bell, BellOff, ExternalLink, Loader2, Newspaper, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { DIGEST_SECTIONS, SECTION_META, type DigestItem, type DigestSection } from "@/lib/digest";
import { buildBriefNowC, setBriefNotificationsC, type BriefState } from "@/lib/client/brief";
import { BrandIcon } from "@/components/brand-icon";

const TONE: Record<DigestSection, string> = {
  islam: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  bosnia: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  world: "bg-amber-500/12 text-amber-800 dark:text-amber-200",
  tech: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  science: "bg-lime-500/12 text-lime-800 dark:text-lime-300",
};

/** Hotlinked image that quietly disappears if the outlet blocks it. */
function StoryImage({ src, className }: { src: string | null; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className={cn("object-cover bg-muted", className)} />
  );
}

type Story = { item: DigestItem; headline: string; summary: string; why?: string };

export function BriefView({ state }: { state: BriefState }) {
  const router = useRouter();
  const [notify, setNotify] = useState(state.notify);
  const [busy, start] = useTransition();
  const d = state.digest;
  const byId = new Map((d?.items ?? []).map((i) => [i.id, i]));
  const writing = state.pending;

  // While Claude is still writing, check back every 20 seconds.
  useEffect(() => {
    if (!writing) return;
    const t = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(t);
  }, [writing, router]);

  const sections: { section: DigestSection; stories: Story[] }[] = d?.briefing
    ? d.briefing.sections.map((s) => ({
        section: s.section,
        stories: s.items.flatMap((b) => (byId.get(b.id) ? [{ item: byId.get(b.id)!, headline: b.headline, summary: b.summary, why: b.why }] : [])),
      }))
    : DIGEST_SECTIONS.map((section) => ({
        section,
        stories: (d?.items ?? []).filter((i) => i.section === section).slice(0, 6).map((i) => ({ item: i, headline: i.title, summary: i.snippet })),
      })).filter((s) => s.stories.length > 0);
  const hero = sections.flatMap((s) => s.stories).find((s) => s.item.image) ?? sections[0]?.stories[0];

  return (
    <div className="max-w-4xl mx-auto px-5 md:px-10 py-8 md:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-400 flex items-center justify-center"><Newspaper className="w-5 h-5" /></span>
            Daily brief
          </h1>
          <p className="text-sm text-muted-foreground mt-1" suppressHydrationWarning>
            {d ? format(new Date(String(d.day) + "T12:00:00"), "EEEE, d MMMM") : "Islam, Bosnia, the world, tech and nature — every morning."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => start(async () => {
              try { await setBriefNotificationsC(!notify); setNotify(!notify); toast.success(!notify ? "You'll get a notification each morning." : "Morning notifications off."); }
              catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save."); }
            })}
            className={cn("inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs", notify ? "border-primary/40 bg-primary/10" : "border-border text-muted-foreground")}>
            {notify ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />} {notify ? "Notifying me" : "Notifications off"}
          </button>
          <button
            onClick={() => start(async () => {
              try { const r = await buildBriefNowC(); toast.success(`${r.stories} stories collected — Claude is writing your brief.`); }
              catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't build."); }
            })}
            disabled={busy}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs hover:bg-accent disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} {d ? "Refresh" : "Get today's brief"}
          </button>
        </div>
      </header>

      {!d ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="font-medium">Your first brief is one tap away.</p>
          <p className="text-sm text-muted-foreground mt-1">After that it builds itself every morning around 07:00 and lands in your notifications.</p>
        </div>
      ) : (
        <>
          {d.briefing?.oneLiner ? (
            <p className="mt-6 text-lg leading-relaxed">
              <BrandIcon name="claude" className="w-4 h-4 inline-block mr-2 align-[-2px]" />{d.briefing.oneLiner}
            </p>
          ) : writing ? (
            <p className="mt-6 inline-flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Claude is writing today&apos;s summary — headlines below in the meantime.
            </p>
          ) : (
            <p className="mt-6 text-sm text-muted-foreground">Today&apos;s headlines. (Claude&apos;s summary wasn&apos;t available — check the Claude runner in Voice.)</p>
          )}

          {hero && (
            <a href={hero.item.link} target="_blank" rel="noreferrer" className="mt-6 block rounded-2xl border border-border overflow-hidden bg-card group">
              {hero.item.image && <StoryImage src={hero.item.image} className="w-full aspect-[2/1] group-hover:opacity-95" />}
              <div className="p-5">
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", TONE[hero.item.section])}>{SECTION_META[hero.item.section].emoji} {SECTION_META[hero.item.section].label}</span>
                <h2 className="mt-2 text-xl font-semibold leading-snug">{hero.headline}</h2>
                {hero.summary && <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{hero.summary}</p>}
                <p className="mt-3 text-xs text-muted-foreground inline-flex items-center gap-1">{hero.item.source} <ExternalLink className="w-3 h-3" /></p>
              </div>
            </a>
          )}

          <div className="mt-8 space-y-10">
            {sections.map((s) => (
              <section key={s.section}>
                <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <span className={cn("rounded-md px-1.5 py-0.5", TONE[s.section])}>{SECTION_META[s.section].emoji}</span> {SECTION_META[s.section].label}
                </h2>
                <ul className="space-y-3">
                  {s.stories.filter((st) => st !== hero).map((st) => (
                    <li key={st.item.id}>
                      <a href={st.item.link} target="_blank" rel="noreferrer" className="flex gap-4 rounded-xl border border-border bg-card p-3 hover:bg-accent/40 transition-colors">
                        <StoryImage src={st.item.image} className="w-28 h-20 sm:w-36 sm:h-24 rounded-lg shrink-0" />
                        <div className="min-w-0 flex-1">
                          <h3 className="text-[15px] font-medium leading-snug">{st.headline}</h3>
                          {st.summary && <p className="mt-1 text-sm text-muted-foreground leading-relaxed line-clamp-3">{st.summary}</p>}
                          {st.why && <p className="mt-1 text-xs text-foreground/80"><span className="font-medium">Why it matters:</span> {st.why}</p>}
                          <p className="mt-1.5 text-[11px] text-muted-foreground" suppressHydrationWarning>
                            {st.item.source}{st.item.publishedAt ? ` · ${formatDistanceToNowStrict(new Date(st.item.publishedAt))} ago` : ""}
                          </p>
                        </div>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {state.days.length > 1 && (
            <nav className="mt-12 flex flex-wrap gap-1.5 text-xs" aria-label="Earlier briefs">
              <span className="text-muted-foreground mr-1 self-center">Earlier:</span>
              {state.days.map((day) => (
                <Link key={String(day)} href={`/brief?day=${day}`}
                  className={cn("h-7 px-2.5 rounded-full border inline-flex items-center", String(day) === String(d.day) ? "border-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground")}>
                  {format(new Date(String(day) + "T12:00:00"), "EEE d")}
                </Link>
              ))}
            </nav>
          )}
          <p className="mt-8 text-[11px] text-muted-foreground">Headlines and images link to and are loaded from each outlet; summaries are written by Claude from headlines only. Sources: Al Jazeera, AboutIslam, MuslimMatters, 5Pillars, Klix, N1, BBC, The Guardian, Ars Technica, The Verge, Hacker News, Science News, Nature, ScienceDaily, Mongabay.</p>
        </>
      )}
    </div>
  );
}
