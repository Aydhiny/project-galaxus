"use client";

import { useState, useTransition } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import { Check, Copy, EyeOff, MessageSquare, ThumbsUp } from "lucide-react";
import type { YoutubeComment } from "@/lib/db/schema";
import { draftReplies, updateComment, type StudioState } from "@/lib/client/youtube";
import { BrandIcon } from "@/components/brand-icon";
import { ClaudeJob } from "@/components/claude-job";

/**
 * Comment inbox. Claude drafts replies; you post them. Posting from Galaxus
 * would need a Google sign-in with write access to your channel — on purpose,
 * this stays copy → open on YouTube → paste.
 */
export function CommentsTab({ state }: { state: StudioState }) {
  const [job, setJob] = useState<{ id: number; dispatched: boolean } | null>(null);
  const [hidden, setHidden] = useState<Set<number>>(() => new Set());
  const [busy, start] = useTransition();
  const titleOf = (videoId: string) => state.videos.find((v) => v.videoId === videoId)?.title ?? "a video";
  const list = state.comments.filter((c) => !hidden.has(c.id));
  const waiting = list.filter((c) => c.status === "new").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {list.length === 0 ? "Inbox zero. New comments arrive when you Sync the channel." : `${list.length} comment${list.length === 1 ? "" : "s"} waiting · replying early helps small channels grow.`}
        </p>
        <button
          onClick={() => start(async () => {
            try { setJob(await draftReplies()); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't start."); }
          })}
          disabled={busy || waiting === 0}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium disabled:opacity-40">
          <BrandIcon name="claude" className="w-4 h-4" color="currentColor" /> Draft replies{waiting ? ` (${waiting})` : ""}
        </button>
      </div>
      {job && <ClaudeJob jobId={job.id} dispatched={job.dispatched} label="Drafting replies in your voice" onDone={() => setJob(null)} />}

      <ul className="space-y-3">
        {list.map((c) => (
          <CommentCard key={c.id} comment={c} video={titleOf(c.videoId)} onGone={() => setHidden((h) => new Set(h).add(c.id))} />
        ))}
      </ul>
    </div>
  );
}

function CommentCard({ comment: c, video, onGone }: { comment: YoutubeComment; video: string; onGone: () => void }) {
  const [reply, setReply] = useState(c.reply ?? "");
  const [synced, setSynced] = useState(c.reply);
  if (synced !== c.reply) {
    setSynced(c.reply);
    setReply(c.reply ?? "");
  }
  const url = `https://www.youtube.com/watch?v=${c.videoId}&lc=${c.commentId}`;

  async function copyAndOpen() {
    try { await navigator.clipboard.writeText(reply); toast.success("Reply copied — paste it under the highlighted comment."); } catch { /* clipboard blocked */ }
    window.open(url, "_blank", "noopener");
  }

  const set = (status: string) => updateComment(c.id, { status }).then(onGone).catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't save."));

  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="w-8 h-8 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0 text-xs font-semibold">
          {c.author.replace(/^@/, "").slice(0, 1).toUpperCase()}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground truncate" suppressHydrationWarning>
            <span className="font-medium text-foreground">{c.author}</span> · {formatDistanceToNowStrict(new Date(c.publishedAt))} ago · on “{video}”
            {c.likeCount > 0 && <span className="inline-flex items-center gap-0.5 ml-2"><ThumbsUp className="w-3 h-3" />{c.likeCount}</span>}
          </p>
          <p className="text-sm mt-1 whitespace-pre-line">{c.text}</p>
        </div>
      </div>
      <div className="mt-3 pl-11">
        <textarea value={reply} onChange={(e) => setReply(e.target.value)}
          onBlur={() => { if (reply !== (c.reply ?? "")) updateComment(c.id, { reply }).catch(() => toast.error("Couldn't save the draft.")); }}
          rows={2} placeholder={c.status === "new" ? "Write a reply, or let Claude draft one…" : ""}
          className="w-full rounded-lg border border-border bg-muted/30 p-2.5 text-sm" />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button onClick={copyAndOpen} disabled={!reply.trim()}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-40">
            <Copy className="w-3.5 h-3.5" /> Copy &amp; open on YouTube
          </button>
          <button onClick={() => set("replied")} className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-border text-xs hover:bg-accent">
            <Check className="w-3.5 h-3.5" /> Replied
          </button>
          <button onClick={() => set("ignored")} className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs text-muted-foreground hover:bg-accent">
            <EyeOff className="w-3.5 h-3.5" /> Ignore
          </button>
          {c.status === "drafted" && <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Drafted by Claude</span>}
        </div>
      </div>
    </li>
  );
}
