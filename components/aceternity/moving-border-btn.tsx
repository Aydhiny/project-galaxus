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
  duration = 4, ...props
}: MovingBorderBtnProps) {
  return (
    <button
      className={cn("relative inline-flex h-10 overflow-hidden rounded-xl p-[1px] focus:outline-none focus:ring-2 focus:ring-[#173eff]/50", containerClassName, className)}
      {...props}
    >
      {/* Rotating conic border */}
      <motion.span
        className="absolute inset-[-1000%]"
        style={{ background: "conic-gradient(from 0deg, transparent 0%, #173eff 20%, #7c3aed 40%, #06b6d4 60%, #173eff 80%, transparent 100%)" }}
        animate={{ rotate: [0, 360] }}
        transition={{ duration, repeat: Infinity, ease: "linear" }}
      />
      {/* Inner content */}
      <span className={cn(
        "inline-flex h-full w-full cursor-pointer items-center justify-center rounded-[10px] px-5 text-sm font-semibold text-white gap-2",
        "bg-[#070b18]",
        "hover:bg-[#0d1228]",
        "transition-colors",
        innerClassName
      )}>
        {children}
      </span>
    </button>
  );
}
