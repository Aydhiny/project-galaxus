"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, EyeOff, Loader2, RefreshCw, UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { COMMUNITY_TOPICS, type CommunityTopic } from "@/lib/community";
import { scanCommunitiesNowC, setCommunityStatusC, type CommunityList } from "@/lib/client/community";
import { BrandIcon } from "@/components/brand-icon";

const fmt = (n: number | null) => (n == null ? "–" : n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n));

export function CommunityView({ items }: { items: CommunityList }) {
  const [topic, setTopic] = useState<CommunityTopic | "all">("all");
  const [tab, setTab] = useState<"new" | "joined">("new");
  const [local, setLocal] = useState<Record<number, string>>({});
  const [busy, start] = useTransition();

  const status = (c: CommunityList[number]) => local[c.id] ?? c.status;
  const inTab = items.filter((c) => status(c) === tab);
  const list = inTab.filter((c) => topic === "all" || (c.topics as string[]).includes(topic));
  const count = (t: CommunityTopic | "all") => inTab.filter((c) => t === "all" || (c.topics as string[]).includes(t)).length;

  function mark(id: number, s: "new" | "joined" | "hidden") {
    setLocal((m) => ({ ...m, [id]: s }));
    setCommunityStatusC(id, s).catch((e) => toast.error((e as Error).message));
  }

  return (
    <div className="max-w-4xl mx-auto px-5 md:px-10 py-8 md:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-indigo-500/12 text-indigo-600 dark:text-indigo-400 flex items-center justify-center"><Users className="w-5 h-5" /></span>
            Community
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Discord servers where people build with AI, edit videos, ship websites — and find clients. Checked live, scouted daily.</p>
        </div>
        <button
          onClick={() => start(async () => {
            try {
              const r = await scanCommunitiesNowC();
              toast.success(`${r.added} new server${r.added === 1 ? "" : "s"} · checked ${r.checked} invites`);
              if (r.errors.length) toast.message(r.errors.join(" · "));
            } catch (e) { toast.error((e as Error).message); }
          })}
          disabled={busy}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-foreground text-background text-xs font-medium disabled:opacity-50 active:scale-95 transition-transform">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Scout now
        </button>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-1.5">
        {(["all", ...COMMUNITY_TOPICS.map((t) => t.key)] as const).map((k) => {
          const meta = COMMUNITY_TOPICS.find((t) => t.key === k);
          return (
            <button key={k} onClick={() => setTopic(k)}
              className={cn("h-8 px-3 rounded-full text-sm border transition-colors", topic === k ? "border-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground")}>
              {meta ? `${meta.emoji} ${meta.label}` : "All"} <span className="text-xs opacity-60 tabular-nums">{count(k)}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 inline-flex rounded-lg border border-border p-0.5 bg-muted/50">
        {(["new", "joined"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("px-3 h-7 rounded-md text-sm capitalize", tab === t ? "bg-background shadow-xs" : "text-muted-foreground")}>
            {t === "new" ? "To explore" : "Joined"}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border p-10 text-center">
          <Users className="w-8 h-8 mx-auto text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">{tab === "joined" ? "Servers you mark as joined show up here." : "Nothing yet — tap Scout now (it also runs every morning)."}</p>
        </div>
      ) : (
        <ul className="mt-4 grid sm:grid-cols-2 gap-3">
          {list.map((c, i) => (
            <li key={c.id} style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
              className="rounded-2xl border border-border bg-card p-4 flex flex-col hover:border-foreground/20 hover:shadow-md hover:-translate-y-0.5 transition-all animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both">
              <div className="flex items-start gap-3">
                <span className="w-12 h-12 rounded-2xl bg-[#5865F2]/12 flex items-center justify-center overflow-hidden shrink-0">
                  {c.icon ? <ServerIcon src={c.icon} /> : <span className="text-lg font-bold text-[#5865F2]">{c.name.slice(0, 1)}</span>}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug truncate">{c.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground flex items-center gap-2">
                    <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{fmt(c.members)}</span>
                    <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{fmt(c.online)} online</span>
                  </p>
                </div>
              </div>
              {c.description && <p className="mt-3 text-sm text-muted-foreground leading-relaxed line-clamp-3">{c.description}</p>}
              <div className="mt-3 flex flex-wrap gap-1">
                {(c.topics as string[]).map((t) => {
                  const meta = COMMUNITY_TOPICS.find((x) => x.key === t);
                  return meta ? <span key={t} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px]">{meta.emoji} {meta.label}</span> : null;
                })}
              </div>
              <div className="mt-auto pt-4 flex items-center gap-2">
                <a href={`https://discord.gg/${c.code}`} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#5865F2] text-white text-sm font-medium hover:bg-[#4752c4] active:scale-95 transition">
                  <UserPlus className="w-4 h-4" /> Join
                </a>
                {status(c) === "new" ? (
                  <button onClick={() => mark(c.id, "joined")} className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-border text-sm hover:bg-emerald-500/10">
                    <Check className="w-4 h-4" /> Joined
                  </button>
                ) : (
                  <button onClick={() => mark(c.id, "new")} className="h-9 px-3 rounded-lg border border-border text-sm text-muted-foreground hover:bg-accent">Undo</button>
                )}
                <span className="flex-1" />
                <a href={c.sourceUrl ?? "#"} target="_blank" rel="noreferrer" title={`Found on ${c.source === "github" ? "GitHub" : "Reddit"}`}
                  className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-accent">
                  {c.source === "github" ? <BrandIcon name="github" className="w-4 h-4" /> : <BrandIcon name="reddit" className="w-4 h-4" />}
                </a>
                <button onClick={() => mark(c.id, "hidden")} aria-label="Hide" className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-accent">
                  <EyeOff className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-8 text-[11px] text-muted-foreground">Found in public Reddit posts and the community-curated awesome-discord-communities list on GitHub; every invite is verified with Discord before it&apos;s shown. Galaxus never joins or posts for you.</p>
    </div>
  );
}

function ServerIcon({ src }: { src: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <Users className="w-5 h-5 text-[#5865F2]" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="w-full h-full object-cover" />;
}
