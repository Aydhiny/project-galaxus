"use client";
import React from "react";
import { cn } from "@/lib/utils";

interface ShineButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  size?: "sm" | "md" | "lg";
  bgColor?: string;
}
const SIZES = {
  sm: { padding: "0.45rem 1rem",   fontSize: "0.8rem"  },
  md: { padding: "0.6rem 1.5rem",  fontSize: "0.9rem"  },
  lg: { padding: "0.75rem 2rem",   fontSize: "1rem"    },
};

export const ShineButton: React.FC<ShineButtonProps> = ({
  label, children, onClick, className = "", size = "md",
  bgColor = "linear-gradient(325deg, hsl(217 100% 56%) 0%, hsl(194 100% 69%) 55%, hsl(217 100% 56%) 90%)",
  ...rest
}) => {
  const { padding, fontSize } = SIZES[size];
  const backgroundImage = bgColor.startsWith("linear-gradient") ? bgColor : `linear-gradient(to right,${bgColor},${bgColor})`;
  return (
    <button
      {...rest}
      onClick={onClick}
      className={cn(
        "relative overflow-hidden text-white font-semibold rounded-xl min-w-[100px] min-h-[40px] cursor-pointer active:scale-95",
        "shadow-[0px_0px_20px_rgba(71,184,255,0.5),0px_5px_5px_-1px_rgba(58,125,233,0.25),inset_4px_4px_8px_rgba(175,230,255,0.5),inset_-4px_-4px_8px_rgba(19,95,216,0.35)]",
        "focus:outline-none focus:ring-2 focus:ring-white/30",
        "transition-all duration-700",
        className
      )}
      style={{ backgroundImage, backgroundSize: "280% auto", fontSize, padding, transition: "0.8s" }}
      onMouseEnter={e => (e.currentTarget.style.backgroundPosition = "right top")}
      onMouseLeave={e => (e.currentTarget.style.backgroundPosition = "initial")}
    >
      {/* Shine sweep */}
      <div className="pointer-events-none absolute top-0 left-[-100%] w-[60%] h-full bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-[-20deg] animate-[shine-sweep_3s_ease_infinite]" />
      {label ?? children}
    </button>
  );
};
