"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Share, X } from "lucide-react";
import { useInstall } from "@/lib/hooks/use-install";
import { useStoredValue } from "@/lib/hooks/client-values";

const KEY = "galaxus-install-hint-dismissed";

/**
 * One-time nudge for iPhone Safari users (iOS has no install prompt of its
 * own, so people never discover "Add to Home Screen"). Hidden once installed
 * or dismissed.
 */
export function InstallHint() {
  const { platform, installed } = useInstall();
  const dismissedStored = useStoredValue(KEY);
  const [dismissed, setDismissed] = useState(false);

  if (platform !== "ios-safari" || installed || dismissed || dismissedStored) return null;

  function close() {
    setDismissed(true);
    try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
  }

  return (
    <div className="fixed inset-x-3 z-[60] bottom-[calc(0.75rem+env(safe-area-inset-bottom))] md:hidden">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-popover p-3 shadow-lg">
        <Image src="/icons/apple-touch-icon.png" alt="" width={40} height={40} className="rounded-[10px] ring-1 ring-border" />
        <div className="flex-1 min-w-0 text-sm">
          <p className="font-medium">Install Galaxus</p>
          <p className="text-muted-foreground text-xs leading-snug">
            Tap <Share className="inline w-3.5 h-3.5 -mt-0.5" /> then <b>Add to Home Screen</b>.{" "}
            <Link href="/install" className="underline underline-offset-2" onClick={close}>How?</Link>
          </p>
        </div>
        <button onClick={close} aria-label="Dismiss" className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
