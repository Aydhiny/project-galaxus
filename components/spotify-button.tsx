"use client";

// Floating Spotify button (next to Quick Capture): what's playing, with
// controls. Not connected yet → the icon links to Connections. Publishes the
// playback state so the empire can go disco.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ExternalLink, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandIcon } from "@/components/brand-icon";
import { getSpotifyNowC, spotifyControlC, useSpotifyStore } from "@/lib/client/spotify";

export function SpotifyButton() {
  const now = useSpotifyStore((s) => s.now);
  const setNow = useSpotifyStore((s) => s.set);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => getSpotifyNowC().then(setNow).catch(() => {}), [setNow]);
  useEffect(() => {
    const first = setTimeout(load, 1500);
    const t = setInterval(() => { if (!document.hidden) void load(); }, 15_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [load]);

  const control = (a: "play" | "pause" | "next" | "previous") =>
    spotifyControlC(a).then(() => setTimeout(load, 600)).catch((e) => toast.error((e as Error).message));

  const pos = "fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-16 z-[90]";
  if (!now) return null;
  if (!now.connected) {
    return (
      <Link href="/connections#spotify" title="Connect Spotify" className={cn(pos, "w-10 h-10 rounded-full bg-card border border-border shadow-lg flex items-center justify-center opacity-70 hover:opacity-100 hover:scale-110 transition-all")}>
        <BrandIcon name="spotify" className="w-5 h-5 grayscale" />
      </Link>
    );
  }
  return (
    <div className={pos}>
      {open && now.track && (
        <div className="absolute bottom-12 right-0 w-72 rounded-2xl bg-card border border-border shadow-2xl p-3 animate-in fade-in-0 slide-in-from-bottom-2">
          <div className="flex gap-3">
            {now.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={now.image} alt="" className="w-16 h-16 rounded-xl object-cover" referrerPolicy="no-referrer" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{now.track}</p>
              <p className="text-xs text-muted-foreground truncate">{now.artist}</p>
              {now.durationMs > 0 && (
                <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden"><div className="h-full bg-[#1DB954]" style={{ width: `${(now.progressMs / now.durationMs) * 100}%` }} /></div>
              )}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-center gap-2">
            <button onClick={() => control("previous")} className="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center" aria-label="Previous"><SkipBack className="w-4 h-4" /></button>
            <button onClick={() => control(now.isPlaying ? "pause" : "play")} className="w-11 h-11 rounded-full bg-[#1DB954] text-black flex items-center justify-center" aria-label={now.isPlaying ? "Pause" : "Play"}>
              {now.isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>
            <button onClick={() => control("next")} className="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center" aria-label="Next"><SkipForward className="w-4 h-4" /></button>
            {now.url && <a href={now.url} target="_blank" rel="noreferrer" className="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center" aria-label="Open in Spotify"><ExternalLink className="w-4 h-4" /></a>}
          </div>
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} title={now.track ? `${now.track} — ${now.artist}` : "Spotify"}
        className="relative w-10 h-10 rounded-full bg-card border border-border shadow-lg flex items-center justify-center overflow-hidden hover:scale-110 transition-transform">
        {now.image && now.isPlaying ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={now.image} alt="" className="w-full h-full object-cover animate-[spin_8s_linear_infinite]" referrerPolicy="no-referrer" />
        ) : <BrandIcon name="spotify" className="w-5 h-5" />}
        {now.isPlaying && <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-card flex items-center justify-center"><BrandIcon name="spotify" className="w-3 h-3" /></span>}
      </button>
    </div>
  );
}
