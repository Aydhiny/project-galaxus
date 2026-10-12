"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { SectionHead } from "@/components/marketing/ui";

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Everything you need to start building the habit.",
    features: [
      "Your 3D empire, live",
      "Tasks, goals & routines",
      "Prayer times & azan",
      "Private, encrypted diary",
      "Bring your own Claude",
    ],
    cta: "Start for free",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$6",
    period: "/ month",
    description: "For people who want the full picture, forever.",
    features: [
      "Everything in Free",
      "Unlimited history & insights",
      "Advanced analytics & trends",
      "Custom room themes",
      "Priority support",
    ],
    cta: "Start Pro trial",
    highlighted: true,
  },
];

export function MarketingPricing() {
  return (
    <section id="pricing" className="relative py-24 sm:py-32 px-5 sm:px-6 scroll-mt-20">
      <div className="mx-auto max-w-5xl">
        <SectionHead n="03" eyebrow="Pricing" title="Simple," accent="honest" after="pricing." desc="Start free. Upgrade only if you want more." center />

        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-6">
          {PLANS.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="relative rounded-3xl"
            >
              <div className={`relative h-full rounded-3xl p-7 sm:p-8 border ${plan.highlighted ? "bg-white/[0.05] border-white/20" : "bg-white/[0.02] border-white/[0.08]"}`}>
                {plan.highlighted && (
                  <span className="absolute -top-3 left-8 text-[10px] font-semibold uppercase tracking-wider px-3 py-1 rounded-full bg-white text-zinc-950">Most popular</span>
                )}
                <h3 className="mk-display text-xl font-semibold text-white">{plan.name}</h3>
                <p className="text-sm text-white/55 mt-1">{plan.description}</p>
                <div className="mt-6 flex items-baseline gap-1.5">
                  <span className="mk-display text-5xl font-semibold text-white">{plan.price}</span>
                  <span className="text-sm text-white/50">{plan.period}</span>
                </div>
                <ul className="mt-7 flex flex-col gap-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check className="w-4 h-4 mt-0.5 shrink-0 text-white/70" strokeWidth={2.5} />
                      <span className="text-white/80">{f}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/register"
                  className={`mt-8 h-12 w-full rounded-full inline-flex items-center justify-center font-semibold transition-all ${plan.highlighted ? "bg-white text-zinc-950 hover:bg-zinc-200" : "border border-white/15 text-white/85 hover:bg-white/[0.06]"}`}>
                  {plan.cta}
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
