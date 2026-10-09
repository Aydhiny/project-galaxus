"use client";

import { useSyncExternalStore } from "react";
import { format } from "date-fns";

// useSyncExternalStore lets a component read a browser-only value with a
// different server snapshot — no "setState in an effect after mount" double
// render, and no hydration mismatch.
const noopSubscribe = () => () => {};

/** false during SSR/hydration, true once running in the browser. */
export function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** The viewer's LOCAL date as yyyy-MM-dd (server falls back to its own value). */
export function useLocalToday(serverToday: string): string {
  return useSyncExternalStore(noopSubscribe, () => format(new Date(), "yyyy-MM-dd"), () => serverToday);
}

function subscribeStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

/** A localStorage string (null on the server or if storage is blocked). */
export function useStoredValue(key: string): string | null {
  return useSyncExternalStore(
    subscribeStorage,
    () => { try { return localStorage.getItem(key); } catch { return null; } },
    () => null
  );
}
