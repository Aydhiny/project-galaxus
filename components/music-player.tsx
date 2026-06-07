"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Music2, CloudRain, Flame, X, ChevronDown, ChevronUp, Volume2 } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const TRACKS = [
  { id: "lofi",      label: "Lofi Beats",   icon: "🎵", videoId: "jfKfPfyJRdk", color: "oklch(0.65 0.20 290)" },
  { id: "classical", label: "Classical",    icon: "🎻", videoId: "OYifjZ8jLQs", color: "oklch(0.72 0.14 78)"  },
  { id: "zelda",     label: "Zelda & Chill",icon: "🗡️", videoId: "GdzrrWA8e7A", color: "oklch(0.68 0.14 158)" },
  { id: "study",     label: "40Hz Focus",   icon: "🧠", videoId: "7Kdc95rNQlc", color: "oklch(0.76 0.17 50)"  },
];

// ─── Ambient sound engine ─────────────────────────────────────────────────────
// Rain: pink noise (Paul Kellet algorithm) → band-pass at 700Hz → rain shower
// Fire: very-slow brown noise (base rumble) + sparse decaying crackle transients
function useAmbientSound(type: "rain" | "fire") {
  const ctxRef  = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const [vol, setVolState] = useState(0);

  const ensureCtx = useCallback(() => {
    if (ctxRef.current) return ctxRef.current;

    const ctx = new AudioContext();
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(ctx.destination);
    gainRef.current = masterGain;

    const bufSize = 4096;
    const node = ctx.createScriptProcessor(bufSize, 0, 1);

    if (type === "rain") {
      // Pink noise (7-coefficient approximation) → gives that hissing rain texture
      let b0=0, b1=0, b2=0, b3=0, b4=0, b5=0, b6=0;
      node.onaudioprocess = (e) => {
        const out = e.outputBuffer.getChannelData(0);
        for (let i = 0; i < bufSize; i++) {
          const w = Math.random() * 2 - 1;
          b0 = 0.99886*b0 + w*0.0555179;
          b1 = 0.99332*b1 + w*0.0750759;
          b2 = 0.96900*b2 + w*0.1538520;
          b3 = 0.86650*b3 + w*0.3104856;
          b4 = 0.55000*b4 + w*0.5329522;
          b5 = -0.7616*b5 - w*0.0168980;
          const pink = (b0+b1+b2+b3+b4+b5+b6+w*0.5362) * 0.08;
          b6 = w * 0.115926;
          out[i] = pink;
        }
      };
      // Band-pass centred at rain frequency gives the "shhhh" quality
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 700;
      filter.Q.value = 0.4;
      node.connect(filter);
      filter.connect(masterGain);

    } else {
      // Fire: very slow brown noise (rumble) + irregular crackling transients
      let base = 0;
      let crackAmp   = 0;   // current crackle amplitude (decays to 0)
      let crackDecay = 0;   // envelope decay multiplier
      // At 44100Hz: random 0.5s–3s between crackles ≈ 22000–132000 samples
      let samplesUntilCrack = 22000 + Math.floor(Math.random() * 80000);
      let sampleCount = 0;

      node.onaudioprocess = (e) => {
        const out = e.outputBuffer.getChannelData(0);
        for (let i = 0; i < bufSize; i++) {
          const w = Math.random() * 2 - 1;
          // Very slow IIR low-pass → deep, slow rumble
          base = (base + 0.005 * w) / 1.005;

          // Crackle event fires every samplesUntilCrack samples
          sampleCount++;
          if (sampleCount >= samplesUntilCrack) {
            crackAmp   = (Math.random() > 0.5 ? 1 : -1) * (0.4 + Math.random() * 0.6);
            crackDecay = 1.0;
            sampleCount = 0;
            // Next crackle in 0.5–3 seconds
            samplesUntilCrack = 22000 + Math.floor(Math.random() * 88000);
          }

          // Exponential decay of crackle (fast — gone in ~10 ms)
          let crackle = 0;
          if (crackDecay > 0.005) {
            crackle    = crackAmp * crackDecay;
            crackDecay *= 0.97; // 0.97^50 ≈ 0.22 → fades in ~50 samples (1 ms)
          }

          out[i] = base * 4 + crackle * 0.45;
        }
      };
      // Low-pass to soften harsh HF content while keeping warmth
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 900;
      node.connect(filter);
      filter.connect(masterGain);
    }

    ctxRef.current = ctx;
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

// ─── Persistent click-to-toggle ambient control ───────────────────────────────
function AmbientControl({
  icon, label, vol, onVolume, color,
}: {
  icon: React.ReactNode; label: string; vol: number;
  onVolume: (v: number) => void; color: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border",
          vol > 0
            ? "bg-[var(--gold-muted)] border-[var(--gold)]/40 text-[var(--gold)]"
            : open
            ? "border-border bg-accent text-foreground"
            : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
        )}
      >
        {icon}
        <span className="hidden sm:inline">{label}</span>
        {vol > 0 && <span className="tabular-nums text-[10px]">{vol}%</span>}
      </button>

      {open && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-36 rounded-xl border border-border bg-card shadow-2xl p-3 z-50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium" style={{ color }}>{label}</span>
            <button onClick={() => { onVolume(0); setOpen(false); }} className="text-muted-foreground hover:text-foreground">
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

// ─── Main player ──────────────────────────────────────────────────────────────
export function MusicPlayer() {
  const [activeId, setActiveId]     = useState<string | null>(null);
  const [playerOpen, setPlayerOpen] = useState(false);
  const rain = useAmbientSound("rain");
  const fire = useAmbientSound("fire");

  const track = TRACKS.find((t) => t.id === activeId);

  function selectTrack(id: string) {
    if (activeId === id) { setPlayerOpen((o) => !o); }
    else { setActiveId(id); setPlayerOpen(true); }
  }

  return (
    <div className="border-t border-border bg-card/95 backdrop-blur-md shrink-0">
      {/* Visible YouTube embed panel — real controls, reliable autoplay */}
      {activeId && track && playerOpen && (
        <div className="border-b border-border relative">
          <button
            onClick={() => { setPlayerOpen(false); setActiveId(null); }}
            className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
          <iframe
            key={activeId}
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
        <Music2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />

        <div className="flex gap-1.5 flex-1 overflow-x-auto no-scrollbar">
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

        {activeId && (
          <button
            onClick={() => setPlayerOpen((o) => !o)}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title={playerOpen ? "Hide player" : "Show player"}
          >
            {playerOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        )}

        <div className="h-4 w-px bg-border shrink-0" />

        <div className="flex items-center gap-1.5 shrink-0">
          <Volume2 className="w-3 h-3 text-muted-foreground" />
          <AmbientControl icon={<CloudRain className="w-3.5 h-3.5" />} label="Rain" vol={rain.vol} onVolume={rain.setVolume} color="oklch(0.65 0.18 200)" />
          <AmbientControl icon={<Flame className="w-3.5 h-3.5" />}     label="Fire" vol={fire.vol} onVolume={fire.setVolume} color="oklch(0.70 0.19 32)"  />
        </div>
      </div>
    </div>
  );
}
