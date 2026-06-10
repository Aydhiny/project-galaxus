"use client";

import { useEffect, useRef, useState } from "react";
import { useCommandStore } from "@/lib/store/command";
import { Zap, X } from "lucide-react";
import { toast } from "sonner";

/* Saves to the same galaxus-notes localStorage key used by the Notes page */
const NOTES_KEY = "galaxus-notes";

function saveQuickNote(text: string) {
  if (!text.trim()) return;
  try {
    const existing = JSON.parse(localStorage.getItem(NOTES_KEY) ?? "[]");
    const note = {
      id: crypto.randomUUID(),
      title: text.trim().slice(0, 60) || "Quick Capture",
      content: text.trim(),
      category: "Quick",
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem(NOTES_KEY, JSON.stringify([note, ...existing]));
  } catch { /* ignore */ }
}

export function QuickCapture() {
  const { captureOpen, closeCapture, openCapture } = useCommandStore();
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* Backtick hotkey — open/close */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      // Don't trigger while typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "`") { e.preventDefault(); captureOpen ? closeCapture() : openCapture(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [captureOpen, closeCapture, openCapture]);

  /* Focus on open */
  useEffect(() => {
    if (captureOpen) { setText(""); setTimeout(() => textareaRef.current?.focus(), 30); }
  }, [captureOpen]);

  function save() {
    if (!text.trim()) { closeCapture(); return; }
    saveQuickNote(text);
    toast.success("Captured! Find it in Notes → Quick", { duration: 2500 });
    closeCapture();
  }

  function handleKey(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); save(); }
    if (e.key === "Escape") closeCapture();
  }

  if (!captureOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" onClick={closeCapture}>
      <div className="absolute inset-0 bg-background/60 backdrop-blur-md" />

      <div
        className="relative w-full max-w-lg mx-4 rounded-2xl border border-border bg-card overflow-hidden shadow-2xl"
        style={{ boxShadow: "0 24px 80px oklch(0 0 0 / 55%)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-[var(--gold-muted)]">
            <Zap className="w-3.5 h-3.5 text-[var(--gold)]" />
          </div>
          <p className="text-sm font-semibold">Quick Capture</p>
          <p className="text-xs text-muted-foreground ml-auto">Saves to Notes → Quick</p>
          <button onClick={closeCapture} className="text-muted-foreground hover:text-foreground transition-colors ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Textarea */}
        <div className="p-4">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKey}
            placeholder="What's on your mind?  ·  Idea, thought, task, anything…"
            className="w-full h-36 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none leading-relaxed"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted font-mono">⌘ Enter</kbd> save
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted font-mono">Esc</kbd> discard
            </span>
          </div>
          <button
            onClick={save}
            disabled={!text.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--gold)] text-[oklch(0.08_0.01_85)] disabled:opacity-40 transition-opacity"
          >
            <Zap className="w-3.5 h-3.5" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* Floating ` button — visible on all pages */
export function QuickCaptureButton() {
  const { openCapture, captureOpen } = useCommandStore();
  if (captureOpen) return null;
  return (
    <button
      onClick={openCapture}
      title="Quick capture (` key)"
      className="fixed bottom-20 right-4 z-[90] w-10 h-10 rounded-full bg-card border border-border shadow-lg flex items-center justify-center text-muted-foreground hover:text-[var(--gold)] hover:border-[var(--gold)]/40 transition-all hover:scale-110"
    >
      <Zap className="w-4 h-4" />
    </button>
  );
}
