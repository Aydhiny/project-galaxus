"use client";

import { motion } from "framer-motion";
import { Check, X } from "lucide-react";

const ROWS = [
  { label: "Prayer times, Quran & duas tracking", galaxus: true, scattered: false },
  { label: "Habits, goals & streaks", galaxus: true, scattered: "one app each" },
  { label: "Deep work, study & training logs", galaxus: true, scattered: "another app" },
  { label: "Journaling & mood tracking", galaxus: true, scattered: "a notebook, maybe" },
  { label: "Reading tracker with built-in reader", galaxus: true, scattered: false },
  { label: "Creative & music production log", galaxus: true, scattered: false },
  { label: "One login, one place to check in", galaxus: true, scattered: false },
  { label: "Installable, works offline", galaxus: true, scattered: "depends" },
];

export function MarketingComparison() {
  return (
    <section className="relative py-24 sm:py-32 px-4 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-center max-w-xl mx-auto mb-14"
        >
          <p className="section-label mb-3">Why Galaxus</p>
          <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">
            One universe, not five scattered apps
          </h2>
          <p className="mt-4 text-muted-foreground">
            You could stitch this together yourself. Most people don&apos;t, because switching between five apps
            and a notebook is its own kind of friction.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="glass rounded-2xl overflow-hidden"
        >
          <div className="flex items-center px-5 sm:px-6 py-3 border-b border-border text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="flex-1">Feature</span>
            <span className="w-20 sm:w-32 text-center text-primary shrink-0">Galaxus</span>
            <span className="w-20 sm:w-32 text-center shrink-0">Scattered apps</span>
          </div>
          {ROWS.map((row, i) => (
            <div
              key={row.label}
              className={`flex items-center px-5 sm:px-6 py-3.5 text-sm ${i !== ROWS.length - 1 ? "border-b border-border/60" : ""}`}
            >
              <span className="flex-1 text-foreground/85 pr-3">{row.label}</span>
              <span className="w-20 sm:w-32 shrink-0 flex justify-center">
                <Check className="w-4 h-4 text-emerald" />
              </span>
              <span className="w-20 sm:w-32 shrink-0 flex justify-center text-xs text-muted-foreground text-center px-1">
                {row.scattered === false ? <X className="w-4 h-4 text-muted-foreground/50" /> : row.scattered}
              </span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
