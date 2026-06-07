"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, CheckSquare, BookOpen, GraduationCap,
  Dumbbell, Moon, Music2, NotebookPen, Target, LogOut,
  Sparkles, HeartPulse, Home,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const navItems = [
  { href: "/dashboard", icon: Home, label: "Feed" },
  { href: "/daily", icon: CheckSquare, label: "Daily Check-in" },
  { href: "/reading", icon: BookOpen, label: "Reading" },
  { href: "/study", icon: GraduationCap, label: "Study" },
  { href: "/training", icon: Dumbbell, label: "Training" },
  { href: "/workout", icon: HeartPulse, label: "Home Workout" },
  { href: "/spiritual", icon: Moon, label: "Spiritual" },
  { href: "/meditation", icon: Sparkles, label: "Meditation" },
  { href: "/creative", icon: Music2, label: "Creative" },
  { href: "/journal", icon: NotebookPen, label: "Journal" },
  { href: "/goals", icon: Target, label: "Goals" },
];

interface SidebarProps {
  mobile?: boolean;
  onClose?: () => void;
}

export function Sidebar({ mobile, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[var(--gold-muted)] border border-[var(--gold)]/30 flex items-center justify-center">
              <LayoutDashboard className="w-3.5 h-3.5 text-[var(--gold)]" />
            </div>
            <div>
              <p className="font-bold text-sm tracking-wide" style={{ fontFamily: "var(--font-heading)" }}>Galaxus</p>
              <p className="text-[10px] text-muted-foreground tracking-widest uppercase">Your Universe</p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active =
            href === "/dashboard"
              ? pathname === "/dashboard" || pathname === "/"
              : pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group",
                active
                  ? "bg-[var(--gold-muted)] text-[var(--gold)] border border-[var(--gold)]/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <Icon className={cn("w-4 h-4 shrink-0", active ? "text-[var(--gold)]" : "text-muted-foreground group-hover:text-foreground")} />
              <span className="flex-1">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-4 border-t border-border">
        <div className="px-3 py-2 mb-2">
          <p className="text-xs font-semibold text-foreground">Ajdin Mehmedović</p>
          <p className="text-[11px] text-muted-foreground">ajdin@galaxus.me</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-accent gap-3 px-3"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </Button>
      </div>
    </div>
  );
}
