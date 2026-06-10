"use client";

import { useAmbientStore } from "@/lib/store/ambient";
import { useEffect, useState } from "react";

/*
  CSS tint layer — z=40.
  Provides overall colour atmosphere (blue-grey for rain, warm amber for fire).
  Particle effects (fire flames, rain streaks) are handled by AmbientThree at z=41.
*/

export function AmbientOverlay() {
  const { rainVol, fireVol } = useAmbientStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const rainOpacity = rainVol / 100;
  const fireOpacity = fireVol / 100;

  return (
    <div className="fixed inset-0 pointer-events-none z-40 overflow-hidden">

      {/* ── Rain colour tint ── */}
      {rainVol > 0 && (
        <>
          <div className="absolute inset-0 transition-opacity duration-1000" style={{
            background: "linear-gradient(175deg, oklch(0.22 0.07 225 / 0%) 0%, oklch(0.18 0.09 220 / 14%) 100%)",
            opacity: rainOpacity,
          }} />
          {/* Puddle shimmer at bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-24" style={{
            background: "linear-gradient(0deg, oklch(0.38 0.09 220 / 12%) 0%, transparent 100%)",
            opacity: rainOpacity,
          }} />
        </>
      )}

      {/* ── Fire warmth tint ── */}
      {fireVol > 0 && (
        <>
          {/* Deep ember base glow */}
          <div className="absolute bottom-0 left-0 right-0 h-64" style={{
            background: "radial-gradient(ellipse 95% 100% at 50% 115%, oklch(0.50 0.25 30 / 38%) 0%, oklch(0.42 0.20 42 / 16%) 40%, transparent 70%)",
            opacity: fireOpacity,
            animation: "fire-breathe 3.4s ease-in-out infinite",
          }} />
          {/* Warm screen tint */}
          <div className="absolute inset-0" style={{
            background: "radial-gradient(ellipse 130% 55% at 50% 115%, oklch(0.36 0.11 36 / 9%) 0%, transparent 65%)",
            opacity: fireOpacity,
          }} />
        </>
      )}

      <style>{`
        @keyframes fire-breathe {
          0%,100% { transform: scaleX(1)    scaleY(1);    }
          38%     { transform: scaleX(1.07) scaleY(1.12); }
          68%     { transform: scaleX(0.95) scaleY(1.05); }
        }
      `}</style>
    </div>
  );
}
