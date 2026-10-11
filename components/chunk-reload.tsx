"use client";

// After a deploy, a tab still running the previous build asks for JS chunks
// that no longer exist ("Failed to load chunk …"). The fix is simply loading
// the new build — once, so a genuinely broken chunk can't cause a reload loop.

import { useEffect } from "react";

const KEY = "galaxus:chunk-reload-at";

export const isChunkError = (e: unknown) =>
  /ChunkLoadError|Failed to load chunk|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module/i.test(
    e instanceof Error ? `${e.name} ${e.message}` : String(e ?? "")
  );

export function reloadForNewBuild(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 60_000) return false; // already tried in the last minute
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* storage blocked — still reload once */
  }
  window.location.reload();
  return true;
}

export function ChunkReload() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => { if (isChunkError(e.error ?? e.message)) reloadForNewBuild(); };
    const onRejection = (e: PromiseRejectionEvent) => { if (isChunkError(e.reason)) reloadForNewBuild(); };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
