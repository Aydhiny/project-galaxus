"use client";

import { motion } from "framer-motion";
import { GlowingCards, GlowingCard } from "@/components/lw/glowing-cards";
import {
  Sparkles, Flame, Target, BookOpen, Dumbbell, NotebookPen, BookMarked, Music2,
} from "lucide-react";

const PILLARS = [
  { icon: Sparkles, title: "Prayers & Spiritual", desc: "Prayer times, Quran progress, duas, and gratitude — tracked daily, streaked over time.", color: "#173eff" },
  { icon: Flame, title: "Habits & Streaks", desc: "Daily check-ins with visual streaks and heatmaps that make consistency feel good.", color: "#f59e0b" },
  { icon: Target, title: "Goals", desc: "Daily and long-term goals with simple, satisfying completion tracking.", color: "#10b981" },
  { icon: BookOpen, title: "Deep Work & Study", desc: "Study sessions, course tracking, and focused-work logging in one place.", color: "#7c3aed" },
  { icon: Dumbbell, title: "Fitness & Training", desc: "Workout plans, personal records, and progress you can actually see.", color: "#ef4444" },
  { icon: NotebookPen, title: "Journaling & Mood", desc: "Gratitude journaling and mood tracking to notice patterns in how you feel.", color: "#06b6d4" },
  { icon: BookMarked, title: "Reading", desc: "A book tracker with reading sessions and a built-in reader for your library.", color: "#f472b6" },
  { icon: Music2, title: "Creative & Beats", desc: "Track creative projects, music production, and sales — your studio's logbook.", color: "#818cf8" },
];

export function MarketingPillars() {
  return (
    <section id="features" className="relative py-24 sm:py-32 px-4 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <p className="section-label mb-3">Everything, one place</p>
          <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">
            Eight pillars. One dashboard.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Pick the pillars that matter to you. Galaxus doesn&apos;t force a system on you —
            it just makes the one you already believe in easier to keep.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <GlowingCards glowOpacity={0.6} gap="1rem">
            {PILLARS.map((p) => (
              <GlowingCard
                key={p.title}
                glowColor={p.color}
                className="card-interactive flex flex-col gap-3 basis-full sm:basis-[calc(50%-0.5rem)] lg:basis-[calc(25%-0.75rem)] min-w-[14rem]"
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${p.color}18`, border: `1px solid ${p.color}30` }}
                >
                  <p.icon className="w-5 h-5" style={{ color: p.color }} />
                </div>
                <h3 className="font-heading font-semibold text-sm">{p.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{p.desc}</p>
              </GlowingCard>
            ))}
          </GlowingCards>
        </motion.div>
      </div>
    </section>
  );
}
