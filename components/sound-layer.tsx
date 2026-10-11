"use client";

// App-wide sounds without touching every button: one delegated click
// listener (buttons, links, tabs, toggles), and a watcher on the toast area
// so success / error / info toasts get their own sound.

import { useEffect } from "react";
import { play } from "@/lib/sfx";

export function SoundLayer() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("button, a, [role=button], [role=tab], [role=switch], input[type=checkbox], input[type=radio], summary, select");
      if (!el || el.closest("[data-no-sfx]") || (el as HTMLButtonElement).disabled) return;
      if (el.matches("input[type=checkbox], input[type=radio], [role=switch]")) play("toggle");
      else if (el.getAttribute("aria-expanded") === "false" || el.matches("summary")) play("open");
      else play("tick");
    };
    document.addEventListener("click", onClick, { capture: true });

    // Sonner renders each toast as [data-sonner-toast] with data-type="success|error|info|…".
    const seen = new WeakSet<Element>();
    const obs = new MutationObserver((muts) => {
      for (const m of muts) for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        const toast = node.matches("[data-sonner-toast]") ? node : node.querySelector?.("[data-sonner-toast]");
        if (!toast || seen.has(toast)) continue;
        seen.add(toast);
        const type = toast.getAttribute("data-type");
        play(type === "success" ? "success" : type === "error" ? "error" : "notify");
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => { document.removeEventListener("click", onClick, { capture: true }); obs.disconnect(); };
  }, []);
  return null;
}
