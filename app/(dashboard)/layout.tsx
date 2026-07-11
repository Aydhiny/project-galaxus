"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Sidebar } from "@/components/sidebar";
import { MusicPlayer } from "@/components/music-player";
import { AmbientOverlay } from "@/components/ambient-overlay";
import { RoomBackdrop } from "@/components/room-backdrop";
import { NotificationBell } from "@/components/notification-bell";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { Menu, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useUIStore } from "@/lib/store/ui";
import { useRoomStore } from "@/lib/store/room";
import { cn } from "@/lib/utils";

// Non-critical overlays/widgets — none of these need to block first paint or
// hydrate eagerly, so they're split into their own chunks (loaded on the
// client only) instead of shipping in the main dashboard layout bundle that
// every single route pays for, including pages like /settings that never
// touch them.
const AmbientThree = dynamic(() => import("@/components/ambient-three").then((m) => m.AmbientThree), { ssr: false });
const CommandPalette = dynamic(() => import("@/components/command-palette").then((m) => m.CommandPalette), { ssr: false });
const QuickCapture = dynamic(() => import("@/components/quick-capture").then((m) => m.QuickCapture), { ssr: false });
const QuickCaptureButton = dynamic(() => import("@/components/quick-capture").then((m) => m.QuickCaptureButton), { ssr: false });
const Screensaver = dynamic(() => import("@/components/screensaver").then((m) => m.Screensaver), { ssr: false });
const FloatingPomodoro = dynamic(() => import("@/components/pomodoro-float").then((m) => m.FloatingPomodoro), { ssr: false });
const ShortcutCheatsheet = dynamic(() => import("@/components/shortcut-cheatsheet").then((m) => m.ShortcutCheatsheet), { ssr: false });
const OnboardingFlow = dynamic(() => import("@/components/onboarding").then((m) => m.OnboardingFlow), { ssr: false });
const DailyCheckinReminder = dynamic(() => import("@/components/daily-checkin-reminder").then((m) => m.DailyCheckinReminder), { ssr: false });

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { sidebarCollapsed, sidebarHidden, toggleHidden } = useUIStore();
  const { theme, decorations } = useRoomStore();
  // Only read localStorage-backed state after mount so SSR and first paint agree
  const effectiveCollapsed = mounted ? sidebarCollapsed : false;
  const effectiveHidden   = mounted ? sidebarHidden   : false;
  useEffect(() => setMounted(true), []);

  // Sync room theme + grain onto <html> for CSS custom properties + body gradients
  useEffect(() => {
    const el = document.documentElement;
    el.setAttribute("data-room", theme);
    el.setAttribute("data-grain", decorations.grain ? "true" : "false");
    return () => { el.removeAttribute("data-room"); };
  }, [theme, decorations.grain]);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Room art — z=2 (bg) and z=28 (fg) */}
      <RoomBackdrop />

      {/* CSS colour tint — z=40 */}
      <AmbientOverlay />

      {/* Three.js fire+rain particles — z=41 */}
      <AmbientThree />

      {/* Global overlays — z=200 */}
      <CommandPalette />
      <QuickCapture />

      {/* Screensaver — z=300 */}
      <Screensaver />

      {/* Keyboard shortcut cheatsheet — z=200 */}
      <ShortcutCheatsheet />

      {/* First-time onboarding — z=500, checks localStorage */}
      <OnboardingFlow />

      {/* Daily check-in nudge toast — checks server prefs + today's status once */}
      <DailyCheckinReminder />

      {/* Desktop sidebar — uses effectiveCollapsed (mounted guard prevents SSR mismatch) */}
      {!effectiveHidden && (
        <aside suppressHydrationWarning className={cn(
          "hidden md:flex flex-col border-r border-sidebar-border shrink-0 relative z-10 overflow-hidden",
          "bg-sidebar/90 backdrop-blur-xl",
          "transition-[width] duration-300 ease-in-out",
          effectiveCollapsed ? "w-[56px]" : "w-60"
        )}>
          <Sidebar />
        </aside>
      )}

      {/* Edge strip to restore hidden sidebar */}
      {effectiveHidden && (
        <button onClick={toggleHidden} title="Show sidebar"
          className="hidden md:flex fixed left-0 top-1/2 -translate-y-1/2 z-50 w-5 h-14 items-center justify-center bg-card/80 backdrop-blur-sm border border-l-0 border-border rounded-r-xl text-muted-foreground hover:text-foreground hover:bg-card transition-colors">
          <PanelLeft className="w-3 h-3" />
        </button>
      )}

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-60 bg-sidebar/95 backdrop-blur-md border-r border-border">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar mobile onClose={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0 relative z-10">
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-background/80 backdrop-blur-sm">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} className="text-muted-foreground">
            <Menu className="w-5 h-5" />
          </Button>
          <p className="font-semibold text-sm" style={{ fontFamily: "var(--font-heading)" }}>Galaxus</p>
          <div className="ml-auto">
            <NotificationBell />
          </div>
        </div>

        {/* Top gradient accent line */}
        <div className="top-accent w-full shrink-0" suppressHydrationWarning />

        <ErrorBoundary label="Page error">
          <div className="flex-1 overflow-y-auto bg-background/88 backdrop-blur-[2px]">
            {children}
          </div>
        </ErrorBoundary>

        <MusicPlayer />
      </main>

      {/* Floating widgets */}
      <FloatingPomodoro />
      <QuickCaptureButton />
    </div>
  );
}
