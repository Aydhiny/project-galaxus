"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Check, CheckSquare, Keyboard, Loader2, Mic, RotateCcw, Repeat, Square, Target, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VoiceCommand } from "@/lib/db/schema";
import type { VoiceAction } from "@/lib/voice";
import { getVoiceCommand, retryVoiceCommand, submitVoiceCommand } from "@/lib/actions/voice";
import { useStoredValue } from "@/lib/hooks/client-values";
import { BrandIcon } from "@/components/brand-icon";

// ─── Speech recognition (built into Chrome/Edge/Safari — free, no key) ────────

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function createRecognition(): Recognition | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

const LANGS = [
  { code: "en-US", label: "EN" },
  { code: "bs-BA", label: "BS" },
];
const LANG_KEY = "galaxus-voice-lang";

type Phase = "idle" | "listening" | "review" | "tracking";

const KIND_ICON = { task: CheckSquare, goal: Target, routine: Repeat } as const;
const KIND_TILE = {
  task: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
  goal: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
  routine: "bg-orange-500/12 text-orange-600 dark:text-orange-400",
} as const;
const VERB_STYLE: Record<VoiceAction["verb"], string> = {
  created: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  planned: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  updated: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  completed: "bg-emerald-600 text-white",
  removed: "bg-muted text-muted-foreground",
};

export function VoicePanel({ onClose, compact }: { onClose?: () => void; compact?: boolean }) {
  const storedLang = useStoredValue(LANG_KEY);
  const lang = LANGS.some((l) => l.code === storedLang) ? storedLang! : "en-US";
  const [phase, setPhase] = useState<Phase>("idle");
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [command, setCommand] = useState<VoiceCommand | null>(null);
  const [dispatched, setDispatched] = useState(true);
  const [sending, setSending] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const recRef = useRef<Recognition | null>(null);
  const finalRef = useRef("");
  const barsRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);
  const audioRef = useRef<{ stream: MediaStream; ctx: AudioContext; raf: number } | null>(null);
  const sentAt = useRef(0);

  // ── Listening ───────────────────────────────────────────────────────────────
  function stopAudio() {
    const a = audioRef.current;
    if (!a) return;
    cancelAnimationFrame(a.raf);
    a.stream.getTracks().forEach((t) => t.stop());
    a.ctx.close().catch(() => {});
    audioRef.current = null;
    barsRef.current?.querySelectorAll("span").forEach((b) => { (b as HTMLElement).style.transform = ""; });
    if (ringRef.current) ringRef.current.style.transform = "";
  }

  async function startAudioMeter() {
    // Purely visual: a waveform that follows your voice. Written straight to
    // the DOM (refs), not React state — 60 updates a second would re-render
    // the whole panel. If the mic stream isn't available, bars stay idle.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const freq = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(freq);
        const bars = barsRef.current?.children;
        if (bars) {
          const n = bars.length;
          let total = 0;
          for (let i = 0; i < n; i++) {
            // Mirror around the centre so the wave looks symmetric.
            const bin = Math.floor((Math.abs(i - (n - 1) / 2) / (n / 2)) * 40) + 2;
            const v = freq[bin] / 255;
            total += v;
            (bars[i] as HTMLElement).style.transform = `scaleY(${0.12 + v * 0.88})`;
          }
          if (ringRef.current) ringRef.current.style.transform = `scale(${1 + (total / n) * 0.25})`;
        }
        audioRef.current!.raf = requestAnimationFrame(tick);
      };
      audioRef.current = { stream, ctx, raf: requestAnimationFrame(tick) };
    } catch {
      /* visual only */
    }
  }

  function startListening() {
    const rec = createRecognition();
    if (!rec) {
      setTyping(true);
      setPhase("review");
      toast.message("Voice input isn't available in this browser — type instead (on Windows, Win + H dictates).");
      return;
    }
    finalRef.current = "";
    setFinalText("");
    setInterim("");
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current = `${finalRef.current} ${r[0].transcript}`.trim();
        else live += r[0].transcript;
      }
      setFinalText(finalRef.current);
      setInterim(live);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        toast.error("Microphone blocked. Allow it for Galaxus in your browser settings.");
      } else if (e.error !== "aborted" && e.error !== "no-speech") {
        toast.error(`Voice input stopped (${e.error}).`);
      }
    };
    rec.onend = () => {
      stopAudio();
      recRef.current = null;
      setInterim("");
      setDraft(finalRef.current);
      setPhase((p) => (p === "listening" ? "review" : p));
    };
    recRef.current = rec;
    rec.start();
    setPhase("listening");
    startAudioMeter();
  }

  function stopListening() {
    recRef.current?.stop();
  }

  // Release the mic if the panel closes mid-sentence.
  useEffect(() => () => {
    recRef.current?.abort();
    stopAudio();
  }, []);

  // ── Sending + live tracking ─────────────────────────────────────────────────
  async function send() {
    const transcript = draft.trim();
    if (transcript.length < 3) return;
    setSending(true);
    try {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const res = await submitVoiceCommand({
        transcript,
        localDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
        localTime: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setDispatched(res.dispatched);
      sentAt.current = Date.now();
      setElapsed(0);
      setCommand({ id: res.id, status: "queued", actions: [], transcript } as unknown as VoiceCommand);
      setPhase("tracking");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send.");
    } finally {
      setSending(false);
    }
  }

  const trackingId = phase === "tracking" ? command?.id : undefined;
  const finished = command?.status === "done" || command?.status === "failed";
  useEffect(() => {
    if (!trackingId || finished) return;
    let alive = true;
    const poll = async () => {
      try {
        const row = await getVoiceCommand(trackingId);
        if (alive && row) setCommand(row);
      } catch { /* keep polling */ }
    };
    const t = setInterval(poll, 1500);
    const clock = setInterval(() => { if (alive) setElapsed(Math.round((Date.now() - sentAt.current) / 1000)); }, 1000);
    return () => { alive = false; clearInterval(t); clearInterval(clock); };
  }, [trackingId, finished]);

  async function retry() {
    if (!command) return;
    try {
      const r = await retryVoiceCommand(command.id);
      setDispatched(r.dispatched);
      sentAt.current = Date.now();
      setCommand({ ...command, status: "queued", error: null });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't retry.");
    }
  }

  function reset() {
    setPhase("idle");
    setDraft("");
    setFinalText("");
    setCommand(null);
    setTyping(false);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const live = `${finalText} ${interim}`.trim();
  return (
    <div className={cn("relative flex flex-col items-center text-center", compact ? "py-6" : "py-10")}>
      {onClose && (
        <button onClick={onClose} aria-label="Close" className="absolute right-0 top-0 w-9 h-9 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-accent">
          <X className="w-4 h-4" />
        </button>
      )}

      {(phase === "idle" || phase === "listening") && (
        <>
          <div className="relative w-28 h-28 flex items-center justify-center">
            {/* One thin ring that swells with your voice — no glow, no blur. */}
            <span ref={ringRef} aria-hidden className={cn(
              "absolute inset-0 rounded-full border transition-[transform,border-color] duration-100",
              phase === "listening" ? "border-foreground/25" : "border-border"
            )} />
            <button
              onClick={phase === "listening" ? stopListening : startListening}
              aria-label={phase === "listening" ? "Stop listening" : "Start speaking"}
              className={cn(
                "relative z-10 w-[4.5rem] h-[4.5rem] rounded-full flex items-center justify-center transition-all shadow-sm",
                phase === "listening" ? "bg-red-500 text-white" : "bg-foreground text-background hover:scale-[1.04]"
              )}
            >
              {phase === "listening" ? <Square className="w-5 h-5 fill-current" /> : <Mic className="w-7 h-7" />}
            </button>
          </div>
          <div ref={barsRef} aria-hidden className={cn("mt-6 flex items-center justify-center gap-[3px] h-8 transition-opacity", phase === "listening" ? "opacity-100" : "opacity-30")}>
            {Array.from({ length: 32 }, (_, i) => (
              <span key={i} className="w-[3px] h-8 rounded-full bg-foreground/70 origin-center transition-transform duration-75" style={{ transform: "scaleY(0.12)" }} />
            ))}
          </div>
          <p className="mt-4 text-sm text-muted-foreground inline-flex items-center gap-1.5">
            {phase === "listening" ? "Listening… tap to stop" : <><BrandIcon name="claude" className="w-3.5 h-3.5" /> Tell Claude what to plan</>}
          </p>
          <div className="mt-4 min-h-[4.5rem] max-w-xl px-4 text-lg leading-relaxed">
            {phase === "listening" && (
              live
                ? <p>{finalText} <span className="text-muted-foreground">{interim}</span></p>
                : <p className="text-muted-foreground/70">“Add RS2 defense practice tomorrow at seven, and read ten pages every night”</p>
            )}
          </div>
          {phase === "idle" && (
            <div className="mt-2 flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/50" role="group" aria-label="Language">
                {LANGS.map((l) => (
                  <button key={l.code}
                    onClick={() => { try { localStorage.setItem(LANG_KEY, l.code); window.dispatchEvent(new StorageEvent("storage", { key: LANG_KEY })); } catch { /* private mode */ } }}
                    className={cn("px-2.5 h-7 rounded-md text-xs font-medium", lang === l.code ? "bg-background shadow-xs" : "text-muted-foreground")}>
                    {l.label}
                  </button>
                ))}
              </div>
              <button onClick={() => { setTyping(true); setPhase("review"); }} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                <Keyboard className="w-3.5 h-3.5" /> Type instead
              </button>
            </div>
          )}
        </>
      )}

      {phase === "review" && (
        <div className="w-full max-w-xl">
          <p className="text-sm text-muted-foreground mb-3">{typing ? "What should Claude do?" : "Check it, fix any misheard words, then send."}</p>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }}
            rows={4}
            maxLength={2000}
            placeholder="Add RS2 defense practice tomorrow at 19:00…"
            className="w-full rounded-xl border border-border bg-muted/30 p-4 text-base leading-relaxed text-left"
          />
          <div className="mt-3 flex items-center justify-center gap-2">
            <button onClick={reset} className="h-10 px-4 rounded-lg text-sm text-muted-foreground hover:bg-accent">Cancel</button>
            {!typing && (
              <button onClick={startListening} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg border border-border text-sm hover:bg-accent">
                <Mic className="w-4 h-4" /> Again
              </button>
            )}
            <button onClick={send} disabled={sending || draft.trim().length < 3}
              className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <BrandIcon name="claude" className="w-4 h-4" color="currentColor" />} Send to Claude
            </button>
          </div>
        </div>
      )}

      {phase === "tracking" && command && (
        <div className="w-full max-w-xl text-left">
          <blockquote className="rounded-xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground italic">“{command.transcript}”</blockquote>

          <ol className="mt-5 space-y-3">
            <Stage done label="Sent" />
            <Stage
              done={command.status !== "queued"}
              active={command.status === "queued"}
              label={command.status === "queued" ? "Starting Claude" : "Claude started"}
              hint={command.status === "queued"
                ? dispatched ? `Spinning up a private runner… ${elapsed}s` : "No GitHub key yet — it's picked up within ~10 minutes"
                : undefined}
            />
            <Stage
              done={finished}
              active={command.status === "running"}
              failed={command.status === "failed"}
              label={command.status === "failed" ? "Couldn't finish" : command.status === "done" ? "Done" : "Working"}
              hint={command.status === "running" ? `Using your Galaxus tools… ${elapsed}s` : command.status === "failed" ? command.error ?? undefined : undefined}
            />
          </ol>

          <div className="mt-5 space-y-2">
            <AnimatePresence initial={false}>
              {command.actions.map((a, i) => <ActionCard key={`${i}-${a.title}`} action={a} index={i} />)}
            </AnimatePresence>
            {command.status === "done" && command.actions.length === 0 && (
              <p className="text-sm text-muted-foreground">Claude didn&apos;t change anything this time.</p>
            )}
          </div>

          {command.status === "done" && command.summary && <TypedSummary text={command.summary} />}

          {finished && (
            <div className="mt-6 flex justify-center gap-2">
              {command.status === "failed" && (
                <button onClick={retry} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg border border-border text-sm hover:bg-accent">
                  <RotateCcw className="w-4 h-4" /> Retry
                </button>
              )}
              <button onClick={reset} className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">
                <Mic className="w-4 h-4" /> New command
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stage({ label, hint, done, active, failed }: { label: string; hint?: string; done?: boolean; active?: boolean; failed?: boolean }) {
  return (
    <li className="flex items-start gap-3">
      <span className={cn(
        "mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors",
        failed ? "bg-destructive text-white" : done ? "bg-emerald-500 text-white" : active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
      )}>
        {failed ? <X className="w-3 h-3" /> : done ? <Check className="w-3 h-3" strokeWidth={3} /> : active ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
      </span>
      <div>
        <p className={cn("text-sm font-medium", !done && !active && !failed && "text-muted-foreground")}>{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </li>
  );
}

function ActionCard({ action, index }: { action: VoiceAction; index: number }) {
  const Icon = KIND_ICON[action.kind];
  const body = (
    <>
      <span className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", KIND_TILE[action.kind])}><Icon className="w-4 h-4" /></span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{action.title}</p>
        {action.detail && <p className="text-xs text-muted-foreground truncate">{action.detail}</p>}
      </div>
      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium capitalize", VERB_STYLE[action.verb])}>{action.verb}</span>
    </>
  );
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 28, delay: Math.min(index, 6) * 0.06 }}
    >
      {action.href ? (
        <Link href={action.href} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 hover:bg-accent/50">{body}</Link>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">{body}</div>
      )}
    </motion.div>
  );
}

/** Claude's recap, revealed word by word. */
function TypedSummary({ text }: { text: string }) {
  const words = text.split(/\s+/);
  return (
    <p className="mt-5 text-sm leading-relaxed">
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground mr-2 align-middle"><BrandIcon name="claude" className="w-3.5 h-3.5" /> Claude</span>
      {words.map((w, i) => (
        <motion.span key={i} initial={{ opacity: 0, filter: "blur(4px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} transition={{ delay: 0.15 + i * 0.035, duration: 0.25 }}>
          {w}{" "}
        </motion.span>
      ))}
    </p>
  );
}
