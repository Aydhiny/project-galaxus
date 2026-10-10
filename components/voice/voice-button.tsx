"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Mic } from "lucide-react";
import { VoicePanel } from "./voice-panel";
import { VOICE_OPEN_EVENT } from "@/lib/voice-events";

/** Voice overlay (Alt+V or the top-bar mic); a floating mic on phones. */
export function VoiceButton() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === "v") { e.preventDefault(); setOpen(true); }
      if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(VOICE_OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(VOICE_OPEN_EVENT, onOpen);
    };
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
          className="md:hidden fixed bottom-[calc(8rem+env(safe-area-inset-bottom))] right-4 z-[90] w-10 h-10 rounded-full bg-foreground text-background shadow-lg flex items-center justify-center transition-transform hover:scale-110"
        >
          <Mic className="w-4 h-4" />
        </button>
      )}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[120] bg-background flex items-start sm:items-center justify-center overflow-y-auto p-4"
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
