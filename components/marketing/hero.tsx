"use client";

import { useRef } from "react";
import { motion, useMotionValue, useScroll, useSpring, useTransform } from "framer-motion";
import { Clock3, Sparkles } from "lucide-react";
import { BrandIcon, type Brand } from "@/components/brand-icon";
import { EmpireCanvas } from "@/components/marketing/empire-showcase";
import { GhostCta, PrimaryCta } from "@/components/marketing/ui";

const EASE = [0.16, 1, 0.3, 1] as const;

// What the city looks like it's doing — each card is a real feature with the real service behind it.
const CHIPS: { brand?: Brand; icon?: typeof Clock3; title: string; sub: string; pos: string; z: number; delay: number }[] = [
  { brand: "stripe", title: "+450 KM", sub: "Retainer paid → vault", pos: "left-3 lg:left-[-6%] top-[14%]", z: 70, delay: 0 },
  { brand: "reddit", title: "Hot gig found", sub: "20 shorts · one-time", pos: "right-3 lg:right-[-5%] top-[24%]", z: 90, delay: 1.2 },
  { brand: "claude", title: "Brief ready", sub: "Your Claude, your key", pos: "right-3 lg:right-[-7%] bottom-[10%]", z: 60, delay: 2.1 },
  { icon: Clock3, title: "Ikindija 15:21", sub: "Azan at the mosque", pos: "left-3 lg:left-[-4%] bottom-[8%]", z: 80, delay: 0.6 },
];

export function MarketingHero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const lift = useTransform(scrollYProgress, [0, 1], [0, -80]);

  // The 3D scene leans toward the cursor.
  const mx = useMotionValue(0), my = useMotionValue(0);
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-16, -4]), { stiffness: 90, damping: 20 });
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [10, 2]), { stiffness: 90, damping: 20 });

  return (
    <section ref={ref} id="empire"
      onPointerMove={(e) => { if (e.pointerType !== "mouse") return; mx.set(e.clientX / window.innerWidth - 0.5); my.set(e.clientY / window.innerHeight - 0.5); }}
      className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 mk-grid" aria-hidden />

      <div className="relative mx-auto max-w-6xl px-5 sm:px-6 pt-32 sm:pt-36 pb-16 lg:pb-24 grid lg:grid-cols-[1.02fr_1fr] gap-12 lg:gap-8 items-center">
        <motion.div style={{ y: lift }}>
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}
            className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white/55">
            <Sparkles className="w-3.5 h-3.5 text-white/60" /> Personal OS · 3D empire · AI automations
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.08, ease: EASE }}
            className="mt-5 mk-display text-[2.6rem] leading-[1.02] sm:text-6xl lg:text-[4.4rem] font-semibold text-white">
            Run your life like an <span className="mk-serif mk-accent text-[1.15em] whitespace-nowrap">empire.</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.18, ease: EASE }}
            className="mt-6 text-lg text-white/60 max-w-xl leading-relaxed">
            Tasks, prayers, money, gigs and your craft become a living 3D city. Automations scout work, send the emails
            and file the deadlines while you build. Every building grows with the real you.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.28, ease: EASE }}
            className="mt-9 flex flex-wrap items-center gap-3">
            <PrimaryCta href="/register">Build your empire, free</PrimaryCta>
            <GhostCta href="#features">See what it does</GhostCta>
          </motion.div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.5 }}
            className="mt-10 flex items-center gap-4">
            <span className="text-xs text-white/40">Plugs into</span>
            <div className="flex items-center gap-2.5">
              {(["claude", "gmail", "googlecalendar", "github", "stripe", "youtube", "spotify"] as Brand[]).map((b) => (
                <span key={b} className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center text-white/70" title={b}>
                  <BrandIcon name={b} mono className="w-4 h-4" />
                </span>
              ))}
            </div>
          </motion.div>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.94, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 1, delay: 0.2, ease: EASE }}
          className="relative" style={{ perspective: 1400 }}>
          <motion.div style={{ rotateY: ry, rotateX: rx, transformStyle: "preserve-3d" }} className="relative">
            <div className="relative rounded-[28px] border border-white/10 bg-zinc-900 p-1.5 shadow-[0_40px_100px_-40px_rgba(0,0,0,0.9)]">
              <EmpireCanvas className="rounded-[22px] aspect-[4/5] sm:aspect-[5/4] lg:aspect-[4/4.4]" />
            </div>
            {CHIPS.map((c) => (
              <div key={c.title} className={`absolute ${c.pos} hidden sm:block pointer-events-none`} style={{ transform: `translateZ(${c.z}px)` }}>
                <div className="mk-float rounded-2xl border border-white/10 bg-zinc-950/85 backdrop-blur-xl px-3.5 py-2.5 shadow-2xl flex items-center gap-3"
                  style={{ animationDelay: `${c.delay}s`, ["--z" as string]: `${c.z}px` }}>
                  <span className="w-9 h-9 rounded-xl bg-white/[0.07] flex items-center justify-center">
                    {c.brand ? <BrandIcon name={c.brand} className="w-[18px] h-[18px]" /> : c.icon && <c.icon className="w-[18px] h-[18px] text-emerald-300" />}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-white leading-tight">{c.title}</span>
                    <span className="block text-[11px] text-white/55">{c.sub}</span>
                  </span>
                </div>
              </div>
            ))}
          </motion.div>
          <p className="mt-4 text-center text-xs text-white/40">Live demo city. Drag to explore, tap the airships.</p>
        </motion.div>
      </div>
    </section>
  );
}
