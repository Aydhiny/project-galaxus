"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Mic } from "lucide-react";
import { VoicePanel } from "./voice-panel";

/** Floating mic on every page (Alt+V) → full-screen voice overlay. */
export function VoiceButton() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === "v") { e.preventDefault(); setOpen(true); }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The /voice page has the panel inline already.
  if (pathname === "/voice") return null;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Talk to Claude (Alt+V)"
          aria-label="Talk to Claude"
          className="fixed bottom-[calc(8rem+env(safe-area-inset-bottom))] right-4 z-[90] w-10 h-10 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center transition-transform hover:scale-110"
        >
          <Mic className="w-4 h-4" />
        </button>
      )}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[120] bg-background/80 backdrop-blur-xl flex items-start sm:items-center justify-center overflow-y-auto p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
            role="dialog"
            aria-modal="true"
            aria-label="Voice command"
          >
            <motion.div
              className="w-full max-w-2xl"
              initial={{ y: 24, scale: 0.98 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 24, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <VoicePanel onClose={() => setOpen(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
