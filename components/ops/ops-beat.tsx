"use client";

// "Keep the crew awake 24/7": your private beat URL for a free cron service.
// GitHub's scheduled workflow only fired every few hours, so the crew sat idle
// whenever /ops wasn't open. A cron service calling this URL every 5 minutes
// keeps it moving. The URL can only trigger a beat (one a minute at most).

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, HeartPulse, Loader2, RefreshCw } from "lucide-react";
import { getBeatUrlC } from "@/lib/client/ops";

export function BeatSetup({ now }: { now: number }) {
  const [info, setInfo] = useState<{ path: string; lastBeatAt: string | null } | null>(null);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, start] = useTransition();
  useEffect(() => {
    let dead = false;
    getBeatUrlC().then((r) => { if (!dead) { setInfo(r); setOrigin(window.location.origin); } }).catch((e) => toast.error((e as Error).message));
    return () => { dead = true; };
  }, []);
  const url = info ? `${origin}${info.path}` : "";
  const mins = info?.lastBeatAt ? Math.round((now - new Date(info.lastBeatAt).getTime()) / 60_000) : null;

  return (
    <div className="rounded-xl border border-white/10 p-3">
      <div className="flex items-center gap-2">
        <HeartPulse className="w-4 h-4 text-[#8ea6ff]" />
        <p className="text-sm font-semibold">Keep the crew awake 24/7</p>
        <span className={`ml-auto text-[11px] ${mins != null && mins <= 10 ? "text-emerald-300" : "text-amber-300"}`}>
          {mins == null ? "no beat yet" : mins < 1 ? "last beat just now" : `last beat ${mins < 120 ? `${mins} min` : `${Math.round(mins / 60)} h`} ago`}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-white/55">
        Agents retry, take missions and plan on a heartbeat. This page beats every minute while it&apos;s open; GitHub&apos;s schedule only runs every few hours.
        For 24/7: create a free job at cron-job.org that opens this URL every 5 minutes.
      </p>
      {info ? (
        <div className="mt-2 flex items-center gap-1.5">
          <code className="flex-1 min-w-0 truncate rounded-lg bg-black/40 border border-white/10 px-2 py-1.5 text-[11px] font-mono text-white/80">{url}</code>
          <button title="Copy" onClick={() => { navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }}
            className="h-7 w-7 rounded-lg border border-white/15 inline-flex items-center justify-center hover:bg-white/10">{copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}</button>
          <button title="New URL (the old one stops working)" disabled={busy} onClick={() => start(async () => { try { setInfo(await getBeatUrlC(true)); toast.success("New beat URL. Update it in your cron job."); } catch (e) { toast.error((e as Error).message); } })}
            className="h-7 w-7 rounded-lg border border-white/15 inline-flex items-center justify-center hover:bg-white/10">{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}</button>
        </div>
      ) : <p className="mt-2 text-[11px] text-white/45 inline-flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</p>}
      <ol className="mt-2 list-decimal pl-4 text-[11px] text-white/55 space-y-0.5">
        <li>Sign up free at <a href="https://cron-job.org" target="_blank" rel="noopener noreferrer" className="text-[#8ea6ff] hover:underline inline-flex items-center gap-0.5">cron-job.org <ExternalLink className="w-3 h-3" /></a> → Create cronjob.</li>
        <li>Paste the URL above, schedule “every 5 minutes”, save.</li>
        <li>“last beat” here turns green within 5 minutes. Keep the URL private (it can only wake the crew, nothing else).</li>
      </ol>
    </div>
  );
}
