"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BorderBeam } from "@/components/lw/border-beam";

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Everything you need to start building the habit.",
    features: [
      "Daily check-ins & prayer tracking",
      "Goals & habit streaks",
      "Journal & mood tracking",
      "Reading & study tracker",
      "30-day history",
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
    <section id="pricing" className="relative py-24 sm:py-32 px-4 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-center max-w-xl mx-auto mb-14"
        >
          <p className="section-label mb-3">Pricing</p>
          <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">Simple, honest pricing</h2>
          <p className="mt-4 text-muted-foreground">Start free. Upgrade only if you want more.</p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {PLANS.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
              className={`relative rounded-2xl p-7 ${plan.highlighted ? "glass" : "border border-border bg-card"}`}
            >
              {plan.highlighted && <BorderBeam size={140} duration={7} colorFrom="#173eff" colorTo="#a78bfa" />}
              {plan.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-wider px-3 py-1 rounded-full bg-gradient-to-r from-[#173eff] to-[#4f46e5] text-white">
                  Most popular
                </span>
              )}
              <h3 className="font-heading text-lg font-semibold">{plan.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
              <div className="mt-5 flex items-baseline gap-1.5">
                <span className="text-4xl font-bold font-heading">{plan.price}</span>
                <span className="text-sm text-muted-foreground">{plan.period}</span>
              </div>
              <ul className="mt-6 flex flex-col gap-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check className="w-4 h-4 mt-0.5 shrink-0 text-emerald" />
                    <span className="text-foreground/85">{f}</span>
                  </li>
                ))}
              </ul>
              <Link href="/register" className="block mt-7">
                <Button variant={plan.highlighted ? "default" : "outline"} className="w-full justify-center" size="lg">
                  {plan.cta}
                </Button>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
