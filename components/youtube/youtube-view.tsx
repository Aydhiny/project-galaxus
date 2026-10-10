"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { format, formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, Check, Clapperboard, KeyRound, Loader2, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandIcon } from "@/components/brand-icon";
import type { YoutubeVideo } from "@/lib/db/schema";
import {
  IDEA_STAGES, STAGE_LABEL, auditVideo, channelContext, channelFindings, compactNumber, formatDuration,
  isStalled, likeRate, type AuditVideo, type Issue,
} from "@/lib/youtube";
import {
  connectChannel, createIdea, removeChannel, runChannelReport, saveYoutubeKeys, syncChannel, type StudioState,
} from "@/lib/client/youtube";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { VideoDetail } from "./video-sheet";
import { IssueList, ReportText } from "./shared";
import { CommentsTab } from "./comments-tab";
import { IdeaDetail } from "./idea-sheet";

type Tab = "channel" | "work" | "comments" | "setup";

const toAudit = (v: YoutubeVideo): AuditVideo => ({ ...v, description: v.description ?? "", tags: v.tags ?? [] });

export function YoutubeView({ state }: { state: StudioState }) {
  const [tab, setTab] = useState<Tab>(state.channels.length ? "channel" : "setup");
  const [channelId, setChannelId] = useState<number | null>(state.channels[0]?.id ?? null);
  const [openVideo, setOpenVideo] = useState<number | null>(null);
  const [openIdea, setOpenIdea] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const channel = state.channels.find((c) => c.id === channelId) ?? state.channels[0] ?? null;
  const videos = useMemo(() => state.videos.filter((v) => v.channelRowId === channel?.id), [state.videos, channel?.id]);
  const audits = useMemo(() => {
    const list = videos.map(toAudit);
    const ctx = channelContext(list);
    return new Map(videos.map((v, i) => [v.id, auditVideo(list[i], ctx)]));
  }, [videos]);
  const findings = useMemo(() => channelFindings(videos.map(toAudit)), [videos]);
  const stalled = state.ideas.filter((i) => isStalled(i)).length;
  const video = state.videos.find((v) => v.id === openVideo) ?? null;
  const idea = state.ideas.find((i) => i.id === openIdea) ?? null;

  function run(fn: () => Promise<string | void>, fallback: string) {
    startTransition(async () => {
      try {
        const msg = await fn();
        if (msg) toast.success(msg);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : fallback);
      }
    });
  }

  return (
    <div className="max-w-4xl mx-auto px-5 md:px-10 py-8 md:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2.5"><BrandIcon name="youtube" className="w-8 h-8" /> YouTube</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {channel ? `${channel.title} · ${compactNumber(channel.subscribers)} subscribers` : "Connect a channel to see what's holding it back."}
            {stalled > 0 && ` · ${stalled} unfinished`}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/50">
          {(["channel", "work", "comments", "setup"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("px-3 h-7 rounded-md text-sm capitalize transition-colors", tab === t ? "bg-background shadow-xs text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {t === "comments" && state.comments.filter((c) => c.status !== "replied").length > 0 ? `comments · ${state.comments.length}` : t}
            </button>
          ))}
        </div>
      </header>

      {tab === "channel" && (
        !channel ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-sm">
            <p className="font-medium">No channel connected yet.</p>
            <p className="text-muted-foreground mt-1">Go to Setup, add a YouTube API key, and paste your channel link.</p>
            <button onClick={() => setTab("setup")} className="mt-4 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium">Open Setup</button>
          </div>
        ) : (
          <div className="space-y-8">
            {state.channels.length > 1 && (
              <div className="flex flex-wrap gap-1">
                {state.channels.map((c) => (
                  <button key={c.id} onClick={() => setChannelId(c.id)}
                    className={cn("h-8 px-3 rounded-full text-sm border", c.id === channel.id ? "border-primary bg-primary/10" : "border-border text-muted-foreground")}>
                    {c.title}
                  </button>
                ))}
              </div>
            )}

            <section className="rounded-xl border border-border p-4 flex flex-wrap items-center gap-4">
              {channel.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={channel.thumbnailUrl} alt="" className="w-14 h-14 rounded-full object-cover" />
              )}
              <div className="flex-1 min-w-40">
                <a href={`https://www.youtube.com/channel/${channel.channelId}`} target="_blank" rel="noreferrer" className="font-semibold hover:underline">{channel.title}</a>
                <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                  {channel.handle ?? ""} · {compactNumber(channel.totalViews)} views · {videos.length} videos
                  {channel.lastSyncedAt && ` · synced ${formatDistanceToNowStrict(new Date(channel.lastSyncedAt))} ago`}
                </p>
              </div>
              <button onClick={() => run(async () => { const r = await syncChannel(channel.id); return `Synced ${r.videos} videos.`; }, "Sync failed.")}
                disabled={pending} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-sm hover:bg-accent disabled:opacity-50">
                {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Sync
              </button>
            </section>

            <section>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> What&apos;s holding the channel back</h2>
              <div className="rounded-xl border border-border p-4">
                <IssueList issues={findings} empty="No channel-wide problems found. Check individual videos below." />
              </div>
            </section>

            <section className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="text-sm font-semibold flex items-center gap-1.5"><BrandIcon name="claude" className="w-4 h-4" /> Claude&apos;s review</h2>
                <button onClick={() => run(async () => { await runChannelReport(channel.id); return "Review ready."; }, "Review failed.")}
                  disabled={pending || !state.keys.anthropic} title={state.keys.anthropic ? undefined : "Add an Anthropic key in Setup"}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-sm hover:bg-accent disabled:opacity-50">
                  {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} {channel.report ? "Review again" : "Review my channel"}
                </button>
              </div>
              {channel.report ? (
                <>
                  <ReportText text={channel.report} />
                  {channel.reportAt && <p className="text-xs text-muted-foreground mt-4" suppressHydrationWarning>Written {format(new Date(channel.reportAt), "d MMM yyyy")}</p>}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Claude reads every video&apos;s numbers, the flags below, and any retention numbers or scripts you add — then tells you what to change first.</p>
              )}
            </section>

            <VideoList videos={videos} audits={audits} onOpen={(v) => setOpenVideo(v.id)} />
          </div>
        )
      )}

      {tab === "work" && <WorkTab state={state} channelRowId={channel?.id ?? null} onOpen={(id) => setOpenIdea(id)} />}

      {tab === "comments" && <CommentsTab state={state} />}

      {tab === "setup" && <SetupTab state={state} pending={pending} run={run} onConnected={() => setTab("channel")} />}

      <Sheet open={video !== null} onOpenChange={(o) => { if (!o) setOpenVideo(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 gap-0 overflow-y-auto">
          {video && <VideoDetail key={video.id} video={video} issues={audits.get(video.id) ?? []} canAsk={state.keys.anthropic} />}
        </SheetContent>
      </Sheet>
      <Sheet open={idea !== null} onOpenChange={(o) => { if (!o) setOpenIdea(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 gap-0 overflow-y-auto">
          {idea && <IdeaDetail key={idea.id} idea={idea} canAsk={state.keys.anthropic} onDeleted={() => setOpenIdea(null)} calendar={state.ideaTasks.filter((t) => t.ideaId === idea.id)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Videos ───────────────────────────────────────────────────────────────────

function VideoList({ videos, audits, onOpen }: { videos: YoutubeVideo[]; audits: Map<number, Issue[]>; onOpen: (v: YoutubeVideo) => void }) {
  const [kind, setKind] = useState<"all" | "shorts" | "long">("all");
  const [sort, setSort] = useState<"new" | "views">("new");
  const shown = videos
    .filter((v) => kind === "all" || (kind === "shorts" ? v.isShort : !v.isShort))
    .sort((a, b) => (sort === "views" ? b.views - a.views : +new Date(b.publishedAt) - +new Date(a.publishedAt)));

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold">Videos</h2>
        <div className="flex gap-1">
          {(["all", "shorts", "long"] as const).map((k) => (
            <button key={k} onClick={() => setKind(k)} className={cn("h-7 px-2.5 rounded-full text-xs border capitalize", kind === k ? "border-primary bg-primary/10" : "border-border text-muted-foreground")}>{k}</button>
          ))}
          <button onClick={() => setSort(sort === "new" ? "views" : "new")} className="h-7 px-2.5 rounded-full text-xs border border-border text-muted-foreground">
            {sort === "new" ? "Newest" : "Most viewed"}
          </button>
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">No videos here.</p>
      ) : (
        <ul className="rounded-xl border border-border divide-y divide-border">
          {shown.map((v) => {
            const issues = audits.get(v.id) ?? [];
            const high = issues.filter((i) => i.severity === "high").length;
            const medium = issues.filter((i) => i.severity === "medium").length;
            return (
              <li key={v.id}>
                <button onClick={() => onOpen(v)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/50">
                  {v.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.thumbnailUrl} alt="" className="w-20 aspect-video rounded-md object-cover bg-muted shrink-0" loading="lazy" />
                  ) : <div className="w-20 aspect-video rounded-md bg-muted shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{v.title}</p>
                    <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                      {format(new Date(v.publishedAt), "d MMM yy")} · {v.isShort ? "Short" : "Video"} {formatDuration(v.durationSec)} · {(likeRate(v) * 100).toFixed(1)}% likes
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold tabular-nums">{compactNumber(v.views)}</p>
                    <p className="text-[11px] text-muted-foreground flex items-center justify-end gap-1">
                      {high > 0 && <span className="inline-flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />{high}</span>}
                      {medium > 0 && <span className="inline-flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{medium}</span>}
                      {high + medium === 0 && "views"}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ─── Work ─────────────────────────────────────────────────────────────────────

function WorkTab({ state, channelRowId, onOpen }: { state: StudioState; channelRowId: number | null; onOpen: (id: number) => void }) {
  const [title, setTitle] = useState("");
  const [fmt, setFmt] = useState<"short" | "long">("short");
  const [showPublished, setShowPublished] = useState(false);
  const [busy, startBusy] = useTransition();

  function add() {
    if (!title.trim()) return;
    startBusy(async () => {
      try {
        const row = await createIdea({ title, format: fmt, channelRowId });
        setTitle("");
        onOpen(row.id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't add.");
      }
    });
  }

  const stages = IDEA_STAGES.filter((s) => s !== "published" || showPublished);

  return (
    <div className="space-y-6">
      <div className="flex gap-2 rounded-xl border border-border p-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="New video idea…" className="flex-1 h-9 bg-transparent px-2 text-sm outline-none" />
        <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/50">
          {(["short", "long"] as const).map((f) => (
            <button key={f} onClick={() => setFmt(f)} className={cn("px-2.5 h-7 rounded-md text-xs capitalize", fmt === f ? "bg-background shadow-xs" : "text-muted-foreground")}>{f}</button>
          ))}
        </div>
        <button onClick={add} disabled={busy || !title.trim()} className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      <p className="text-xs text-muted-foreground px-1">
        Give an idea a <b>publish date</b> and Record → Edit → Publish tasks appear on your Tasks. Out of ideas? <Link href="/game" className="underline underline-offset-4">Draft a devlog from your commits</Link>.
      </p>

      {state.ideas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
          Your pipeline is empty. Add an idea — Claude can write the script (hook first, 20–35 seconds).
        </p>
      ) : (
        stages.map((stage) => {
          const items = state.ideas.filter((i) => i.stage === stage);
          if (items.length === 0) return null;
          return (
            <section key={stage}>
              <h2 className="text-xs font-semibold text-muted-foreground mb-1.5 px-1">{STAGE_LABEL[stage]} <span className="font-normal opacity-70 ml-1">{items.length}</span></h2>
              <ul className="rounded-xl border border-border divide-y divide-border">
                {items.map((i) => (
                  <li key={i.id}>
                    <button onClick={() => onOpen(i.id)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-accent/50">
                      <Clapperboard className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 min-w-0 text-sm truncate">{i.title}</span>
                      {isStalled(i) && <span className="rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[11px] font-medium">Stuck 7d+</span>}
                      {i.dueDate && <span className="text-xs text-muted-foreground tabular-nums">{format(new Date(i.dueDate + "T12:00:00"), "d MMM")}</span>}
                      <span className="text-[11px] text-muted-foreground uppercase">{i.format}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
      {state.ideas.some((i) => i.stage === "published") && (
        <button onClick={() => setShowPublished((v) => !v)} className="text-xs font-semibold text-muted-foreground hover:text-foreground px-1">
          {showPublished ? "Hide published" : "Show published"}
        </button>
      )}
    </div>
  );
}

// ─── Setup ────────────────────────────────────────────────────────────────────

function SetupTab({ state, pending, run, onConnected }: {
  state: StudioState;
  pending: boolean;
  run: (fn: () => Promise<string | void>, fallback: string) => void;
  onConnected: () => void;
}) {
  const [link, setLink] = useState("");
  const [ytKey, setYtKey] = useState("");
  const [aiKey, setAiKey] = useState("");
  const hasYoutube = state.keys.youtube || state.keys.googleFallback;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border p-5">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Clapperboard className="w-4 h-4" /> Connect a channel</h2>
        <p className="text-xs text-muted-foreground mt-1">Any public channel — yours, or one you want to learn from.</p>
        <div className="flex gap-2 mt-4">
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="youtube.com/@yourchannel" className="input-base flex-1" />
          <button
            onClick={() => run(async () => { await connectChannel(link); setLink(""); onConnected(); return "Channel connected and synced."; }, "Couldn't connect.")}
            disabled={pending || !link.trim() || !hasYoutube}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
            {pending && <Loader2 className="w-4 h-4 animate-spin" />} Connect
          </button>
        </div>
        {!hasYoutube && <p className="text-xs text-muted-foreground mt-2">Add a YouTube API key below first.</p>}
        {state.channels.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {state.channels.map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                <span className="flex-1 truncate">{c.title}</span>
                <button onClick={() => run(async () => { await removeChannel(c.id); return "Channel removed."; }, "Couldn't remove.")}
                  aria-label={`Remove ${c.title}`} className="w-8 h-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-border p-5 space-y-5">
        <h2 className="text-sm font-semibold flex items-center gap-2"><KeyRound className="w-4 h-4" /> API keys</h2>
        <KeyRow
          label="YouTube Data API key"
          status={state.keys.youtube ? "Saved" : state.keys.googleFallback ? "Using your Google key" : null}
          value={ytKey} onChange={setYtKey}
          onSave={() => run(async () => { await saveYoutubeKeys({ youtube: ytKey }); setYtKey(""); return "YouTube key saved."; }, "Couldn't save.")}
          help={<>In <a className="underline" href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noreferrer">Google Cloud</a>, enable <b>YouTube Data API v3</b>, then create an API key under Credentials (restrict it to that API). Free — 10,000 units a day; a sync uses about 10.</>}
        />
        <KeyRow
          label="Anthropic API key (Claude reviews and scripts)"
          status={state.keys.anthropic ? "Saved" : null}
          value={aiKey} onChange={setAiKey}
          onSave={() => run(async () => { await saveYoutubeKeys({ anthropic: aiKey }); setAiKey(""); return "Anthropic key saved."; }, "Couldn't save.")}
          help={<>Shared with Outreach. From <a className="underline" href="https://platform.claude.com/settings/keys" target="_blank" rel="noreferrer">platform.claude.com → API keys</a>.</>}
        />
      </section>
    </div>
  );
}

function KeyRow({ label, status, value, onChange, onSave, help }: {
  label: string; status: string | null; value: string; onChange: (v: string) => void; onSave: () => void; help: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {status
          ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><Check className="w-3.5 h-3.5" /> {status}</span>
          : <span className="text-xs text-muted-foreground">Not set</span>}
      </div>
      <div className="flex gap-2 mt-2">
        <input type="password" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} placeholder={status ? "Paste a new key to replace" : "Paste key"} className="input-base flex-1" />
        <button onClick={onSave} disabled={!value.trim()} className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">Save</button>
      </div>
      <p className="text-xs text-muted-foreground mt-2">{help}</p>
    </div>
  );
}
