"use client";

import { BackgroundBeams } from "@/components/aceternity/background-beams";
import { GradientText } from "@/components/aceternity/gradient-text";

const STARS = [
  { w: 1.5, h: 2.1, top: 12.3, left: 8.7,  op: 0.35 }, { w: 2.2, h: 1.8, top: 45.6, left: 23.1, op: 0.25 },
  { w: 1.1, h: 1.4, top: 78.9, left: 56.4, op: 0.45 }, { w: 2.8, h: 2.3, top: 34.2, left: 71.8, op: 0.30 },
  { w: 1.6, h: 1.9, top: 91.0, left: 14.5, op: 0.40 }, { w: 2.0, h: 1.5, top: 6.7,  left: 89.2, op: 0.20 },
  { w: 1.3, h: 2.7, top: 60.1, left: 38.9, op: 0.35 }, { w: 2.5, h: 1.2, top: 22.8, left: 67.3, op: 0.28 },
  { w: 1.9, h: 2.4, top: 83.5, left: 42.1, op: 0.42 }, { w: 2.1, h: 1.7, top: 15.4, left: 95.6, op: 0.33 },
  { w: 1.4, h: 2.0, top: 52.7, left: 3.8,  op: 0.38 }, { w: 2.6, h: 1.3, top: 70.9, left: 78.4, op: 0.22 },
];

/** Shared cosmic background shell for auth-adjacent pages (login/register/forgot/reset/verify). */
export function AuthShell({
  title, subtitle, children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#070b18] relative overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full blur-[120px] opacity-25 bg-[#173eff]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[300px] rounded-full blur-[100px] opacity-15 bg-[#7c3aed]" />
        <div className="absolute top-1/3 left-0 w-[300px] h-[300px] rounded-full blur-[80px] opacity-10 bg-[#06b6d4]" />
      </div>
      <BackgroundBeams />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {STARS.map((s, i) => (
          <div key={i} className="absolute rounded-full bg-white/15"
            style={{ width: s.w + "px", height: s.h + "px", top: s.top + "%", left: s.left + "%", opacity: s.op }} />
        ))}
      </div>

      <div className="relative z-10 w-full max-w-sm mx-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: "linear-gradient(135deg,rgba(23,62,255,0.2),rgba(124,58,237,0.2))", border: "1px solid rgba(23,62,255,0.3)", boxShadow: "0 0 40px rgba(23,62,255,0.25)" }}>
            <span className="text-2xl" style={{ filter: "drop-shadow(0 0 8px rgba(23,62,255,0.8))" }}>✦</span>
          </div>
          <GradientText as="h1" from="#60a5fa" via="#818cf8" to="#a78bfa" className="text-3xl font-bold tracking-tight">
            Galaxus
          </GradientText>
          <p className="text-white/40 text-sm mt-1">{subtitle}</p>
        </div>

        <div className="rounded-2xl border border-white/[0.08] p-8"
          style={{ background: "rgba(10,14,28,0.85)", backdropFilter: "blur(32px) saturate(180%)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08),0 32px 80px rgba(0,0,0,0.60)" }}>
          {title && <h2 className="sr-only">{title}</h2>}
          {children}
        </div>
      </div>
    </div>
  );
}
