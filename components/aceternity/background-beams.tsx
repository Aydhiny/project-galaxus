"use client";
import React from "react";
import { cn } from "@/lib/utils";

// CSS-only animation — no framer-motion on this component.
// The previous version used motion.linearGradient animating SVG attributes via JS
// which ran on the main thread every frame. This version uses CSS @keyframes
// which runs on the compositor thread (GPU), dramatically lighter.

const PATHS = [
  "M-380 -189C-380 -189 -312 216 152 343C616 470 684 875 684 875",
  "M-356 -215C-356 -215 -288 190 176 317C640 444 708 849 708 849",
  "M-310 -261C-310 -261 -242 144 222 271C686 398 754 803 754 803",
  "M-250 -321C-250 -321 -182 84 282 211C746 338 814 743 814 743",
  "M-180 -391C-180 -391 -112 14 352 141C816 268 884 673 884 673",
];

export function BackgroundBeams({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden opacity-40", className)}>
      <style>{`
        @keyframes beam-travel {
          0%   { stroke-dashoffset: 2000; opacity: 0; }
          5%   { opacity: 1; }
          90%  { opacity: 0.6; }
          100% { stroke-dashoffset: 0; opacity: 0; }
        }
      `}</style>
      <svg
        className="absolute h-full w-full"
        width="100%" height="100%"
        viewBox="0 0 696 316" fill="none"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="beam-g1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#173eff" stopOpacity="0" />
            <stop offset="40%" stopColor="#173eff" stopOpacity="0.9" />
            <stop offset="70%" stopColor="#4f46e5" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="beam-g2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4f46e5" stopOpacity="0" />
            <stop offset="40%" stopColor="#4f46e5" stopOpacity="0.8" />
            <stop offset="70%" stopColor="#173eff" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#173eff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {PATHS.map((path, i) => (
          <path
            key={i}
            d={path}
            stroke={`url(#beam-g${(i % 2) + 1})`}
            strokeWidth="0.6"
            strokeDasharray="2000"
            style={{
              animation: `beam-travel ${10 + i * 2}s linear ${i * 1.8}s infinite`,
            }}
          />
        ))}
      </svg>
    </div>
  );
}
