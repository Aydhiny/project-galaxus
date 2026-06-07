"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Music2, CloudRain, Flame, X, ChevronDown, ChevronUp, Volume2,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

// ─── Track definitions (all IDs verified June 2025) ─────────────────────────
const TRACKS = [
  {
    id: "lofi",
    label: "Lofi Beats",
    icon: "🎵",
    videoId: "jfKfPfyJRdk", // Lofi Girl 24/7 — active live stream
    color: "oklch(0.65 0.20 290)",
  },
  {
    id: "classical",
    label: "Classical",
    icon: "🎻",
    videoId: "OYifjZ8jLQs", // 3 Hours Chopin — uploaded June 2025
    color: "oklch(0.72 0.14 78)",
  },
  {
    id: "zelda",
    label: "Zelda TotK",
    icon: "🗡️",
    videoId: "F_ICsY-cILU", // Full Original Soundtrack — confirmed
    color: "oklch(0.68 0.14 158)",
  },
  {
    id: "study",
    label: "Deep Focus",
    icon: "🧠",
    videoId: "tPO9jxUKIsc", // 6 Hours Classical for Studying
    color: "oklch(0.76 0.17 50)",
  },
];

// ─── Web-Audio ambient sounds ────────────────────────────────────────────────
function useAmbientSound(type: "rain" | "fire") {
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const nodeRef = useRef<ScriptProcessorNode | null>(null);
  const [vol, setVolState] = useState(0);

  const ensureCtx = useCallback(() => {
    if (ctxRef.current) return ctxRef.current;
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gainRef.current = gain;
    gain.connect(ctx.destination);

    const node = ctx.createScriptProcessor(4096, 1, 1);
    let lastOut = 0;
    node.onaudioprocess = (e) => {
      const out = e.outputBuffer.getChannelData(0);
      for (let i = 0; i < 4096; i++) {
        const w = Math.random() * 2 - 1;
        if (type === "rain") {
          lastOut = (lastOut + 0.018 * w) / 1.018;
          out[i] = lastOut * 4;
        } else {
          lastOut = (lastOut + 0.038 * w) / 1.038;
          const crackle = Math.random() < 0.0008 ? Math.random() * 0.5 : 0;
          out[i] = lastOut * 3 + crackle;
        }
      }
    };
    node.connect(gain);
    nodeRef.current = node;
    return ctx;
  }, [type]);

  const setVolume = useCallback((v: number) => {
    if (v > 0) {
      const ctx = ensureCtx();
      if (ctx.state === "suspended") ctx.resume();
      if (gainRef.current) gainRef.current.gain.value = v / 100;
    } else {
      if (gainRef.current) gainRef.current.gain.value = 0;
    }
    setVolState(v);
  }, [ensureCtx]);

  return { vol, setVolume };
}

// ─── Ambient button with persistent click-to-toggle slider ──────────────────
function AmbientControl({
  icon, label, vol, onVolume, color,
}: {
  icon: React.ReactNode; label: string; vol: number;
  onVolume: (v: number) => void; color: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const active = vol > 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border",
          active
            ? "bg-[var(--gold-muted)] border-[var(--gold)]/40 text-[var(--gold)]"
            : open
            ? "border-border bg-accent text-foreground"
            : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
        )}
      >
        {icon}
        <span className="hidden sm:inline">{label}</span>
        {active && <span className="tabular-nums text-[10px]">{vol}%</span>}
      </button>

      {open && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-36 rounded-xl border border-border bg-card shadow-2xl p-3 z-50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium" style={{ color }}>{label}</span>
            <button
              onClick={() => { onVolume(0); setOpen(false); }}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <Slider
            min={0} max={100} step={5}
            value={[vol]}
            onValueChange={(v) => onVolume(Number(Array.isArray(v) ? v[0] : v))}
          />
          <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
            <span>Off</span><span>Max</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main music player ───────────────────────────────────────────────────────
export function MusicPlayer() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [playerOpen, setPlayerOpen] = useState(false);

  const rain = useAmbientSound("rain");
  const fire = useAmbientSound("fire");

  const track = TRACKS.find((t) => t.id === activeId);

  function selectTrack(id: string) {
    if (activeId === id) {
      setPlayerOpen((o) => !o);
    } else {
      setActiveId(id);
      setPlayerOpen(true);
    }
  }

  function close() {
    setPlayerOpen(false);
    setActiveId(null);
  }

  return (
    <div className="border-t border-border bg-card/95 backdrop-blur-md shrink-0">
      {/* YouTube embed panel — real, visible player that actually works */}
      {activeId && track && playerOpen && (
        <div className="border-b border-border relative">
          <button
            onClick={close}
            className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
          <iframe
            key={activeId} // remount on track change
            src={`https://www.youtube-nocookie.com/embed/${track.videoId}?autoplay=1&loop=1&playlist=${track.videoId}&controls=1&rel=0`}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="w-full"
            style={{ height: 180 }}
            title={track.label}
          />
        </div>
      )}

      {/* Control bar */}
      <div className="flex items-center gap-2 px-4 py-2 h-12">
        {/* Track icon */}
        <Music2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />

        {/* Track selector */}
        <div className="flex gap-1.5 flex-1 overflow-x-auto">
          {TRACKS.map((t) => {
            const isActive = activeId === t.id;
            return (
              <button
                key={t.id}
                onClick={() => selectTrack(t.id)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border shrink-0",
                  isActive
                    ? "border-transparent text-background"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
                style={isActive ? { background: t.color } : {}}
              >
                <span>{t.icon}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Expand/collapse active player */}
        {activeId && (
          <button
            onClick={() => setPlayerOpen((o) => !o)}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title={playerOpen ? "Hide player" : "Show player"}
          >
            {playerOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        )}

        {/* Divider */}
        <div className="h-4 w-px bg-border shrink-0" />

        {/* Ambient sounds */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Volume2 className="w-3 h-3 text-muted-foreground" />
          <AmbientControl
            icon={<CloudRain className="w-3.5 h-3.5" />}
            label="Rain"
            vol={rain.vol}
            onVolume={rain.setVolume}
            color="oklch(0.65 0.18 200)"
          />
          <AmbientControl
            icon={<Flame className="w-3.5 h-3.5" />}
            label="Fire"
            vol={fire.vol}
            onVolume={fire.setVolume}
            color="oklch(0.70 0.19 32)"
          />
        </div>
      </div>
    </div>
  );
}
