"use client";

// Automatic tracking glue (mounted once in the dashboard layout):
//  • every device: a "presence" ping every 5 min while Galaxus is visible —
//    that's how bed and wake time get logged without you typing anything.
//  • desktop app only: every minute, pull which app you used (deep work /
//    scrolling) from the native shell; every 5 min, look for new beat projects.
//  • doomscroll guard: 20+ minutes of scrolling → the empire fogs up, Galaxus
//    comes to the front and offers your next step.
// Nothing here reads window titles — the native side reduces them to a word.

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CloudFog, ListTodo, Shield } from "lucide-react";
import { addBeatsFromFilesC, logActivityC, logPresenceC } from "@/lib/client/activity";

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
type Poll = { samples: { minute: number; app: string; site: string | null; secs: number }[]; idle_secs: number };
export type ActivityStatus = Awaited<ReturnType<typeof logActivityC>>;

export const DESKTOP_KEYS = { tracking: "galaxus-desktop-tracking", beatFolder: "galaxus-beat-folder", beatSince: "galaxus-beat-since" } as const;
export const ACTIVITY_EVENT = "galaxus:activity";

export function tauriInvoke(): Invoke | null {
  if (typeof window === "undefined") return null;
  const t = (window as unknown as { __TAURI__?: { core?: { invoke?: Invoke } } }).__TAURI__;
  return t?.core?.invoke ?? null;
}

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

export function DesktopBridge() {
  const [guard, setGuard] = useState(false);

  // Presence — all devices.
  useEffect(() => {
    const ping = () => { if (document.visibilityState === "visible") void logPresenceC().catch(() => {}); };
    ping();
    const t = setInterval(ping, 5 * 60_000);
    document.addEventListener("visibilitychange", ping);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", ping); };
  }, []);

  // Desktop: activity + beat folder.
  useEffect(() => {
    const invoke = tauriInvoke();
    if (!invoke) return;
    let snoozedUntil = 0;

    const pollActivity = async () => {
      if (read(DESKTOP_KEYS.tracking) === "off") return;
      try {
        const p = await invoke<Poll>("activity_poll");
        const status = await logActivityC(p.samples);
        window.dispatchEvent(new CustomEvent(ACTIVITY_EVENT, { detail: status }));
        if (status.doomscrolling && Date.now() > snoozedUntil) {
          snoozedUntil = Date.now() + 15 * 60_000;
          setGuard(true);
          void invoke("focus_window").catch(() => {});
        }
      } catch { /* offline or old desktop build — try again next minute */ }
    };

    const pollBeats = async () => {
      const dir = read(DESKTOP_KEYS.beatFolder);
      if (!dir) return;
      const since = Number(read(DESKTOP_KEYS.beatSince)) || Date.now() - 7 * 86_400_000;
      try {
        const files = await invoke<{ name: string; modified_ms: number }[]>("list_new_files", { dir, ext: "flp", sinceMs: since });
        if (!files.length) return;
        const r = await addBeatsFromFilesC(files.map((f) => ({ name: f.name, modifiedMs: f.modified_ms })));
        write(DESKTOP_KEYS.beatSince, String(Math.max(...files.map((f) => f.modified_ms))));
        if (r.added) toast.success(`🎵 ${r.added} new beat${r.added === 1 ? "" : "s"} added to your catalog`);
      } catch { /* folder moved — the Connections card shows it */ }
    };

    void pollActivity(); void pollBeats();
    const a = setInterval(pollActivity, 60_000);
    const b = setInterval(pollBeats, 5 * 60_000);
    return () => { clearInterval(a); clearInterval(b); };
  }, []);

  if (!guard) return null;
  return (
    <div className="fixed inset-0 z-[950] flex items-end sm:items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[6px] animate-in fade-in-0">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl animate-in slide-in-from-bottom-4">
        <span className="w-12 h-12 rounded-2xl bg-slate-500/15 text-slate-500 flex items-center justify-center"><CloudFog className="w-6 h-6" /></span>
        <h2 className="mt-4 font-hud uppercase tracking-wide text-2xl">20 minutes of scrolling</h2>
        <p className="mt-1 text-sm text-muted-foreground">Fog is rolling over your city. No judgement, just a door back to what you actually want.</p>
        <div className="mt-5 grid gap-2">
          <Link href="/tasks" onClick={() => setGuard(false)} className="h-11 rounded-xl bg-foreground text-background font-medium inline-flex items-center justify-center gap-2"><ListTodo className="w-4 h-4" /> Open my next task</Link>
          <Link href="/hold" onClick={() => setGuard(false)} className="h-11 rounded-xl border border-border font-medium inline-flex items-center justify-center gap-2"><Shield className="w-4 h-4" /> Hold the line</Link>
          <button onClick={() => setGuard(false)} className="h-9 text-xs text-muted-foreground hover:text-foreground">I&apos;m done scrolling</button>
        </div>
      </div>
    </div>
  );
}
