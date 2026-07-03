"use client";

import { motion } from "framer-motion";
import { BorderBeam } from "@/components/lw/border-beam";
import { Flame, CheckCircle2, TrendingUp } from "lucide-react";

const STATS = [
  { label: "Prayer streak", value: "23 days", icon: Flame, color: "#173eff" },
  { label: "Goals today", value: "5 / 6", icon: CheckCircle2, color: "#10b981" },
  { label: "This week", value: "+18%", icon: TrendingUp, color: "#f59e0b" },
];

const BARS = [62, 88, 45, 95, 70, 100, 80];

export function MarketingProductPreview() {
  return (
    <section className="relative py-8 sm:py-16 px-4 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.98 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="relative rounded-3xl overflow-hidden glass p-1.5"
        >
          <BorderBeam size={220} duration={9} colorFrom="#173eff" colorTo="#a78bfa" />
          <div className="rounded-[1.4rem] overflow-hidden bg-[#0a0e1e] p-6 sm:p-8">
            <div className="flex items-center gap-1.5 mb-6">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400/60" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/60" />
              <span className="ml-3 text-[11px] text-white/25 font-mono">galaxus.app/dashboard</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {STATS.map((s) => (
                <div key={s.label} className="rounded-2xl p-4" style={{ background: `${s.color}12`, border: `1px solid ${s.color}25` }}>
                  <s.icon className="w-4 h-4 mb-3" style={{ color: s.color }} />
                  <p className="text-lg font-bold text-white font-heading">{s.value}</p>
                  <p className="text-xs text-white/40 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
              <p className="text-xs text-white/40 mb-4">Weekly momentum</p>
              <div className="flex items-end gap-2 h-24">
                {BARS.map((h, i) => (
                  <motion.div
                    key={i}
                    initial={{ height: 0 }}
                    whileInView={{ height: `${h}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                    className="flex-1 rounded-t-md progress-bar"
                  />
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
