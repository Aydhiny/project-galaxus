"use client";

import type { ComponentType } from "react";
import { BedDouble, Castle, CloudSun, HardHat, KeyRound, Lock, Moon, Radar, Shield, Sparkles, Trophy, Users } from "lucide-react";
import { BrandIcon, type Brand } from "@/components/brand-icon";
import { Reveal, SectionHead, Tag, TiltCard } from "@/components/marketing/ui";

type Tile = { brand?: Brand; icon?: ComponentType<{ className?: string }>; label: string; tint?: string };
type Feature = { title: string; accent: string; desc: string; tags: string[]; tiles: Tile[]; glow: string };

const FEATURES: Feature[] = [
  {
    title: "A living 3D", accent: "empire.",
    desc: "Every system you run becomes a building. Workers appear while automations work, the weather follows your week, goals rise as construction sites and anything you neglect slowly falls into ruins.",
    tags: ["three.js", "Live data", "Day & night", "Weather", "Streak lights"],
    tiles: [{ icon: Castle, label: "HQ", tint: "#38bdf8" }, { icon: CloudSun, label: "Weather", tint: "#fbbf24" }, { icon: HardHat, label: "Goals", tint: "#f59e0b" }, { icon: Trophy, label: "Contest", tint: "#a78bfa" }],
    glow: "#38bdf8",
  },
  {
    title: "Money on", accent: "autopilot.",
    desc: "A gig radar that learns from your reviews, an email autopilot that starts in shadow mode, local-business outreach with drafted messages you send yourself, a deal desk, and a watcher for hackathons, game jams and EU and BiH grants that files the deadlines as tasks.",
    tags: ["Gig radar", "Email autopilot", "Outreach", "Deal desk", "Opportunities"],
    tiles: [{ brand: "reddit", label: "Reddit" }, { brand: "gmail", label: "Gmail" }, { brand: "whatsapp", label: "WhatsApp" }, { brand: "stripe", label: "Stripe" }],
    glow: "#ff6b4a",
  },
  {
    title: "Faith &", accent: "discipline.",
    desc: "Prayer times from vaktija.ba with the azan in your city, a Hold-the-line screen with your own family album for hard moments, and a Sleep Guardian that dims everything at bedtime.",
    tags: ["Vaktija", "Azan", "Hold the line", "Sleep Guardian", "Streaks → XP"],
    tiles: [{ icon: Moon, label: "Prayers", tint: "#34d399" }, { icon: Shield, label: "Hold", tint: "#fb7185" }, { icon: BedDouble, label: "Sleep", tint: "#818cf8" }, { icon: Sparkles, label: "XP", tint: "#fbbf24" }],
    glow: "#34d399",
  },
  {
    title: "Your own", accent: "Claude.",
    desc: "Connect your own Claude subscription runner or Anthropic API key, and nobody else's. It writes your morning brief, devlogs, YouTube comment replies and runs voice commands, on your account only.",
    tags: ["Bring your own key", "Daily brief", "Voice", "Devlogs", "Isolated per user"],
    tiles: [{ brand: "claude", label: "Claude" }, { brand: "github", label: "GitHub" }, { brand: "googlecalendar", label: "Calendar" }, { icon: KeyRound, label: "Your key", tint: "#d97757" }],
    glow: "#d97757",
  },
  {
    title: "Craft &", accent: "create.",
    desc: "Your game studio tracks real commits and turns playtest feedback into tasks, YouTube stats feed the studio building, beats live in a catalog, and Spotify sets the city's mood.",
    tags: ["Game dev", "YouTube", "Beat catalog", "Spotify moods"],
    tiles: [{ brand: "unity", label: "Unity" }, { brand: "youtube", label: "YouTube" }, { brand: "spotify", label: "Spotify" }, { brand: "discord", label: "Discord" }],
    glow: "#8b5cf6",
  },
  {
    title: "Private by", accent: "design.",
    desc: "Every account is fully isolated. Your diary is encrypted and opens only with your PIN. Sharing your city is opt-in, and visitors only ever see levels and numbers.",
    tags: ["Encrypted diary", "PIN lock", "Opt-in sharing", "No ads"],
    tiles: [{ icon: Lock, label: "Diary", tint: "#e879f9" }, { icon: KeyRound, label: "PIN", tint: "#a78bfa" }, { icon: Users, label: "Opt-in", tint: "#60a5fa" }, { icon: Radar, label: "Yours", tint: "#34d399" }],
    glow: "#e879f9",
  },
];

export function MarketingFeatures() {
  return (
    <section id="features" className="relative py-24 sm:py-32 px-5 sm:px-6 scroll-mt-20">
      <div className="mx-auto max-w-6xl">
        <SectionHead n="01" eyebrow="What it does" title="One studio for your" accent="whole life." desc="Six systems that used to be six apps, a notebook and a spreadsheet, now working together and feeding one city." />

        <ol className="mt-16 divide-y divide-white/[0.08] border-y border-white/[0.08]">
          {FEATURES.map((f, i) => (
            <li key={f.accent} className="group py-10 sm:py-14 grid gap-8 lg:grid-cols-[5rem_1fr_20rem] lg:items-center">
              <Reveal><span className="mk-display text-3xl sm:text-4xl font-semibold text-white/25 group-hover:text-white/60 transition-colors tabular-nums">{String(i + 1).padStart(2, "0")}</span></Reveal>
              <Reveal delay={0.05}>
                <h3 className="mk-display text-2xl sm:text-4xl font-semibold text-white leading-tight">
                  {f.title} <span className="mk-serif mk-accent text-[1.12em]">{f.accent}</span>
                </h3>
                <p className="mt-4 text-white/60 leading-relaxed max-w-2xl">{f.desc}</p>
                <div className="mt-5 flex flex-wrap gap-2">{f.tags.map((t) => <Tag key={t}>{t}</Tag>)}</div>
              </Reveal>
              <Reveal delay={0.1}>
                <TiltCard className="relative rounded-3xl mk-card p-4 aspect-[4/3] w-full max-w-[22rem] lg:max-w-none overflow-hidden">
                  <div className="relative grid grid-cols-2 gap-3 h-full" style={{ transformStyle: "preserve-3d" }}>
                    {f.tiles.map((t, k) => (
                      <div key={t.label} className="rounded-2xl border border-white/[0.08] bg-zinc-900/90 flex flex-col items-center justify-center gap-2 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.8)]"
                        style={{ transform: `translateZ(${30 + k * 12}px)` }}>
                        <span className="w-11 h-11 rounded-xl bg-white/[0.06] flex items-center justify-center">
                          {t.brand ? <BrandIcon name={t.brand} mono className="w-6 h-6 text-white/85" /> : t.icon && <t.icon className="w-6 h-6 text-white/85" />}
                        </span>
                        <span className="text-[11px] text-white/60">{t.label}</span>
                      </div>
                    ))}
                  </div>
                </TiltCard>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
