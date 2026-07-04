"use client";

import { motion } from "framer-motion";
import { ShieldCheck, Bell, KeyRound, Layers } from "lucide-react";

const ITEMS = [
  {
    icon: ShieldCheck,
    title: "Private by design",
    desc: "Every account's data is fully isolated — habits, goals, and journal entries are yours alone.",
  },
  {
    icon: Bell,
    title: "Prayer & check-in reminders",
    desc: "Local notifications for prayer times and a nudge if you haven't logged your day yet.",
  },
  {
    icon: KeyRound,
    title: "Account recovery",
    desc: "Password reset and email verification, so you're never locked out.",
  },
  {
    icon: Layers,
    title: "Free & Pro plans",
    desc: "Start free with 30 days of history — upgrade later for unlimited history and deeper insights.",
  },
];

export function MarketingChangelog() {
  return (
    <section className="relative py-24 sm:py-32 px-4 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-center max-w-xl mx-auto mb-14"
        >
          <p className="section-label mb-3">Recently shipped</p>
          <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">Built to be trusted</h2>
          <p className="mt-4 text-muted-foreground">
            Galaxus is actively developed by Plansio. Here&apos;s what&apos;s already in place.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ITEMS.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-start gap-3.5 rounded-2xl border border-border bg-card p-5"
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-primary/10 border border-primary/25">
                <item.icon className="w-4.5 h-4.5 text-primary" />
              </div>
              <div>
                <h3 className="font-heading font-semibold text-sm">{item.title}</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
