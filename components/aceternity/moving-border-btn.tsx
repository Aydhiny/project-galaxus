"use client";
import { motion } from "framer-motion";
import React from "react";
import { cn } from "@/lib/utils";

interface MovingBorderBtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  duration?: number;
  containerClassName?: string;
  innerClassName?: string;
}

export function MovingBorderBtn({
  children, className, containerClassName, innerClassName,
  duration = 5, ...props
}: MovingBorderBtnProps) {
  return (
    <button
      className={cn(
        "relative inline-flex overflow-hidden rounded-xl p-[1.5px]",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#173eff]/50",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "active:scale-95 transition-transform",
        containerClassName, className
      )}
      {...props}
    >
      {/* Blue-indigo only — no rainbow */}
      <motion.span
        className="absolute inset-[-1000%] opacity-85"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, #173eff 60deg, #4f46e5 120deg, #818cf8 180deg, #4f46e5 240deg, #173eff 300deg, transparent 360deg)",
        }}
        animate={{ rotate: [0, 360] }}
        transition={{ duration, repeat: Infinity, ease: "linear" }}
      />
      <span className={cn(
        "relative z-10 inline-flex h-full w-full items-center justify-center gap-2",
        "rounded-[10px] px-5 py-2.5",
        "bg-[#070b18] hover:bg-[#0d1330]",
        "text-sm font-semibold text-white leading-none",
        "transition-colors duration-200",
        innerClassName
      )}>
        {children}
      </span>
    </button>
  );
}
