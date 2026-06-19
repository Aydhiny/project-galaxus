"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  Home, CheckSquare, BookOpen, GraduationCap, Dumbbell, Moon,
  Music2, NotebookPen, Target, LogOut, HeartPulse, Sparkles,
  Activity, BarChart3, BookMarked, StickyNote, ChevronLeft, ChevronRight, LayoutDashboard, PanelLeftClose, Sunrise, Command,
  Disc3, Trophy, Download, Lightbulb,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useCommandStore } from "@/lib/store/command";
import { ThemeToggle } from "@/components/theme-toggle";
import { useUIStore } from "@/lib/store/ui";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RoomCustomizer } from "@/components/room-customizer";
import { GradientText, SectionLabel } from "@/components/aceternity/gradient-text";

const NAV_GROUPS = [
  {
    label: "Daily",
    items: [
      { href: "/overview",  icon: Sunrise,      label: "Overview"       },
      { href: "/dashboard", icon: Home,         label: "Feed"           },
      { href: "/daily",     icon: CheckSquare,  label: "Daily Check-in" },
      { href: "/goals",     icon: Target,       label: "Goals"          },
      { href: "/review",    icon: BarChart3,    label: "Weekly Review"  },
      { href: "/yearly",    icon: Trophy,       label: "Year in Review" },
      { href: "/insights",  icon: Lightbulb,    label: "Insights"       },
      { href: "/leaderboard", icon: Trophy,      label: "Leaderboard"    },
    ],
  },
  {
    label: "Body & Mind",
    items: [
      { href: "/training",  icon: Dumbbell,    label: "Training"     },
      { href: "/workout",   icon: HeartPulse,  label: "Home Workout" },
      { href: "/meditation",icon: Sparkles,    label: "Meditation"   },
      { href: "/metrics",   icon: Activity,    label: "Body Metrics" },
    ],
  },
  {
    label: "Knowledge",
    items: [
      { href: "/study",    icon: GraduationCap, label: "Study"   },
      { href: "/reading",  icon: BookOpen,      label: "Reading" },
      { href: "/notes",    icon: StickyNote,    label: "Notes"   },
      { href: "/heatmap",  icon: LayoutDashboard, label: "Habit Map" },
    ],
  },
  {
    label: "Soul & Creative",
    items: [
      { href: "/spiritual", icon: Moon,       label: "Spiritual"   },
      { href: "/duas",      icon: BookMarked, label: "Duas & Dhikr"},
      { href: "/creative",  icon: Music2,     label: "Creative"    },
      { href: "/beats",     icon: Disc3,      label: "Beat Catalog"},
      { href: "/journal",   icon: NotebookPen,label: "Journal"     },
    ],
  },
];

interface SidebarProps {
  mobile?: boolean;
  onClose?: () => void;
}

export function Sidebar({ mobile, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const userName = session?.user?.name ?? "User";
  const userEmail = session?.user?.email ?? "";
  const { sidebarCollapsed, toggleSidebar, toggleHidden } = useUIStore();
  const { openPalette } = useCommandStore();
  // Use mounted guard so SSR and first client render always agree (collapsed=false).
  // After mount, localStorage value is applied. Prevents hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const collapsed = mounted ? (mobile ? false : sidebarCollapsed) : false;

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <TooltipProvider delay={0}>
      {/* suppressHydrationWarning: sidebar reads sidebarCollapsed from localStorage
          which differs between SSR (default) and first client render */}
      <div suppressHydrationWarning className={cn(
        "flex flex-col h-full",
        "dark:bg-[rgba(5,8,20,0.97)] dark:backdrop-blur-xl dark:border-r dark:border-white/[0.06]",
        "bg-[#ebeeff] border-r border-black/[0.07]"
      )}>

        {/* ── Logo ─────────────────────────────────────────────────────── */}
        <div className={cn(
          "px-3 py-4 border-b border-sidebar-border flex items-center",
          collapsed ? "justify-center" : "justify-between gap-2"
        )}>
          {!collapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-[#173eff]/15 border border-[#173eff]/30 flex items-center justify-center shrink-0">
                <LayoutDashboard className="w-3.5 h-3.5 text-[#3758f9]" />
              </div>
              <div className="min-w-0">
                <GradientText
                  as="p"
                  from="#60a5fa" via="#818cf8" to="#a78bfa"
                  className="font-bold text-sm tracking-wide truncate"
                  style={{ fontFamily: "var(--font-heading)" } as React.CSSProperties}
                >
                  GALAXUS
                </GradientText>
                <p className="text-[8px] font-semibold uppercase tracking-[0.2em] opacity-40">Your Universe</p>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="w-7 h-7 rounded-lg bg-[#173eff]/15 border border-[#173eff]/30 flex items-center justify-center">
              <LayoutDashboard className="w-3.5 h-3.5 text-[#3758f9]" />
            </div>
          )}
          {!collapsed && <ThemeToggle />}
        </div>

        {/* ── Nav ──────────────────────────────────────────────────────── */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto scrollbar-hide space-y-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              {!collapsed && (
                <SectionLabel className="px-2 mb-1.5">
                  {group.label}
                </SectionLabel>
              )}
              <div className="space-y-0.5">
                {group.items.map(({ href, icon: Icon, label }) => {
                  const active = isActive(href);
                  const linkEl = (
                    <Link
                      href={href}
                      onClick={onClose}
                      className={cn(
                        "flex items-center rounded-lg text-sm font-medium transition-all duration-150 group relative",
                        collapsed ? "justify-center w-9 h-9 mx-auto" : "gap-3 py-2",
                        active
                          ? "bg-primary/[0.13] text-primary font-semibold px-3"
                          : "dark:text-white/50 dark:hover:text-white/85 dark:hover:bg-white/[0.06] text-foreground/55 hover:text-foreground/90 hover:bg-foreground/[0.05] px-3"
                      )}
                    >
                      <Icon className={cn(
                        "w-4 h-4 shrink-0 transition-colors",
                        active ? "text-blue-400" : "text-muted-foreground group-hover:text-foreground"
                      )} />
                      {/* Label fades in/out on collapse */}
                      <span className={cn(
                        "flex-1 truncate transition-[opacity,max-width] duration-300 ease-in-out whitespace-nowrap",
                        collapsed ? "opacity-0 max-w-0 overflow-hidden" : "opacity-100 max-w-[200px]"
                      )}>{label}</span>
                      {active && !collapsed && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#173eff] shrink-0 animate-[pulse-glow_2s_ease-in-out_infinite] transition-opacity duration-300" />
                      )}
                    </Link>
                  );

                  if (collapsed) {
                    return (
                      <Tooltip key={href}>
                        <TooltipTrigger render={linkEl} />
                        <TooltipContent side="right" className="text-xs">{label}</TooltipContent>
                      </Tooltip>
                    );
                  }
                  return <div key={href}>{linkEl}</div>;
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* ── Bottom ───────────────────────────────────────────────────── */}
        <div className={cn(
          "px-2 py-3 border-t border-sidebar-border space-y-0.5",
          collapsed && "flex flex-col items-center"
        )}>

          {/* User info */}
          {!collapsed && (
            <div className="px-3 py-2 flex items-center gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{userName}</p>
                <p className="text-[10px] text-muted-foreground/60 truncate">{userEmail}</p>
              </div>
            </div>
          )}

          {/* Sign out — explicit row, clearly labeled */}
          {!collapsed && (
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full flex items-center gap-3 rounded-lg text-sm px-3 py-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors mb-0.5"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span className="text-xs">Sign out</span>
            </button>
          )}
          {collapsed && (
            <Tooltip>
              <TooltipTrigger render={
                <button onClick={() => signOut({ callbackUrl: "/login" })}
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors">
                  <LogOut className="w-4 h-4" />
                </button>
              } />
              <TooltipContent side="right" className="text-xs text-red-400">Sign out</TooltipContent>
            </Tooltip>
          )}

          {collapsed && <ThemeToggle />}

          {/* Command palette */}
          {!collapsed && (
            <button
              onClick={openPalette}
              className="w-full flex items-center gap-3 btn-ghost rounded-lg text-sm px-3 py-2"
            >
              <Command className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-xs">Command palette</span>
              <kbd className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-sidebar-border bg-sidebar-accent text-muted-foreground">⌘K</kbd>
            </button>
          )}
          {collapsed && (
            <Tooltip>
              <TooltipTrigger render={
                <button
                  onClick={openPalette}
                  className="w-9 h-9 flex items-center justify-center btn-ghost rounded-lg"
                >
                  <Command className="w-4 h-4" />
                </button>
              } />
              <TooltipContent side="right" className="text-xs">Command palette (⌘K)</TooltipContent>
            </Tooltip>
          )}

          {/* Room theme picker — expanded only */}
          {!collapsed && !mobile && <RoomCustomizer />}

          {/* Export localStorage data */}
          {!collapsed && (
            <button
              onClick={() => {
                const data: Record<string, unknown> = {};
                for (let i = 0; i < localStorage.length; i++) {
                  const k = localStorage.key(i)!;
                  if (k.startsWith("galaxus-")) {
                    try { data[k] = JSON.parse(localStorage.getItem(k)!); }
                    catch { data[k] = localStorage.getItem(k); }
                  }
                }
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = `galaxus-backup-${new Date().toISOString().slice(0,10)}.json`;
                a.click(); URL.revokeObjectURL(url);
              }}
              className="w-full flex items-center gap-3 btn-ghost rounded-lg text-sm px-3 py-2"
              title="Download a JSON backup of all local data (moods, metrics, notes)"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span className="text-xs">Export local data</span>
            </button>
          )}

          {/* Divider — separates layout controls from user actions */}
          {!mobile && (
            <div className="h-px bg-sidebar-border mx-1 my-1.5" />
          )}

          {/* Collapse toggle — desktop only */}
          {!mobile && (
            <>
              <button
                onClick={toggleSidebar}
                className={cn(
                  "flex items-center gap-3 btn-ghost rounded-lg text-sm",
                  collapsed ? "justify-center w-9 h-9" : "w-full px-3 py-2"
                )}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {collapsed
                  ? <ChevronRight className="w-4 h-4" />
                  : <><ChevronLeft className="w-4 h-4" /><span className="text-xs">Collapse</span></>
                }
              </button>

              {/* Hide sidebar entirely — only shown when expanded */}
              {!collapsed && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        onClick={toggleHidden}
                        className="w-full flex items-center gap-3 btn-ghost rounded-lg text-sm px-3 py-2"
                      >
                        <PanelLeftClose className="w-4 h-4 shrink-0" />
                        <span className="text-xs">Hide sidebar</span>
                      </button>
                    }
                  />
                  <TooltipContent side="right" className="text-xs">Click the edge strip to restore</TooltipContent>
                </Tooltip>
              )}
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
