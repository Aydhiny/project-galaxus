"use client";

// One dialog for the facility: a dim backdrop, a Galaxus card, Escape and
// backdrop-click close it. Replaces browser confirm()/prompt() everywhere in Ops.

import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROVIDERS, ROLES, type ProviderKey, type RoleKey } from "@/lib/ops";
import { ProviderIcon } from "@/components/ops/provider-logos";
import { DURATION, prefersReducedMotion } from "@/lib/motion";

// Shared Ops controls. `press` = squeeze + spring back, `lift` = 1px hover rise
// (both from the motion system in app/globals.css), plus a visible keyboard focus ring.
const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[#6b8afd]/70 focus-visible:ring-offset-1 focus-visible:ring-offset-[#26272b]";
export const field = "w-full rounded-lg bg-white/[0.06] border border-white/10 px-2.5 py-1.5 text-sm text-white placeholder:text-white/35 transition-[border-color,box-shadow,background-color] duration-150 hover:border-white/20 focus:outline-none focus:border-[#6b8afd]/70 focus:bg-white/[0.08] focus:shadow-[0_0_0_3px_rgb(107_138_253/0.18)]";
export const btnPrimary = `inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg bg-[#6b8afd] text-[#0f1222] text-sm font-semibold press lift hover:bg-[#7d98ff] disabled:opacity-40 ${focusRing}`;
export const btnGhost = `inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg border border-white/15 text-sm text-white/85 press hover:bg-white/10 hover:border-white/25 disabled:opacity-40 ${focusRing}`;
export const btnDanger = `inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg bg-rose-500 text-white text-sm font-semibold press lift hover:bg-rose-400 disabled:opacity-40 ${focusRing}`;

// Lets buttons inside a Dialog close it with the exit animation (see DialogClose).
const CloseCtx = createContext<(() => void) | null>(null);

/** A button that closes the surrounding Dialog, animating it out. */
export function DialogClose({ className, children }: { className?: string; children: React.ReactNode }) {
  const close = useContext(CloseCtx);
  return <button type="button" onClick={() => close?.()} className={className}>{children}</button>;
}

export function Dialog({ title, sub, onClose, children, wide }: { title: React.ReactNode; sub?: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  // Escape, the backdrop, the X and <DialogClose> play a short exit (backdrop
  // fades, card shrinks) before calling onClose. Callers that unmount the
  // dialog themselves (e.g. after a successful action) still close instantly.
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const close = useCallback(() => {
    if (timer.current) return;
    if (prefersReducedMotion()) { onClose(); return; }
    setClosing(true);
    timer.current = setTimeout(onClose, DURATION.fast);
  }, [onClose]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  // Portalled to <body>: a parent with backdrop-blur would otherwise trap even a `fixed` overlay inside itself.
  return createPortal(
    <CloseCtx.Provider value={close}>
      <div className="overlay-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-3 sm:p-6" data-closing={closing || undefined} onClick={close} role="presentation">
        <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} data-closing={closing || undefined}
          className={cn("overlay-panel w-full max-h-full overflow-y-auto rounded-2xl border border-white/10 bg-[#26272b] text-white p-4 sm:p-5 shadow-2xl", wide ? "max-w-3xl" : "max-w-md")}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold leading-tight">{title}</h2>
              {sub && <p className="text-xs text-white/55 mt-1">{sub}</p>}
            </div>
            <button onClick={close} className={cn("h-8 w-8 shrink-0 rounded-lg hover:bg-white/10 inline-flex items-center justify-center [&>svg]:transition-[rotate] [&>svg]:duration-200 hover:[&>svg]:rotate-90", focusRing)} aria-label="Close"><X className="w-4 h-4" /></button>
          </div>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </CloseCtx.Provider>,
    document.body,
  );
}

/** Yes/no with a real explanation. `action` may throw; its message is shown. */
export function ConfirmDialog({ title, body, confirm, danger, onClose, action }: {
  title: string; body: React.ReactNode; confirm: string; danger?: boolean; onClose: () => void; action: () => Promise<unknown>;
}) {
  const [busy, start] = useTransition();
  return (
    <Dialog title={title} onClose={onClose}>
      <div className="text-sm text-white/75 space-y-2">{body}</div>
      <div className="mt-5 flex justify-end gap-2">
        <DialogClose className={btnGhost}>Cancel</DialogClose>
        <button autoFocus disabled={busy} onClick={() => start(async () => { try { await action(); onClose(); } catch (e) { toast.error((e as Error).message); } })}
          className={danger ? btnDanger : btnPrimary}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}{confirm}
        </button>
      </div>
    </Dialog>
  );
}

/** Ask for one line of text (e.g. what to fix when sending work back). */
export function PromptDialog({ title, sub, placeholder, confirm, optional, onClose, action }: {
  title: string; sub?: string; placeholder: string; confirm: string; optional?: boolean; onClose: () => void; action: (text: string) => Promise<unknown>;
}) {
  const [text, setText] = useState("");
  const [busy, start] = useTransition();
  return (
    <Dialog title={title} sub={sub} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); start(async () => { try { await action(text.trim()); onClose(); } catch (err) { toast.error((err as Error).message); } }); }}>
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1000} placeholder={placeholder} className={field} />
        <div className="mt-4 flex justify-end gap-2">
          <DialogClose className={btnGhost}>Cancel</DialogClose>
          <button disabled={busy || (!optional && !text.trim())} className={btnPrimary}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}{confirm}</button>
        </div>
      </form>
    </Dialog>
  );
}

/** Removing an agent, with exactly what will happen. */
export function RemoveAgentDialog({ agent, holding, onClose, action }: {
  agent: { name: string; role: RoleKey; provider: ProviderKey; cloud: boolean }; holding: number; onClose: () => void; action: () => Promise<unknown>;
}) {
  const [busy, start] = useTransition();
  return (
    <Dialog title={`Remove ${agent.name}?`} onClose={onClose}>
      <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] border border-white/10 p-3">
        <span className="w-10 h-10 rounded-xl bg-white/[0.06] inline-flex items-center justify-center"><ProviderIcon provider={agent.provider} className="w-6 h-6" /></span>
        <div className="min-w-0">
          <p className="font-semibold leading-tight">{agent.name}</p>
          <p className="text-xs text-white/55">{ROLES[agent.role].label} · {agent.cloud ? "Galaxus cloud" : PROVIDERS[agent.provider].label}</p>
        </div>
      </div>
      <ul className="mt-3 space-y-1.5 text-sm text-white/75">
        {!agent.cloud && <li>• Its token stops working right away: {PROVIDERS[agent.provider].label} can no longer reach your facility.</li>}
        <li>• {holding ? `The ${holding} mission${holding === 1 ? " it holds goes" : "s it holds go"} back on the board for someone else.` : "It isn't holding any missions."}</li>
        <li>• Its desk, feed history and scorecard are removed. Delivered results stay on their missions.</li>
      </ul>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-200/90"><AlertTriangle className="w-3.5 h-3.5" /> This can&apos;t be undone. You can hire a new agent any time.</p>
      <div className="mt-5 flex justify-end gap-2">
        <DialogClose className={btnGhost}>Keep {agent.name}</DialogClose>
        <button disabled={busy} onClick={() => start(async () => { try { await action(); onClose(); } catch (e) { toast.error((e as Error).message); } })} className={btnDanger}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}Remove {agent.name}
        </button>
      </div>
    </Dialog>
  );
}
