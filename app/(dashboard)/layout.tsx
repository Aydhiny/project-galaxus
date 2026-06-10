"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/sidebar";
import { MusicPlayer } from "@/components/music-player";
import { AmbientOverlay } from "@/components/ambient-overlay";
import { RoomBackdrop } from "@/components/room-backdrop";
import { AmbientThree } from "@/components/ambient-three";
import { CommandPalette } from "@/components/command-palette";
import { QuickCapture, QuickCaptureButton } from "@/components/quick-capture";
import { Screensaver } from "@/components/screensaver";
import { FloatingPomodoro } from "@/components/pomodoro-float";
import { ShortcutCheatsheet } from "@/components/shortcut-cheatsheet";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { Menu, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useUIStore } from "@/lib/store/ui";
import { useRoomStore } from "@/lib/store/room";
import { cn } from "@/lib/utils";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { sidebarCollapsed, sidebarHidden, toggleHidden } = useUIStore();
  const { theme, decorations } = useRoomStore();

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

      {/* Desktop sidebar */}
      {!sidebarHidden && (
        <aside className={cn(
          "hidden md:flex flex-col border-r border-sidebar-border shrink-0 transition-all duration-200 relative z-10",
          "bg-sidebar/88 backdrop-blur-md",
          sidebarCollapsed ? "w-[56px]" : "w-60"
        )}>
          <Sidebar />
        </aside>
      )}

      {/* Edge strip to restore hidden sidebar */}
      {sidebarHidden && (
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
        </div>

        <ErrorBoundary label="Page error">
          <div className="flex-1 overflow-y-auto bg-background/92 backdrop-blur-[2px]">
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
