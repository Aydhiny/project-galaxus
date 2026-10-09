"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

export type Platform = "ios-safari" | "ios-other" | "android" | "desktop";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const noop = () => () => {};

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as Mac — touch points give it away.
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  if (isIOS) {
    // Chrome/Firefox/Edge on iOS add CriOS/FxiOS/EdgiOS. Since iOS 16.4 they can
    // also "Add to Home Screen" from their share menu, but Safari is the most
    // reliable, so we steer people there.
    return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? "ios-other" : "ios-safari";
  }
  return /Android/.test(ua) ? "android" : "desktop";
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Platform + install state. Server snapshot is neutral ("desktop", not installed). */
export function useInstall() {
  const platform = useSyncExternalStore<Platform>(noop, detectPlatform, () => "desktop");
  const installed = useSyncExternalStore(noop, isStandalone, () => false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  // Chromium (Android / desktop) offers a real install prompt; iOS never does.
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BeforeInstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function promptInstall(): Promise<boolean> {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    return outcome === "accepted";
  }

  return { platform, installed, canPrompt: deferred !== null, promptInstall };
}
