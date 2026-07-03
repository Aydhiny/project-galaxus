"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { HeroGalaxyThree } from "@/components/marketing/hero-galaxy-three";
import { MovingBorderBtn } from "@/components/aceternity/moving-border-btn";
import { BackgroundBeams } from "@/components/aceternity/background-beams";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const STARS = [
  { w: 1.5, h: 2.1, top: 12.3, left: 8.7, op: 0.35 }, { w: 2.2, h: 1.8, top: 45.6, left: 23.1, op: 0.25 },
  { w: 1.1, h: 1.4, top: 78.9, left: 56.4, op: 0.45 }, { w: 2.8, h: 2.3, top: 34.2, left: 71.8, op: 0.30 },
  { w: 1.6, h: 1.9, top: 91.0, left: 14.5, op: 0.40 }, { w: 2.0, h: 1.5, top: 6.7, left: 89.2, op: 0.20 },
  { w: 1.3, h: 2.7, top: 60.1, left: 38.9, op: 0.35 }, { w: 2.5, h: 1.2, top: 22.8, left: 67.3, op: 0.28 },
  { w: 1.9, h: 2.4, top: 83.5, left: 42.1, op: 0.42 }, { w: 2.1, h: 1.7, top: 15.4, left: 95.6, op: 0.33 },
  { w: 1.4, h: 2.0, top: 52.7, left: 3.8, op: 0.38 }, { w: 2.6, h: 1.3, top: 70.9, left: 78.4, op: 0.22 },
];

export function MarketingHero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 140]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <section ref={ref} className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#070b18]">
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full blur-[140px] opacity-30 bg-[#173eff]" />
        <div className="absolute bottom-0 right-1/4 w-[450px] h-[350px] rounded-full blur-[120px] opacity-15 bg-[#7c3aed]" />
      </div>
      <BackgroundBeams />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {STARS.map((s, i) => (
          <div key={i} className="absolute rounded-full bg-white/20" style={{ width: s.w + "px", height: s.h + "px", top: s.top + "%", left: s.left + "%", opacity: s.op }} />
        ))}
      </div>

      <div className="absolute inset-0 opacity-70">
        <HeroGalaxyThree />
      </div>

      <motion.div style={{ y, opacity }} className="relative z-10 max-w-3xl mx-auto px-6 text-center pt-20">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium mb-8"
          style={{ background: "rgba(23,62,255,0.12)", border: "1px solid rgba(23,62,255,0.28)", color: "#a5b4fc" }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#818cf8] animate-pulse" />
          Built by Plansio
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="font-heading text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white leading-[1.08]"
        >
          Everything you&apos;re building toward,{" "}
          <span className="bg-gradient-to-r from-[#60a5fa] via-[#818cf8] to-[#a78bfa] bg-clip-text text-transparent">
            in one universe.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 text-base sm:text-lg text-white/55 max-w-xl mx-auto leading-relaxed"
        >
          Prayers, habits, goals, deep work, and creative projects — tracked, streaked,
          and visualized in one calm, beautiful space. No spreadsheets, no fifteen apps.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3"
        >
          <Link href="/register">
            <MovingBorderBtn className="px-7 py-3 text-[15px]" duration={4}>
              Start your universe — free
              <ArrowRight className="w-4 h-4" />
            </MovingBorderBtn>
          </Link>
          <Link href="/login">
            <Button variant="ghost" size="lg" className="text-white/70 hover:text-white hover:bg-white/5">
              Sign in
            </Button>
          </Link>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.5 }}
          className="mt-6 text-xs text-white/25"
        >
          Free forever plan · No credit card required
        </motion.p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 1 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/30"
      >
        <span className="text-[10px] uppercase tracking-[0.2em]">Scroll</span>
        <div className="w-px h-8 bg-gradient-to-b from-white/40 to-transparent" />
      </motion.div>
    </section>
  );
}
