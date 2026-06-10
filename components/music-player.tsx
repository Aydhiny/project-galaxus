"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Music2, CloudRain, Flame, X, ChevronDown, ChevronUp, Volume2, Wind, Tv, Minimize2, Radio, Music, Gamepad2, Zap } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useAmbientStore } from "@/lib/store/ambient";
import { useFeedVideoStore } from "@/lib/store/feed-video";

const TRACKS: { id: string; label: string; icon: React.ReactNode; videoId: string; color: string }[] = [
  { id: "lofi",      label: "Lofi Beats",    icon: <Radio className="w-3 h-3"/>,    videoId: "jfKfPfyJRdk", color: "oklch(0.65 0.20 290)" },
  { id: "classical", label: "Classical",     icon: <Music className="w-3 h-3"/>,    videoId: "OYifjZ8jLQs", color: "oklch(0.72 0.14 78)"  },
  { id: "zelda",     label: "Zelda & Chill", icon: <Gamepad2 className="w-3 h-3"/>, videoId: "GdzrrWA8e7A", color: "oklch(0.68 0.14 158)" },
  { id: "study",     label: "40Hz Focus",    icon: <Zap className="w-3 h-3"/>,      videoId: "7Kdc95rNQlc", color: "oklch(0.76 0.17 50)"  },
];

// ─── Sound generators ──────────────────────────────────────────────────────────
function makeRainNode(ctx: AudioContext): AudioNode {
  const node = ctx.createScriptProcessor(4096, 0, 1);
  let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
  node.onaudioprocess = (e) => {
    const out = e.outputBuffer.getChannelData(0);
    for (let i = 0; i < 4096; i++) {
      const w = Math.random()*2-1;
      b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759;
      b2=0.96900*b2+w*0.1538520; b3=0.86650*b3+w*0.3104856;
      b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
      const pink=(b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.07;
      b6=w*0.115926;
      out[i]=pink;
    }
  };
  const filter=ctx.createBiquadFilter();
  filter.type="bandpass"; filter.frequency.value=700; filter.Q.value=0.4;
  node.connect(filter);
  return filter;
}

// Real fire: layered pink hiss + warm brown rumble + slow LFO + random crackles
function makeFireNode(ctx: AudioContext): AudioNode {
  const merger = ctx.createChannelMerger(1);

  // Pink noise hiss layer
  const hissNode = ctx.createScriptProcessor(4096, 0, 1);
  let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
  hissNode.onaudioprocess = (e) => {
    const out = e.outputBuffer.getChannelData(0);
    for (let i = 0; i < 4096; i++) {
      const w=Math.random()*2-1;
      b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759;
      b2=0.96900*b2+w*0.1538520; b3=0.86650*b3+w*0.3104856;
      b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
      b6=w*0.115926;
      out[i]=(b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.04;
    }
  };
  const hissFilter = ctx.createBiquadFilter();
  hissFilter.type = "highshelf"; hissFilter.frequency.value = 2000; hissFilter.gain.value = -8;
  const hissFilter2 = ctx.createBiquadFilter();
  hissFilter2.type = "lowpass"; hissFilter2.frequency.value = 1800;
  hissNode.connect(hissFilter); hissFilter.connect(hissFilter2);

  // Brown rumble + crackle layer
  const rumbleNode = ctx.createScriptProcessor(4096, 0, 1);
  let rum=0, lfoPhase=0, crackAmp=0, crackDecay=0, nextCrack=25000+Math.floor(Math.random()*40000), sc=0;
  rumbleNode.onaudioprocess = (e) => {
    const out = e.outputBuffer.getChannelData(0);
    for (let i = 0; i < 4096; i++) {
      const w=Math.random()*2-1;
      rum=(rum+0.008*w)/1.008;
      lfoPhase+=2*Math.PI*0.7/44100;
      if(lfoPhase>2*Math.PI) lfoPhase-=2*Math.PI;
      const lfo=0.60+0.40*Math.sin(lfoPhase);
      const lfo2=0.80+0.20*Math.sin(lfoPhase*1.7+1.2);
      sc++;
      let crackle=0;
      if(sc>=nextCrack){
        crackAmp=(Math.random()>0.5?1:-1)*(0.55+Math.random()*0.45);
        crackDecay=1.0; sc=0;
        nextCrack=18000+Math.floor(Math.random()*60000);
      }
      if(crackDecay>0.003){ crackle=crackAmp*crackDecay; crackDecay*=0.958; }
      out[i]=(rum*4.5)*lfo*lfo2 + crackle*0.45;
    }
  };
  const rumFilter = ctx.createBiquadFilter();
  rumFilter.type="lowpass"; rumFilter.frequency.value=800;

  // Gentle pop/spit layer
  const popNode = ctx.createScriptProcessor(4096, 0, 1);
  let popAmp=0, popDecay=0, nextPop=8000+Math.floor(Math.random()*20000), sp=0;
  popNode.onaudioprocess = (e) => {
    const out = e.outputBuffer.getChannelData(0);
    for (let i = 0; i < 4096; i++) {
      sp++;
      let pop=0;
      if(sp>=nextPop){
        popAmp=(Math.random()>0.5?1:-1)*(0.3+Math.random()*0.7);
        popDecay=1.0; sp=0;
        nextPop=5000+Math.floor(Math.random()*18000);
      }
      if(popDecay>0.005){ pop=popAmp*popDecay*(Math.random()*2-1); popDecay*=0.85; }
      out[i]=pop*0.25;
    }
  };
  const popFilter = ctx.createBiquadFilter();
  popFilter.type="bandpass"; popFilter.frequency.value=3500; popFilter.Q.value=1.5;

  rumbleNode.connect(rumFilter);
  popNode.connect(popFilter);

  // Mix all layers
  const masterGain = ctx.createGain();
  masterGain.gain.value = 1;
  hissFilter2.connect(masterGain);
  rumFilter.connect(masterGain);
  popFilter.connect(masterGain);

  return masterGain;
}

function makeBrownNode(ctx: AudioContext): AudioNode {
  const node = ctx.createScriptProcessor(4096, 0, 1);
  let lastOut=0;
  node.onaudioprocess = (e) => {
    const out = e.outputBuffer.getChannelData(0);
    for (let i=0;i<4096;i++){
      const w=Math.random()*2-1;
      lastOut=(lastOut+0.02*w)/1.02;
      out[i]=lastOut*3.5;
    }
  };
  const f=ctx.createBiquadFilter();
  f.type="lowpass"; f.frequency.value=400;
  node.connect(f);
  return f;
}

type SoundType = "rain"|"fire"|"brown";
const MAKERS = { rain: makeRainNode, fire: makeFireNode, brown: makeBrownNode };

function useAmbientSound(type: SoundType, vol: number, setVol: (v:number)=>void) {
  const ctxRef = useRef<AudioContext|null>(null);
  const gainRef = useRef<GainNode|null>(null);

  const ensureCtx = useCallback(() => {
    if (ctxRef.current) return ctxRef.current;
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    gainRef.current = gain;
    const sourceNode = MAKERS[type](ctx);
    (sourceNode as AudioNode).connect(gain);
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
    setVol(v);
  }, [ensureCtx, setVol]);

  return { setVolume };
}

// ─── Ambient control button ────────────────────────────────────────────────────
function AmbientControl({
  icon, label, vol, onVolume, color, activeIcon,
}: {
  icon: React.ReactNode; label: string; vol: number;
  onVolume: (v:number)=>void; color: string; activeIcon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o=>!o)}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border",
          vol>0
            ? "border-transparent text-background font-semibold shadow-sm"
            : open ? "border-border bg-accent text-foreground"
            : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
        )}
        style={vol>0 ? { background: color } : {}}
      >
        {vol>0 ? (activeIcon || icon) : icon}
        <span className="hidden sm:inline">{label}</span>
        {vol>0 && <span className="tabular-nums text-[10px]">{vol}%</span>}
      </button>
      {open && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-40 rounded-xl border border-border bg-card shadow-2xl p-3 z-50">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-semibold" style={{ color }}>{label}</span>
            <button onClick={() => { onVolume(0); setOpen(false); }} className="text-muted-foreground hover:text-foreground p-0.5 rounded-md hover:bg-accent transition-colors">
              <X className="w-3 h-3" />
            </button>
          </div>
          <Slider min={0} max={100} step={5} value={[vol]}
            onValueChange={(v) => onVolume(Number(Array.isArray(v)?v[0]:v))} />
          <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground"><span>Off</span><span>Max</span></div>
        </div>
      )}
    </div>
  );
}

// ─── Main player ──────────────────────────────────────────────────────────────
export function MusicPlayer() {
  const [activeId, setActiveId] = useState<string|null>(null);
  const [playerOpen, setPlayerOpen] = useState(false);
  const { rainVol, fireVol, brownVol, setRainVol, setFireVol, setBrownVol } = useAmbientStore();
  const { pinned, collapsed: feedCollapsed, setPinned, setCollapsed: setFeedCollapsed } = useFeedVideoStore();

  // setVolume creates+resumes the AudioContext and sets gain — must be used instead of raw store setters
  const { setVolume: setRainAudio }  = useAmbientSound("rain",  rainVol,  setRainVol);
  const { setVolume: setFireAudio }  = useAmbientSound("fire",  fireVol,  setFireVol);
  const { setVolume: setBrownAudio } = useAmbientSound("brown", brownVol, setBrownVol);

  const track = TRACKS.find(t=>t.id===activeId);
  const showMusicVideo = activeId && track && playerOpen;
  const showFeedVideo = pinned && !feedCollapsed;

  function selectTrack(id: string) {
    if (activeId===id) setPlayerOpen(o=>!o);
    else { setActiveId(id); setPlayerOpen(true); }
  }

  return (
    <div className="border-t border-border bg-card/95 backdrop-blur-md shrink-0">
      {/* ── Pinned feed video ── */}
      {showFeedVideo && (
        <div className="border-b border-border relative">
          <div className="absolute top-2 right-2 z-10 flex gap-1">
            <button onClick={() => setFeedCollapsed(true)}
              className="w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors">
              <Minimize2 className="w-3 h-3" />
            </button>
            <button onClick={() => setPinned(null)}
              className="w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors">
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="px-4 pt-2 pb-1">
            <div className="flex items-center gap-1.5 mb-1">
              <Tv className="w-3 h-3 text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground truncate max-w-[60%]">{pinned!.title}</p>
            </div>
          </div>
          <iframe key={pinned!.id}
            src={`https://www.youtube-nocookie.com/embed/${pinned!.id}?autoplay=1&rel=0`}
            allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen
            className="w-full" style={{ height: 200 }} title={pinned!.title} />
        </div>
      )}

      {/* ── Collapsed feed video pill ── */}
      {pinned && feedCollapsed && (
        <div className="border-b border-border px-4 py-1.5 flex items-center justify-between">
          <button onClick={() => setFeedCollapsed(false)}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Tv className="w-3.5 h-3.5 text-[var(--gold)]" />
            <span className="truncate max-w-[200px]">{pinned.title}</span>
            <ChevronUp className="w-3 h-3 shrink-0" />
          </button>
          <button onClick={() => setPinned(null)} className="text-muted-foreground hover:text-foreground transition-colors p-1">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* ── Music iframe ── */}
      {showMusicVideo && (
        <div className="border-b border-border relative">
          <button onClick={() => { setPlayerOpen(false); setActiveId(null); }}
            className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors">
            <X className="w-3 h-3" />
          </button>
          <iframe key={activeId}
            src={`https://www.youtube-nocookie.com/embed/${track!.videoId}?autoplay=1&loop=1&playlist=${track!.videoId}&controls=1&rel=0`}
            allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen
            className="w-full" style={{ height: 180 }} title={track!.label} />
        </div>
      )}

      {/* ── Controls bar ── */}
      <div className="flex items-center gap-2 px-4 py-2 h-12">
        <Music2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />

        <div className="flex gap-1.5 flex-1 overflow-x-auto scrollbar-hide">
          {TRACKS.map(t => (
            <button key={t.id} onClick={() => selectTrack(t.id)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border shrink-0",
                activeId===t.id
                  ? "border-transparent text-background shadow-sm"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
              style={activeId===t.id ? { background: t.color } : {}}>
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {activeId && (
          <button onClick={() => setPlayerOpen(o=>!o)} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
            {playerOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        )}

        <div className="h-4 w-px bg-border shrink-0" />

        <div className="flex items-center gap-1 shrink-0">
          <Volume2 className="w-3 h-3 text-muted-foreground" />
          <AmbientControl
            icon={<CloudRain className="w-3.5 h-3.5" />} label="Rain"
            vol={rainVol} onVolume={setRainAudio} color="oklch(0.52 0.18 222)"
            activeIcon={<CloudRain className="w-3.5 h-3.5" />} />
          <AmbientControl
            icon={<Flame className="w-3.5 h-3.5" />} label="Fire"
            vol={fireVol} onVolume={setFireAudio} color="oklch(0.60 0.22 30)"
            activeIcon={<Flame className="w-3.5 h-3.5" />} />
          <AmbientControl
            icon={<Wind className="w-3.5 h-3.5" />} label="Brown"
            vol={brownVol} onVolume={setBrownAudio} color="oklch(0.50 0.12 55)"
            activeIcon={<Wind className="w-3.5 h-3.5" />} />
        </div>
      </div>
    </div>
  );
}
