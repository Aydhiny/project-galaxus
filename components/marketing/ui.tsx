"use client";

// Shared building blocks for the landing page, so every section speaks the
// same visual language: numbered section heads with an italic accent word,
// orange-gradient primary buttons, mono tags, and 3D tilt cards.

import Image from "next/image";
import Link from "next/link";
import { useRef, type ReactNode } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay, ease: EASE }} className={className}>
      {children}
    </motion.div>
  );
}

/** "02 — Money on <em>autopilot</em>" style heading. */
export function SectionHead({ n, eyebrow, title, accent, after, desc, center }: {
  n?: string; eyebrow: string; title: string; accent: string; after?: string; desc?: string; center?: boolean;
}) {
  return (
    <Reveal className={cn("max-w-3xl", center && "mx-auto text-center")}>
      <p className={cn("flex items-center gap-3 text-xs font-mono uppercase tracking-[0.2em] text-white/45", center && "justify-center")}>
        {n && <span className="text-white/80 font-semibold">{n}</span>}
        {n && <span className="h-px w-8 bg-white/20" />}
        {eyebrow}
      </p>
      <h2 className="mt-4 mk-display text-3xl sm:text-5xl font-semibold leading-[1.05] text-white">
        {title} <span className="mk-serif mk-accent text-[1.12em]">{accent}</span>{after ? ` ${after}` : ""}
      </h2>
      {desc && <p className={cn("mt-5 text-white/60 text-base sm:text-lg leading-relaxed max-w-2xl", center && "mx-auto")}>{desc}</p>}
    </Reveal>
  );
}

export function PrimaryCta({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("group relative inline-flex items-center gap-2 h-12 px-6 rounded-full bg-white text-zinc-950 font-semibold hover:bg-zinc-200 transition-colors", className)}>
      {children}
      <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </Link>
  );
}

export function GhostCta({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 h-12 px-6 rounded-full border border-white/15 bg-white/[0.03] text-white/85 hover:text-white hover:bg-white/[0.07] transition-colors font-medium", className)}>
      {children}
    </Link>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="mk-tag whitespace-nowrap">{children}</span>;
}

export function GalaxusMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Image src="/icons/icon-192.png" alt="" width={28} height={28} className="rounded-[8px] ring-1 ring-white/10" />
      <span className="mk-display font-semibold text-[17px] tracking-tight text-white">Galaxus</span>
    </span>
  );
}

/** The studio behind Galaxus — links to plansio.agency. */
export function PlansioMark({ className, size = 22, label = true }: { className?: string; size?: number; label?: boolean }) {
  return (
    <a href="https://plansio.agency" target="_blank" rel="noopener" className={cn("inline-flex items-center gap-1.5 text-white/75 hover:text-white transition-colors", className)}>
      <Image src="/icons/plansio-logo.png" alt="Plansio" width={Math.round(size * 0.9)} height={size} unoptimized />
      {label && <span className="mk-serif text-[1.15em] leading-none">Plansio</span>}
    </a>
  );
}

/** A card that tilts toward the cursor in 3D (springy, reset on leave). */
export function TiltCard({ children, className, max = 10 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0), y = useMotionValue(0);
  const rx = useSpring(useTransform(y, [-0.5, 0.5], [max, -max]), { stiffness: 180, damping: 18 });
  const ry = useSpring(useTransform(x, [-0.5, 0.5], [-max, max]), { stiffness: 180, damping: 18 });
  return (
    <motion.div ref={ref} style={{ rotateX: rx, rotateY: ry, transformPerspective: 900, transformStyle: "preserve-3d" }}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return;
        const r = ref.current!.getBoundingClientRect();
        x.set((e.clientX - r.left) / r.width - 0.5); y.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onPointerLeave={() => { x.set(0); y.set(0); }}
      className={className}>
      {children}
    </motion.div>
  );
}
