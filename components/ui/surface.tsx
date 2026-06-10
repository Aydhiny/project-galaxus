import { cn } from "@/lib/utils";

interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
  variant?: "default" | "elevated" | "inset";
  padding?: "none" | "sm" | "md" | "lg";
}

export function Surface({
  children, className, glow = false,
  variant = "default", padding = "md", ...props
}: SurfaceProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border transition-all duration-300",
        // Dark mode — glassmorphism
        "dark:border-white/[0.07]",
        variant === "default" && "dark:bg-[rgba(11,16,30,0.82)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_24px_rgba(0,0,0,0.45)]",
        variant === "elevated" && "dark:bg-[rgba(16,22,42,0.90)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_8px_40px_rgba(0,0,0,0.55)]",
        variant === "inset" && "dark:bg-[rgba(6,10,20,0.60)] dark:shadow-[inset_0_1px_4px_rgba(0,0,0,0.40)]",
        // Light mode
        "bg-white border-black/[0.07] shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_12px_rgba(0,0,0,0.04)]",
        // Padding
        padding === "none" && "p-0",
        padding === "sm" && "p-4",
        padding === "md" && "p-5",
        padding === "lg" && "p-6",
        // Glow on hover
        glow && "hover:border-[#173eff]/25 hover:shadow-[0_0_0_1px_rgba(23,62,255,0.12),0_8px_32px_rgba(0,0,0,0.50)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
