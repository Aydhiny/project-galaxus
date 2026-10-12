"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookHeart, Loader2, Lock, ShieldCheck } from "lucide-react";
import { setDiaryPinC, unlockDiaryC } from "@/lib/client/diary";

/** PIN screen: set one the first time, then unlock (15 minutes per unlock, enforced by the server). */
export function DiaryLock({ hasPin }: { hasPin: boolean }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      try {
        if (hasPin) await unlockDiaryC(pin);
        else {
          if (pin !== confirm) throw new Error("The PINs don't match.");
          await setDiaryPinC(pin);
          toast.success("PIN set — your diary is locked behind it from now on.");
        }
        router.refresh();
      } catch (e) {
        setPin(""); setConfirm("");
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-5">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center animate-in fade-in-0 zoom-in-95">
        <span className="mx-auto w-14 h-14 rounded-2xl bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-400 flex items-center justify-center">
          {hasPin ? <Lock className="w-6 h-6" /> : <BookHeart className="w-6 h-6" />}
        </span>
        <h1 className="mt-4 font-hud uppercase tracking-wide text-2xl">{hasPin ? "Diary locked" : "Protect your diary"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasPin ? "Enter your PIN. It stays open for 15 minutes." : "Choose a 4–8 digit PIN. Your entries are encrypted and only open with it — even on a shared or stolen session."}
        </p>
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="mt-5 space-y-2">
          <input autoFocus inputMode="numeric" type="password" autoComplete={hasPin ? "current-password" : "new-password"} value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="PIN"
            className="w-full h-12 rounded-xl border border-border bg-transparent text-center text-2xl tracking-[0.5em] font-hud" />
          {!hasPin && (
            <input inputMode="numeric" type="password" autoComplete="new-password" value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="Repeat PIN"
              className="w-full h-12 rounded-xl border border-border bg-transparent text-center text-2xl tracking-[0.5em] font-hud" />
          )}
          <button disabled={pending || pin.length < 4 || (!hasPin && confirm.length < 4)}
            className="w-full h-11 rounded-xl bg-foreground text-background font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50">
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} {hasPin ? "Unlock" : "Set PIN & open"}
          </button>
        </form>
        <p className="mt-4 text-[11px] text-muted-foreground">5 wrong tries pause unlocking for 5 minutes. Forgot it? Ask the admin to reset it — your entries stay encrypted either way.</p>
      </div>
    </div>
  );
}
