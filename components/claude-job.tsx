"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RotateCcw, X } from "lucide-react";
import type { VoiceCommand } from "@/lib/db/schema";
import { getVoiceCommand, retryVoiceCommand } from "@/lib/client/voice";
import { BrandIcon } from "@/components/brand-icon";

/**
 * Live status of one Claude job (devlog, hooks, replies, playtest). Polls
 * until done, refreshes the page data, then calls onDone.
 */
export function ClaudeJob({ jobId, dispatched, label, onDone }: {
  jobId: number;
  dispatched: boolean;
  label: string;
  onDone?: (job: VoiceCommand) => void;
}) {
  const router = useRouter();
  const [job, setJob] = useState<VoiceCommand | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [id, setId] = useState(jobId);
  const started = useRef(0);
  const finished = job?.status === "done" || job?.status === "failed";
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; });

  useEffect(() => {
    if (finished) return;
    let alive = true;
    if (!started.current) started.current = Date.now();
    const poll = async () => {
      try {
        const row = await getVoiceCommand(id);
        if (!alive || !row) return;
        setJob(row);
        if (row.status === "done" || row.status === "failed") {
          router.refresh();
          if (row.status === "done") doneRef.current?.(row);
        }
      } catch { /* keep polling */ }
    };
    poll();
    const t = setInterval(poll, 2000);
    const clock = setInterval(() => setElapsed(Math.round((Date.now() - started.current) / 1000)), 1000);
    return () => { alive = false; clearInterval(t); clearInterval(clock); };
  }, [id, finished, router]);

  async function retry() {
    const r = await retryVoiceCommand(id);
    started.current = Date.now();
    setJob(null);
    setId(r.id);
  }

  const status = job?.status ?? "queued";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-sm">
      <span className="w-7 h-7 rounded-lg bg-[#D97757]/10 flex items-center justify-center shrink-0">
        {status === "done" ? <Check className="w-4 h-4 text-emerald-600" /> : status === "failed" ? <X className="w-4 h-4 text-destructive" />
          : <BrandIcon name="claude" className="w-4 h-4" />}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{label}</p>
        <p className="text-xs text-muted-foreground truncate">
          {status === "queued" && (dispatched ? `Starting Claude… ${elapsed}s` : "Queued — Claude picks it up within ~10 min (add a GitHub key in Voice for instant)")}
          {status === "running" && `Claude is working… ${elapsed}s`}
          {status === "done" && (job?.summary ?? "Done")}
          {status === "failed" && (job?.error ?? "Failed")}
        </p>
      </div>
      {(status === "queued" || status === "running") && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />}
      {status === "failed" && (
        <button onClick={retry} className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border text-xs hover:bg-accent shrink-0">
          <RotateCcw className="w-3 h-3" /> Retry
        </button>
      )}
    </div>
  );
}
