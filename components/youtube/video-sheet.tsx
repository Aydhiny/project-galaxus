"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ExternalLink, Loader2, Sparkles } from "lucide-react";
import type { YoutubeVideo } from "@/lib/db/schema";
import { BrandIcon } from "@/components/brand-icon";
import { compactNumber, formatDuration, likeRate, type Issue } from "@/lib/youtube";
import { improveVideo, updateVideo } from "@/lib/client/youtube";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { IssueList, ReportText } from "./shared";

export function VideoDetail({ video, issues, canAsk }: { video: YoutubeVideo; issues: Issue[]; canAsk: boolean }) {
  const [swipe, setSwipe] = useState(video.swipeViewedPct?.toString() ?? "");
  const [avg, setAvg] = useState(video.avgViewedPct?.toString() ?? "");
  const [script, setScript] = useState(video.script ?? "");
  const [asking, startAsk] = useTransition();
  const url = video.isShort ? `https://www.youtube.com/shorts/${video.videoId}` : `https://www.youtube.com/watch?v=${video.videoId}`;

  const save = (patch: Parameters<typeof updateVideo>[1]) => updateVideo(video.id, patch).catch(() => toast.error("Couldn't save."));
  const num = (s: string) => (s === "" ? null : Number(s));

  return (
    <div className="flex flex-col">
      <div className="p-6 pb-4 pr-12 border-b border-border">
        <SheetTitle className="text-lg leading-snug">{video.title}</SheetTitle>
        <SheetDescription className="mt-1" suppressHydrationWarning>
          {format(new Date(video.publishedAt), "d MMM yyyy")} · {video.isShort ? "Short" : "Video"} · {formatDuration(video.durationSec)}
        </SheetDescription>
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs mt-2 underline underline-offset-4">
          Open on YouTube <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <div className="p-6 space-y-7">
        <div className="grid grid-cols-4 gap-2">
          {[
            ["Views", compactNumber(video.views)],
            ["Likes", compactNumber(video.likes)],
            ["Like rate", `${(likeRate(video) * 100).toFixed(1)}%`],
            ["Comments", compactNumber(video.comments)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-muted/40 px-2.5 py-2">
              <p className="text-base font-semibold tabular-nums">{v}</p>
              <p className="text-[11px] text-muted-foreground">{k}</p>
            </div>
          ))}
        </div>

        <section>
          <h3 className="text-xs font-semibold text-muted-foreground mb-3">What to fix</h3>
          <IssueList issues={issues} empty="Nothing flagged from the public data. Add your Studio numbers below for a deeper check." />
        </section>

        {video.isShort && (
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground">From YouTube Studio (the numbers that decide Shorts)</h3>
            <p className="text-[11px] text-muted-foreground mt-1">Studio → Content → this Short → Analytics → Engagement.</p>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <label className="block">
                <span className="text-xs">Viewed vs. swiped away (%)</span>
                <input inputMode="numeric" value={swipe} onChange={(e) => setSwipe(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  onBlur={() => { if (num(swipe) !== video.swipeViewedPct) save({ swipeViewedPct: num(swipe) }); }}
                  placeholder="e.g. 58" className="input-base mt-1 tabular-nums" />
              </label>
              <label className="block">
                <span className="text-xs">Average % viewed</span>
                <input inputMode="numeric" value={avg} onChange={(e) => setAvg(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  onBlur={() => { if (num(avg) !== video.avgViewedPct) save({ avgViewedPct: num(avg) }); }}
                  placeholder="e.g. 64" className="input-base mt-1 tabular-nums" />
              </label>
            </div>
          </section>
        )}

        <label className="block">
          <span className="text-xs font-semibold text-muted-foreground">Script / what you say</span>
          <textarea value={script} onChange={(e) => setScript(e.target.value)} onBlur={() => { if (script !== (video.script ?? "")) save({ script }); }}
            rows={5} placeholder="Paste the script or the first lines you say — Claude uses it to judge the hook."
            className="mt-1.5 w-full rounded-lg border border-border bg-transparent p-3 text-sm" />
        </label>

        <section className="rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-1.5"><BrandIcon name="claude" className="w-4 h-4" /> Improve with Claude</h3>
            <button
              onClick={() => startAsk(async () => { try { await improveVideo(video.id); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed."); } })}
              disabled={asking || !canAsk} title={canAsk ? undefined : "Add an Anthropic key in Setup"}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-sm hover:bg-accent disabled:opacity-50">
              {asking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} {video.suggestions ? "Again" : "Suggest fixes"}
            </button>
          </div>
          {video.suggestions
            ? <ReportText text={video.suggestions} />
            : <p className="text-sm text-muted-foreground">Better titles, a sharper hook, what to cut, a real description and clean tags.</p>}
        </section>
      </div>
    </div>
  );
}
