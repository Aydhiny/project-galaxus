"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  Home, CheckSquare, BookOpen, GraduationCap, Dumbbell, Moon,
  Music2, NotebookPen, Target, LogOut, HeartPulse, Sparkles,
  Activity, BarChart3, BookMarked, StickyNote, ChevronLeft, ChevronRight, LayoutDashboard, PanelLeftClose, Sunrise, Command,
  Disc3, Trophy, Download,
} from "lucide-react";
import { useCommandStore } from "@/lib/store/command";
import { ThemeToggle } from "@/components/theme-toggle";
import { useUIStore } from "@/lib/store/ui";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RoomCustomizer } from "@/components/room-customizer";

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
  const { sidebarCollapsed, toggleSidebar, toggleHidden } = useUIStore();
  const { openPalette } = useCommandStore();
  const collapsed = mobile ? false : sidebarCollapsed;

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <TooltipProvider delay={0}>
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className={cn("px-3 py-4 border-b border-border flex items-center", collapsed ? "justify-center" : "justify-between gap-2")}>
          {!collapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-[var(--gold-muted)] border border-[var(--gold)]/30 flex items-center justify-center shrink-0">
                <LayoutDashboard className="w-3.5 h-3.5 text-[var(--gold)]" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm tracking-wide truncate" style={{ fontFamily: "var(--font-heading)" }}>Galaxus</p>
                <p className="text-[9px] text-muted-foreground tracking-widest uppercase">Your Universe</p>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="w-7 h-7 rounded-lg bg-[var(--gold-muted)] border border-[var(--gold)]/30 flex items-center justify-center">
              <LayoutDashboard className="w-3.5 h-3.5 text-[var(--gold)]" />
            </div>
          )}
          {!collapsed && <ThemeToggle />}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              {!collapsed && (
                <p className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground px-2 mb-1.5 font-semibold">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map(({ href, icon: Icon, label }) => {
                  const active = isActive(href);
                  const linkEl = (
                    <Link
                      href={href}
                      onClick={onClose}
                      className={cn(
                        "flex items-center rounded-xl text-sm font-medium transition-all duration-150 group",
                        collapsed ? "justify-center w-9 h-9 mx-auto" : "gap-3 px-3 py-2.5",
                        active
                          ? "bg-[var(--gold-muted)] text-[var(--gold)] border border-[var(--gold)]/25"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent"
                      )}
                    >
                      <Icon className={cn("w-4 h-4 shrink-0", active ? "text-[var(--gold)]" : "text-muted-foreground group-hover:text-foreground")} />
                      {!collapsed && <span className="flex-1 truncate">{label}</span>}
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

        {/* Bottom */}
        <div className={cn("px-2 py-3 border-t border-border space-y-1", collapsed && "flex flex-col items-center")}>
          {!collapsed && (
            <div className="px-3 py-1.5 mb-1">
              <p className="text-xs font-semibold text-foreground truncate">Ajdin Mehmedović</p>
              <p className="text-[10px] text-muted-foreground truncate">ajdin@galaxus.me</p>
            </div>
          )}

          {collapsed && <ThemeToggle />}

          {/* Command palette trigger */}
          {!collapsed && (
            <button onClick={openPalette}
              className="w-full flex items-center gap-3 text-muted-foreground hover:text-foreground hover:bg-accent rounded-xl transition-colors text-sm px-3 py-2">
              <Command className="w-4 h-4 shrink-0" />
              <span className="flex-1">Command palette</span>
              <kbd className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-border bg-muted">⌘K</kbd>
            </button>
          )}
          {collapsed && (
            <Tooltip>
              <TooltipTrigger render={<button onClick={openPalette} className="w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded-xl transition-colors"><Command className="w-4 h-4" /></button>} />
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
              className="w-full flex items-center gap-3 text-muted-foreground hover:text-foreground hover:bg-accent rounded-xl transition-colors text-sm px-3 py-2"
              title="Download a JSON backup of all local data (moods, metrics, notes)"
            >
              <Download className="w-4 h-4 shrink-0" />
              Export local data
            </button>
          )}

          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className={cn("flex items-center gap-3 text-muted-foreground hover:text-foreground hover:bg-accent rounded-xl transition-colors text-sm",
              collapsed ? "justify-center w-9 h-9" : "w-full px-3 py-2")}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && "Sign out"}
          </button>

          {/* Collapse toggle — desktop only */}
          {!mobile && (
            <>
              <button
                onClick={toggleSidebar}
                className={cn("flex items-center gap-3 text-muted-foreground hover:text-foreground hover:bg-accent rounded-xl transition-colors text-sm",
                  collapsed ? "justify-center w-9 h-9" : "w-full px-3 py-2")}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {collapsed
                  ? <ChevronRight className="w-4 h-4" />
                  : <><ChevronLeft className="w-4 h-4" /><span>Collapse</span></>
                }
              </button>

              {/* Hide sidebar entirely — only shown when expanded */}
              {!collapsed && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        onClick={toggleHidden}
                        className="w-full flex items-center gap-3 text-muted-foreground hover:text-foreground hover:bg-accent rounded-xl transition-colors text-sm px-3 py-2"
                      >
                        <PanelLeftClose className="w-4 h-4 shrink-0" />
                        <span>Hide sidebar</span>
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
