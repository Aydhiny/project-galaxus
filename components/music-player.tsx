"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Play, Pause, Volume2, VolumeX, Music, ChevronUp, ChevronDown,
  Flame, CloudRain, Wind, SkipForward
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const TRACKS = [
  {
    id: "lofi",
    label: "Lofi Beats",
    icon: "🎵",
    videoId: "jfKfPfyJRdk",
    color: "oklch(0.65 0.20 290)",
  },
  {
    id: "classical",
    label: "Classical",
    icon: "🎻",
    videoId: "kfc-QTbFjK0",
    color: "oklch(0.72 0.14 78)",
  },
  {
    id: "zelda",
    label: "Zelda: TotK",
    icon: "🗡️",
    videoId: "3VKVzlMlMok",
    color: "oklch(0.68 0.14 158)",
  },
  {
    id: "study",
    label: "Deep Focus",
    icon: "🧠",
    videoId: "WPni755-Krg",
    color: "oklch(0.76 0.17 50)",
  },
];

function useAmbientSound(type: "rain" | "fire") {
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | ScriptProcessorNode | null>(null);
  const [vol, setVol] = useState(0);
  const [active, setActive] = useState(false);

  const start = useCallback(() => {
    if (ctxRef.current) return;
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gainRef.current = gain;
    gain.connect(ctx.destination);

    const bufferSize = 4096;
    const node = ctx.createScriptProcessor(bufferSize, 1, 1);

    let lastOut = 0;
    node.onaudioprocess = (e) => {
      const output = e.outputBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        if (type === "rain") {
          // Brown noise (rain-like)
          lastOut = (lastOut + 0.02 * white) / 1.02;
          output[i] = lastOut * 3.5;
        } else {
          // Pink noise + occasional crackle (fire-like)
          lastOut = (lastOut + 0.04 * white) / 1.04;
          const crackle = Math.random() < 0.001 ? (Math.random() * 0.4) : 0;
          output[i] = lastOut * 2.5 + crackle;
        }
      }
    };

    node.connect(gain);
    sourceRef.current = node;
    setActive(true);
  }, [type]);

  const stop = useCallback(() => {
    if (gainRef.current) gainRef.current.gain.value = 0;
    setTimeout(() => {
      ctxRef.current?.close();
      ctxRef.current = null;
      gainRef.current = null;
      sourceRef.current = null;
    }, 200);
    setActive(false);
    setVol(0);
  }, []);

  const setVolume = useCallback((v: number) => {
    if (!gainRef.current) start();
    setTimeout(() => {
      if (gainRef.current) gainRef.current.gain.value = v / 100;
    }, 50);
    setVol(v);
    if (v === 0) stop();
    else setActive(true);
  }, [start, stop]);

  return { vol, active, setVolume, start, stop };
}

export function MusicPlayer() {
  const [open, setOpen] = useState(true);
  const [activeTrack, setActiveTrack] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(60);
  const [muted, setMuted] = useState(false);
  const playerRef = useRef<HTMLIFrameElement>(null);

  const rain = useAmbientSound("rain");
  const fire = useAmbientSound("fire");

  const track = TRACKS.find((t) => t.id === activeTrack);

  function getEmbedUrl(videoId: string, play: boolean) {
    const autoplay = play ? 1 : 0;
    return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=${autoplay}&controls=0&loop=1&playlist=${videoId}&enablejsapi=1&origin=${typeof window !== "undefined" ? window.location.origin : ""}`;
  }

  function selectTrack(id: string) {
    if (activeTrack === id) {
      setPlaying((p) => !p);
    } else {
      setActiveTrack(id);
      setPlaying(true);
    }
  }

  // Reload iframe when track or playing changes
  useEffect(() => {
    if (!playerRef.current || !track) return;
    playerRef.current.src = getEmbedUrl(track.videoId, playing);
  }, [activeTrack, playing, track]);

  const effectiveVolume = muted ? 0 : volume;

  return (
    <div className="border-t border-border bg-card/95 backdrop-blur-md shrink-0">
      {/* Collapsed bar */}
      <div className="flex items-center gap-3 px-4 py-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>

        <Music className="w-3.5 h-3.5 text-muted-foreground shrink-0" />

        <div className="flex gap-1.5 flex-1">
          {TRACKS.map((t) => (
            <button
              key={t.id}
              onClick={() => selectTrack(t.id)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border",
                activeTrack === t.id && playing
                  ? "border-transparent text-background"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
              )}
              style={
                activeTrack === t.id && playing
                  ? { background: t.color }
                  : {}
              }
            >
              <span>{t.icon}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Volume */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setMuted((m) => !m)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {muted || effectiveVolume === 0 ? (
              <VolumeX className="w-3.5 h-3.5" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
          </button>
          <div className="w-20 hidden sm:block">
            <Slider
              min={0}
              max={100}
              step={1}
              value={[effectiveVolume]}
              onValueChange={(vals) => { setVolume(Number(Array.isArray(vals) ? vals[0] : vals)); setMuted(false); }}
              className="h-1"
            />
          </div>
        </div>

        {/* Play/pause */}
        {activeTrack && (
          <button
            onClick={() => setPlaying((p) => !p)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-background transition-all"
            style={{ background: track?.color ?? "var(--gold)" }}
          >
            {playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
          </button>
        )}

        {/* Ambient sounds */}
        <div className="flex items-center gap-1 shrink-0 ml-1 pl-3 border-l border-border">
          <AmbientBtn
            icon={<CloudRain className="w-3 h-3" />}
            label="Rain"
            vol={rain.vol}
            onVolumeChange={rain.setVolume}
          />
          <AmbientBtn
            icon={<Flame className="w-3 h-3" />}
            label="Fire"
            vol={fire.vol}
            onVolumeChange={fire.setVolume}
          />
        </div>
      </div>

      {/* Hidden YouTube iframe */}
      {activeTrack && (
        <iframe
          ref={playerRef}
          className="w-0 h-0 absolute opacity-0 pointer-events-none"
          allow="autoplay"
          title="music-player"
        />
      )}
    </div>
  );
}

function AmbientBtn({
  icon,
  label,
  vol,
  onVolumeChange,
}: {
  icon: React.ReactNode;
  label: string;
  vol: number;
  onVolumeChange: (v: number) => void;
}) {
  const [showSlider, setShowSlider] = useState(false);
  const active = vol > 0;

  return (
    <div className="relative">
      <button
        onClick={() => {
          if (active) { onVolumeChange(0); setShowSlider(false); }
          else { setShowSlider((s) => !s); }
        }}
        onMouseEnter={() => setShowSlider(true)}
        onMouseLeave={() => setShowSlider(false)}
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all border",
          active
            ? "border-[var(--gold)]/40 text-[var(--gold)] bg-[var(--gold-muted)]"
            : "border-border text-muted-foreground hover:text-foreground"
        )}
        title={label}
      >
        {icon}
        {active && <span className="text-[10px] tabular-nums">{vol}%</span>}
      </button>

      {showSlider && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-28 p-2 rounded-xl border border-border bg-card shadow-xl"
          onMouseEnter={() => setShowSlider(true)}
          onMouseLeave={() => setShowSlider(false)}
        >
          <p className="text-[10px] text-muted-foreground mb-1.5 text-center">{label}</p>
          <Slider
            min={0}
            max={100}
            step={5}
            value={[vol]}
            onValueChange={(vals) => onVolumeChange(Number(Array.isArray(vals) ? vals[0] : vals))}
            className="h-1"
          />
        </div>
      )}
    </div>
  );
}
