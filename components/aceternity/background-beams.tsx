"use client";
import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const PATHS = [
  "M-380 -189C-380 -189 -312 216 152 343C616 470 684 875 684 875",
  "M-373 -197C-373 -197 -305 208 159 335C623 462 691 867 691 867",
  "M-360 -210C-360 -210 -292 195 172 322C636 449 704 854 704 854",
  "M-347 -223C-347 -223 -279 182 185 309C649 436 717 841 717 841",
  "M-334 -236C-334 -236 -266 169 198 296C662 423 730 828 730 828",
  "M-310 -262C-310 -262 -242 143 224 270C688 397 756 802 756 802",
  "M-286 -288C-286 -288 -218 117 250 244C714 371 782 776 782 776",
  "M-250 -324C-250 -324 -182 81 286 208C750 335 818 740 818 740",
  "M-200 -374C-200 -374 -132 31 336 158C800 285 868 690 868 690",
  "M-150 -424C-150 -424 -82 -19 386 108C850 235 918 640 918 640",
];

export function BackgroundBeams({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <svg
        className="absolute h-full w-full"
        width="100%" height="100%"
        viewBox="0 0 696 316" fill="none" preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        {PATHS.map((path, i) => (
          <motion.path
            key={i} d={path}
            stroke={`url(#beam-grad-${i})`}
            strokeOpacity="0.5" strokeWidth="0.5"
          />
        ))}
        <defs>
          {PATHS.map((_, i) => (
            <motion.linearGradient
              id={`beam-grad-${i}`}
              key={`g-${i}`}
              x1="0%" x2="100%" y1="0%" y2="100%"
              animate={{ x1: ["0%","100%"], x2: ["0%","95%"], y1: ["0%","100%"], y2: ["0%","93%"] }}
              transition={{ duration: 8 + i * 0.4, ease: "easeInOut", repeat: Infinity, delay: i * 0.3 }}
            >
              <stop stopColor="#18CCFC" stopOpacity="0" />
              <stop stopColor="#18CCFC" offset="30%" />
              <stop stopColor="#6344F5" offset="60%" />
              <stop stopColor="#AE48FF" stopOpacity="0" offset="100%" />
            </motion.linearGradient>
          ))}
        </defs>
      </svg>
    </div>
  );
}
