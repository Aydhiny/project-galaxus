"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import { ArrowLeft, Check, Copy, ExternalLink, Loader2, MessagesSquare, Plus, RefreshCw, Search, Send, Settings2, SkipForward, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RedditCommunity, RedditPost } from "@/lib/db/schema";
import { buildSubmitUrl } from "@/lib/reddit";
import {
  addRedditCommunityC, discoverCommunitiesC, draftRedditPostC, markRedditPostedC, redraftRedditPostC, refreshCommunitiesC,
  saveRedditSettingsC, setRedditCommunityStatusC, skipRedditPostC, updateRedditPostC, type RedditState,
} from "@/lib/client/reddit";
import { ClaudeJob } from "@/components/claude-job";

type Job = { id: number; dispatched: boolean; label: string };

const POLICY: Record<string, { label: string; tone: string }> = {
  ok: { label: "Promo OK", tone: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" },
  restricted: { label: "Limits apply", tone: "bg-amber-500/12 text-amber-800 dark:text-amber-200" },
  banned: { label: "No self-promo", tone: "bg-red-500/12 text-red-700 dark:text-red-300" },
  unknown: { label: "Rules not read", tone: "bg-muted text-muted-foreground" },
};

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied.`);
  } catch {
    toast.error("Couldn't copy — select the text and copy it by hand.");
  }
}

export function RedditView({ state }: { state: RedditState }) {
  return (
    <div className="max-w-4xl mx-auto px-5 md:px-10 py-8 md:py-12 space-y-8">
      <header>
        <Link href="/game" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="w-3 h-3" /> Game dev
        </Link>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-orange-500/12 text-orange-600 dark:text-orange-400 flex items-center justify-center"><MessagesSquare className="w-5 h-5" /></span>
          Reddit
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          One honest post a day, written for a community that cares about what you built. Galaxus drafts it — you read it and press Post.
        </p>
      </header>

      {!state.redditConnected && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-sm">
          <b>Reddit key needed.</b> Reading each community&apos;s rules requires Reddit&apos;s free app key. Save it once in{" "}
          <Link href="/connections" className="underline underline-offset-4">Connections → Reddit</Link> — Gig radar uses the same key.
        </div>
      )}

      <TodayCard state={state} />
      <CommunitiesCard state={state} />
      <SettingsCard state={state} />
      <HistoryCard state={state} />
    </div>
  );
}

// ─── Today's post ─────────────────────────────────────────────────────────────

function TodayCard({ state }: { state: RedditState }) {
  const open = state.posts.find((p) => p.status === "draft");
  const queued = !open ? state.posts.find((p) => p.status === "queued" && p.day === state.today) : undefined;
  const [job, setJob] = useState<Job | null>(null);
  const [busy, start] = useTransition();

  function draft() {
    start(async () => {
      try {
        const r = await draftRedditPostC();
        if (!r.queued) { toast.message(r.reason); return; }
        setJob({ id: r.jobId, dispatched: r.dispatched, label: `Writing a post for r/${r.subreddit}` });
      } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't start."); }
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-orange-500/12 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0"><Send className="w-5 h-5" /></span>
        <div className="flex-1">
          <h2 className="font-semibold">Today&apos;s post</h2>
          <p className="text-sm text-muted-foreground">
            {open ? `Ready for r/${open.subreddit}.` : state.next ? `Next up: r/${state.next}.` : "No community is ready yet — refresh them below."}
          </p>
        </div>
        {!open && (
          <button onClick={draft} disabled={busy || !!queued || !!job}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-foreground text-background text-sm font-semibold disabled:opacity-50 shrink-0">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Draft today&apos;s post
          </button>
        )}
      </div>

      {job && <div className="mt-4"><ClaudeJob jobId={job.id} dispatched={job.dispatched} label={job.label} onDone={() => setJob(null)} /></div>}
      {!job && queued && (
        <p className="mt-4 text-sm text-muted-foreground">Claude is writing the r/{queued.subreddit} post… it appears here when it&apos;s done (refresh in a minute).</p>
      )}
      {open && (
        <DraftEditor
          key={`${open.id}:${open.title}:${open.body?.length}`}
          post={open}
          community={state.communities.find((c) => c.id === open.communityId)}
          wishlist={!!state.settings.wishlistUrl}
          onJob={setJob}
        />
      )}
    </section>
  );
}

function DraftEditor({ post, community, wishlist, onJob }: { post: RedditPost; community?: RedditCommunity; wishlist: boolean; onJob: (j: Job) => void }) {
  const [title, setTitle] = useState(post.title ?? "");
  const [body, setBody] = useState(post.body ?? "");
  const [comment, setComment] = useState(post.firstComment ?? "");
  const [posting, setPosting] = useState(false);
  const [postUrl, setPostUrl] = useState("");
  const [busy, start] = useTransition();
  const submit = buildSubmitUrl(post.subreddit, title, body);

  const save = (patch: { title?: string; body?: string; firstComment?: string }) =>
    updateRedditPostC(post.id, patch).catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't save."));

  return (
    <div className="mt-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <a href={`https://www.reddit.com/r/${post.subreddit}`} target="_blank" rel="noreferrer" className="font-semibold hover:underline">r/{post.subreddit}</a>
        {community && <span className={cn("rounded-full px-2 py-0.5 font-medium", POLICY[community.promoPolicy]?.tone)}>{POLICY[community.promoPolicy]?.label}</span>}
        {post.flairHint && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">Flair: {post.flairHint}</span>}
      </div>

      {(post.warnings ?? []).map((w) => (
        <p key={w} className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">{w}</p>
      ))}

      <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== post.title && save({ title })}
        maxLength={300} aria-label="Post title" className="input-base w-full font-medium" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} onBlur={() => body !== post.body && save({ body })}
        rows={9} aria-label="Post text" className="input-base w-full leading-relaxed" />

      {post.mediaHint && (
        <p className="text-sm"><span className="font-medium">Attach:</span> <span className="text-muted-foreground">{post.mediaHint}</span> <span className="text-xs text-muted-foreground">(Reddit can&apos;t pre-attach files — add it on the submit page.)</span></p>
      )}

      {(post.firstComment || wishlist) && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">First comment — post it right after, only if people show interest</p>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} onBlur={() => comment !== (post.firstComment ?? "") && save({ firstComment: comment })}
            rows={3} aria-label="First comment" className="input-base w-full" placeholder="(none — this community's rules don't clearly allow links)" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <a href={submit.url} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-foreground text-background text-sm font-semibold">
          <ExternalLink className="w-4 h-4" /> Open on Reddit
        </a>
        <button onClick={() => copy(title, "Title")} className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border border-border text-sm hover:bg-accent"><Copy className="w-3.5 h-3.5" /> Title</button>
        <button onClick={() => copy(body, "Text")} className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border border-border text-sm hover:bg-accent"><Copy className="w-3.5 h-3.5" /> Text</button>
        {comment && <button onClick={() => copy(comment, "Comment")} className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border border-border text-sm hover:bg-accent"><Copy className="w-3.5 h-3.5" /> Comment</button>}
        <span className="flex-1" />
        <button disabled={busy} onClick={() => start(async () => {
          try { const r = await redraftRedditPostC(post.id); onJob({ id: r.jobId, dispatched: r.dispatched, label: `New draft for r/${r.subreddit}` }); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't start."); }
        })} className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border border-border text-sm hover:bg-accent disabled:opacity-50"><RefreshCw className="w-3.5 h-3.5" /> Rewrite</button>
        <button disabled={busy} onClick={() => start(async () => { try { await skipRedditPostC(post.id); toast.success("Skipped — I'll pick another community."); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't skip."); } })}
          className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border border-border text-sm hover:bg-accent disabled:opacity-50"><SkipForward className="w-3.5 h-3.5" /> Skip</button>
      </div>
      {submit.truncated && <p className="text-xs text-amber-700 dark:text-amber-300">The text was too long for a link, so Reddit will open with a shortened version — use Copy → Text to paste the full post.</p>}

      <div className="pt-1">
        {!posting ? (
          <button onClick={() => setPosting(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-300 hover:underline"><Check className="w-4 h-4" /> I posted it</button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <input value={postUrl} onChange={(e) => setPostUrl(e.target.value)} placeholder="Paste the post link (optional)" className="input-base flex-1 min-w-48" />
            <button disabled={busy} onClick={() => start(async () => {
              try { await markRedditPostedC(post.id, postUrl || undefined); toast.success("Nice — r/" + post.subreddit + " is on a one-week break."); }
              catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save."); }
            })} className="h-9 px-3 rounded-lg bg-emerald-600 text-white text-sm font-medium disabled:opacity-50">Mark as posted</button>
          </div>
        )}
      </div>

      {community?.rules && community.rules.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">r/{post.subreddit} rules ({community.rules.length}) — read them once more before posting</summary>
          <ol className="mt-2 space-y-1.5 list-decimal pl-5 text-muted-foreground">
            {community.rules.map((r, i) => <li key={i}><b className="text-foreground">{r.title}</b>{r.description ? ` — ${r.description.slice(0, 300)}` : ""}</li>)}
          </ol>
        </details>
      )}
    </div>
  );
}

// ─── Communities ──────────────────────────────────────────────────────────────

function CommunitiesCard({ state }: { state: RedditState }) {
  const [name, setName] = useState("");
  const [busy, start] = useTransition();

  function run(fn: () => Promise<string>, fail: string) {
    start(async () => {
      try { toast.success(await fn()); } catch (e) { toast.error(e instanceof Error ? e.message : fail); }
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-56">
          <h2 className="font-semibold">Communities</h2>
          <p className="text-sm text-muted-foreground">
            Galaxus reads each one&apos;s rules and never drafts where promotion is banned. {state.unread > 0 ? `${state.unread} still need their rules read.` : ""}
          </p>
        </div>
        <button disabled={busy} onClick={() => run(async () => {
          const r = await refreshCommunitiesC();
          if (r.errors.length) throw new Error(r.errors[0]);
          return `${r.refreshed} updated${r.muted ? `, ${r.muted} muted` : ""}.`;
        }, "Couldn't refresh.")} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border text-sm hover:bg-accent disabled:opacity-50">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Read rules
        </button>
        <button disabled={busy} onClick={() => run(async () => {
          const r = await discoverCommunitiesC();
          if (r.errors.length) throw new Error(r.errors[0]);
          return r.added ? `${r.added} new communities to review.` : "Nothing new found.";
        }, "Couldn't search.")} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border text-sm hover:bg-accent disabled:opacity-50">
          <Search className="w-3.5 h-3.5" /> Find more
        </button>
      </div>

      <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        <b className="text-foreground">Give first.</b> Before you post anywhere, leave one or two real comments on a thread there (open &quot;Threads to help in&quot;).
        Communities welcome members who take part — and that&apos;s also what keeps your account in good standing.
      </p>

      <ul className="mt-4 divide-y divide-border">
        {state.communities.map((c) => <CommunityRow key={c.id} c={c} next={state.next === c.name} />)}
      </ul>

      <form className="mt-4 flex gap-2" onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        run(async () => { await addRedditCommunityC(name); setName(""); return "Added."; }, "Couldn't add.");
      }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a community, e.g. r/IndieDev" className="input-base flex-1" />
        <button disabled={busy} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border text-sm hover:bg-accent disabled:opacity-50"><Plus className="w-3.5 h-3.5" /> Add</button>
      </form>
    </section>
  );
}

function CommunityRow({ c, next }: { c: RedditCommunity; next: boolean }) {
  const [busy, start] = useTransition();
  const policy = POLICY[c.promoPolicy] ?? POLICY.unknown;
  const set = (status: string) => start(async () => {
    try { await setRedditCommunityStatusC(c.id, status); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't update."); }
  });

  return (
    <li className={cn("py-3", c.status === "muted" && "opacity-55")}>
      <div className="flex flex-wrap items-center gap-2">
        <a href={`https://www.reddit.com/r/${c.name}`} target="_blank" rel="noreferrer" className="font-medium hover:underline">r/{c.name}</a>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", policy.tone)}>{policy.label}</span>
        {c.status === "suggested" && <span className="rounded-full bg-sky-500/12 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">Suggested</span>}
        {next && c.status === "active" && <span className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-medium text-background">Next up</span>}
        <span className="text-xs text-muted-foreground">{c.subscribers ? `${c.subscribers.toLocaleString("en")} members` : ""}</span>
        <span className="flex-1" />
        <span className="text-xs text-muted-foreground" suppressHydrationWarning>
          {c.lastPostedAt ? `posted ${formatDistanceToNowStrict(new Date(c.lastPostedAt))} ago` : ""}
        </span>
        {c.status === "active" ? (
          <button disabled={busy} onClick={() => set("muted")} className="text-xs text-muted-foreground hover:text-foreground">Mute</button>
        ) : (
          <button disabled={busy} onClick={() => set("active")} className="text-xs font-medium hover:underline">{c.status === "suggested" ? "Add" : "Unmute"}</button>
        )}
      </div>
      {c.promoNote && c.promoPolicy !== "ok" && <p className="mt-1 text-xs text-muted-foreground">{c.promoNote}</p>}
      {c.hot && c.hot.length > 0 && c.status !== "muted" && (
        <details className="mt-1 text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Threads to help in ({c.hot.length})</summary>
          <ul className="mt-1.5 space-y-1 pl-4 list-disc">
            {c.hot.map((h) => (
              <li key={h.url}><a href={h.url} target="_blank" rel="noreferrer" className="hover:underline">{h.title}</a> <span className="text-muted-foreground">· {h.comments} comments</span></li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function SettingsCard({ state }: { state: RedditState }) {
  const s = state.settings;
  const [f, setF] = useState({
    enabled: s.enabled, dailyCap: s.dailyCap, gameName: s.gameName, tagline: s.tagline ?? "", about: s.about ?? "",
    wishlistUrl: s.wishlistUrl ?? "", keywords: s.keywords ?? "",
  });
  const [busy, start] = useTransition();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <details open={!s.wishlistUrl}>
        <summary className="cursor-pointer flex items-center gap-2 font-semibold"><Settings2 className="w-4 h-4" /> Your game &amp; settings
          {!s.wishlistUrl && <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-200">Add your Steam link</span>}
        </summary>
        <div className="mt-4 grid gap-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs font-medium">Game name<input value={f.gameName} onChange={(e) => set("gameName", e.target.value)} className="input-base w-full mt-1" /></label>
            <label className="text-xs font-medium">Steam page (wishlist link)<input value={f.wishlistUrl} onChange={(e) => set("wishlistUrl", e.target.value)} placeholder="https://store.steampowered.com/app/…" className="input-base w-full mt-1" /></label>
          </div>
          <label className="text-xs font-medium">One line<input value={f.tagline} onChange={(e) => set("tagline", e.target.value)} className="input-base w-full mt-1" /></label>
          <label className="text-xs font-medium">Facts Claude may use — nothing outside this list gets claimed. Check these are true.
            <textarea value={f.about} onChange={(e) => set("about", e.target.value)} rows={7} className="input-base w-full mt-1 leading-relaxed" /></label>
          <label className="text-xs font-medium">Searches for new communities (comma-separated)<input value={f.keywords} onChange={(e) => set("keywords", e.target.value)} className="input-base w-full mt-1" /></label>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={f.enabled} onChange={(e) => set("enabled", e.target.checked)} /> Draft a post for me every day</label>
            <label className="inline-flex items-center gap-2">Max per day
              <select value={f.dailyCap} onChange={(e) => set("dailyCap", Number(e.target.value))} className="input-base h-8 w-16"><option value={1}>1</option><option value={2}>2</option></select>
            </label>
            <span className="flex-1" />
            <button disabled={busy} onClick={() => start(async () => {
              try { await saveRedditSettingsC(f); toast.success("Saved."); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save."); }
            })} className="h-9 px-4 rounded-lg bg-foreground text-background text-sm font-semibold disabled:opacity-50">Save</button>
          </div>
          <p className="text-xs text-muted-foreground">
            Every draft says you made the game, avoids links in the post, and follows the community&apos;s rules. The Steam link is only ever added to the optional first comment — and only where links are allowed.
          </p>
        </div>
      </details>
    </section>
  );
}

// ─── History ──────────────────────────────────────────────────────────────────

function HistoryCard({ state }: { state: RedditState }) {
  const rows = state.posts.filter((p) => p.status !== "draft" && p.status !== "queued").slice(0, 15);
  if (rows.length === 0) return null;
  const tone: Record<string, string> = { posted: "text-emerald-700 dark:text-emerald-300", skipped: "text-muted-foreground", failed: "text-red-600 dark:text-red-400" };
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-semibold mb-3">History</h2>
      <ul className="divide-y divide-border text-sm">
        {rows.map((p) => (
          <li key={p.id} className="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="text-xs text-muted-foreground w-20 shrink-0">{p.day}</span>
            <span className="font-medium shrink-0">r/{p.subreddit}</span>
            <span className="flex-1 min-w-40 truncate text-muted-foreground">{p.title ?? p.note ?? ""}</span>
            <span className={cn("text-xs font-medium capitalize", tone[p.status])}>{p.status}</span>
            {p.postUrl && <a href={p.postUrl} target="_blank" rel="noreferrer" className="text-xs underline underline-offset-4">open</a>}
          </li>
        ))}
      </ul>
    </section>
  );
}
