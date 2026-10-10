"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  CheckSquare, BookOpen, GraduationCap, Dumbbell, Moon,
  Music2, NotebookPen, Target, LogOut, HeartPulse, Sparkles,
  Activity, BarChart3, BookMarked, StickyNote, LayoutDashboard, PanelLeftClose, Sunrise, Search,
  Disc3, Trophy, Download, Lightbulb, Settings, ListTodo, FileText, ChevronRight, ChevronsLeft, ChevronsRight,
  Rss, CalendarRange, Gauge, Smartphone, Send, Clapperboard, Mic,
} from "lucide-react";
import { useCommandStore } from "@/lib/store/command";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { useUIStore } from "@/lib/store/ui";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RoomCustomizer } from "@/components/room-customizer";
import { useHydrated } from "@/lib/hooks/client-values";

type NavItem = { href: string; icon: React.ComponentType<{ className?: string }>; label: string };

// The handful of things you open every day — always visible.
const PRIMARY: NavItem[] = [
  { href: "/overview", icon: Sunrise,     label: "Today"          },
  { href: "/voice",    icon: Mic,         label: "Voice"          },
  { href: "/productivity", icon: Gauge,  label: "Productivity"   },
  { href: "/tasks",    icon: ListTodo,    label: "Tasks"          },
  { href: "/pages",    icon: FileText,    label: "Pages"          },
  { href: "/review",   icon: BarChart3,   label: "Weekly Review"  },
  { href: "/daily",    icon: CheckSquare, label: "Daily Check-in" },
  { href: "/goals",    icon: Target,      label: "Goals"          },
  { href: "/outreach", icon: Send,        label: "Outreach"       },
  { href: "/youtube",  icon: Clapperboard, label: "YouTube"        },
];

// Everything else lives in collapsible groups so the sidebar stays calm.
const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Track",
    items: [
      { href: "/dashboard",   icon: Rss,             label: "Feed"           },
      { href: "/yearly",      icon: CalendarRange,   label: "Year in Review" },
      { href: "/insights",    icon: Lightbulb,       label: "Insights"       },
      { href: "/heatmap",     icon: LayoutDashboard, label: "Habit Map"      },
      { href: "/leaderboard", icon: Trophy,          label: "Leaderboard"    },
    ],
  },
  {
    label: "Body & Mind",
    items: [
      { href: "/training",   icon: Dumbbell,   label: "Training"     },
      { href: "/workout",    icon: HeartPulse, label: "Home Workout" },
      { href: "/meditation", icon: Sparkles,   label: "Meditation"   },
      { href: "/metrics",    icon: Activity,   label: "Body Metrics" },
    ],
  },
  {
    label: "Knowledge",
    items: [
      { href: "/study",   icon: GraduationCap, label: "Study"   },
      { href: "/reading", icon: BookOpen,      label: "Reading" },
      { href: "/notes",   icon: StickyNote,    label: "Quick Notes" },
    ],
  },
  {
    label: "Soul & Creative",
    items: [
      { href: "/spiritual", icon: Moon,        label: "Spiritual"    },
      { href: "/duas",      icon: BookMarked,  label: "Duas & Dhikr" },
      { href: "/journal",   icon: NotebookPen, label: "Journal"      },
      { href: "/creative",  icon: Music2,      label: "Creative"     },
      { href: "/beats",     icon: Disc3,       label: "Beat Catalog" },
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
  const { sidebarCollapsed, toggleSidebar, toggleHidden, openGroups, toggleGroup } = useUIStore();
  const { openPalette } = useCommandStore();
  // Mounted guard so SSR and the first client render agree; persisted UI
  // state (collapsed, open groups) only applies after mount.
  const mounted = useHydrated();
  const collapsed = mounted ? (mobile ? false : sidebarCollapsed) : false;

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  // Plain render helpers (not components): a component declared inside
  // another component gets a new identity every render, so React would
  // unmount + remount every link on each render of the sidebar.
  function navLink(item: NavItem) {
    const { href, icon: Icon, label } = item;
    const active = isActive(href);
    const link = (
      <Link
        key={href}
        href={href}
        onClick={onClose}
        className={cn(
          "flex items-center rounded-md text-[13.5px] transition-colors",
          collapsed ? "justify-center w-9 h-9 mx-auto" : "gap-2.5 h-8 px-2",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
            : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        )}
      >
        <Icon className={cn("w-4 h-4 shrink-0", active ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/55")} />
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>
    );
    if (!collapsed) return link;
    return (
      <Tooltip key={href}>
        <TooltipTrigger render={link} />
        <TooltipContent side="right" className="text-xs">{label}</TooltipContent>
      </Tooltip>
    );
  }

  function iconButton({ label, onClick, href, children, danger }: {
    label: string; onClick?: () => void; href?: string; children: React.ReactNode; danger?: boolean;
  }) {
    const cls = cn(
      "w-8 h-8 flex items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors",
      danger ? "hover:text-red-500 hover:bg-red-500/10" : "hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/70"
    );
    const el = href
      ? <Link href={href} onClick={onClose} className={cls} aria-label={label}>{children}</Link>
      : <button onClick={onClick} className={cls} aria-label={label}>{children}</button>;
    return (
      <Tooltip key={label}>
        <TooltipTrigger render={el} />
        <TooltipContent side={collapsed ? "right" : "top"} className="text-xs">{label}</TooltipContent>
      </Tooltip>
    );
  }

  function exportLocalData() {
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
    a.href = url; a.download = `galaxus-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <TooltipProvider delay={300}>
      <div suppressHydrationWarning className="flex flex-col h-full bg-sidebar text-sidebar-foreground">

        {/* ── Workspace header ─────────────────────────────────────────── */}
        <div className={cn("flex items-center h-12 px-3 shrink-0", collapsed ? "justify-center" : "gap-2")}>
          <div className="w-6 h-6 rounded-md bg-foreground text-background flex items-center justify-center text-[11px] font-bold shrink-0">
            {userName.charAt(0).toUpperCase()}
          </div>
          {!collapsed && (
            <>
              <p className="flex-1 min-w-0 truncate text-sm font-semibold">{userName}&apos;s Galaxus</p>
              <NotificationBell />
              <ThemeToggle />
            </>
          )}
        </div>

        {/* ── Search (command palette) ─────────────────────────────────── */}
        <div className="px-2 pb-2 shrink-0">
          {collapsed ? (
            iconButton({ label: "Search (Ctrl K)", onClick: openPalette, children: <Search className="w-4 h-4" /> })
          ) : (
            <button
              onClick={openPalette}
              className="w-full flex items-center gap-2.5 h-8 px-2 rounded-md text-[13.5px] text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors"
            >
              <Search className="w-4 h-4" />
              <span className="flex-1 text-left">Search</span>
              <kbd className="text-[10px] font-mono text-sidebar-foreground/45">Ctrl K</kbd>
            </button>
          )}
        </div>

        {/* ── Nav ──────────────────────────────────────────────────────── */}
        <nav className="flex-1 px-2 pb-3 overflow-y-auto scrollbar-hide">
          <div className="space-y-px">
            {PRIMARY.map(navLink)}
          </div>

          <div className="mt-4 space-y-1">
            {GROUPS.map((group) => {
              const hasActive = group.items.some((i) => isActive(i.href));
              const open = collapsed || hasActive || (mounted && openGroups.includes(group.label));
              return (
                <div key={group.label}>
                  {!collapsed && (
                    <button
                      onClick={() => toggleGroup(group.label)}
                      className="group w-full flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium text-sidebar-foreground/50 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground/80"
                    >
                      <span className="flex-1 text-left">{group.label}</span>
                      <ChevronRight className={cn("w-3.5 h-3.5 transition-transform opacity-0 group-hover:opacity-100", open && "rotate-90 opacity-60")} />
                    </button>
                  )}
                  {collapsed && <div className="h-px bg-sidebar-border mx-2 my-2" />}
                  {open && (
                    <div className="space-y-px">
                      {group.items.map(navLink)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </nav>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div className="px-2 py-2 border-t border-sidebar-border shrink-0 space-y-1">
          {!collapsed && !mobile && <RoomCustomizer />}
          <div className={cn("flex items-center", collapsed ? "flex-col gap-1" : "justify-between")}>
            {iconButton({ label: "Settings", href: "/settings", children: <Settings className="w-4 h-4" /> })}
            {!collapsed && iconButton({ label: "Export local data (JSON)", onClick: exportLocalData, children: <Download className="w-4 h-4" /> })}
            {iconButton({ label: "Install the app", href: "/install", children: <Smartphone className="w-4 h-4" /> })}
            {!mobile && !collapsed && iconButton({ label: "Hide sidebar", onClick: toggleHidden, children: <PanelLeftClose className="w-4 h-4" /> })}
            {!mobile && iconButton({
              label: collapsed ? "Expand sidebar" : "Collapse sidebar",
              onClick: toggleSidebar,
              children: collapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />,
            })}
            {collapsed && <ThemeToggle />}
            {iconButton({ label: "Sign out", onClick: () => signOut({ callbackUrl: "/login" }), danger: true, children: <LogOut className="w-4 h-4" /> })}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
