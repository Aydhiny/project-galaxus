"use client";

// The building's room, faded behind its page (Gig radar → the radar room,
// Money → the vault, …). What you click moves the camera: pages call
// setRoomSpot() on tab changes, and any element with data-room-spot="screen"
// (or board / shelf / pile / prop) does it on click. Scrolling walks you a
// little deeper into the room. 15 fps, no shadows, frozen after 15 s without
// clicks or scrolling, paused when the tab hides — it's a backdrop, not a game.

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { roomFor } from "@/lib/page-rooms";
import { getInteriorC, type Interior } from "@/lib/client/empire";
import { setRoomSpot, useRoomSpot } from "@/lib/store/room-spot";
import type { RoomEngine, Spot } from "@/components/empire/room-engine";

const SPOTS = new Set<Spot>(["overview", "screen", "board", "shelf", "pile", "prop"]);

export function PageRoom() {
  const pathname = usePathname();
  const building = roomFor(pathname);
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<RoomEngine | null>(null);
  const [data, setData] = useState<{ id: string; room: Interior } | null>(null);
  const spot = useRoomSpot((s) => s.spot);

  // New page → back to the overview, load that room's data (cached per building for the session).
  useEffect(() => {
    setRoomSpot("overview");
    if (!building) return;
    let cancelled = false;
    getInteriorC(building).then((room) => { if (!cancelled) setData({ id: building, room }); }).catch(() => {});
    return () => { cancelled = true; };
  }, [building]);

  useEffect(() => {
    const el = host.current;
    if (!el || !data || data.id !== building) return;
    let disposed = false;
    import("@/components/empire/room-engine").then(({ RoomEngine }) => {
      if (disposed) return;
      engine.current = new RoomEngine(el, data.room, "background");
      engine.current.setSpot(useRoomSpot.getState().spot);
      if (!document.hidden) engine.current.run();
    });
    const onVis = () => { if (document.hidden) engine.current?.pause(); else { engine.current?.run(); engine.current?.wake(); } };
    document.addEventListener("visibilitychange", onVis);
    return () => { disposed = true; document.removeEventListener("visibilitychange", onVis); engine.current?.dispose(); engine.current = null; };
  }, [data, building]);

  useEffect(() => { engine.current?.setSpot(spot); }, [spot]);

  // Clicks on anything marked data-room-spot, and scroll depth.
  useEffect(() => {
    if (!building) return;
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.("[data-room-spot]") as HTMLElement | null;
      const s = el?.dataset.roomSpot as Spot | undefined;
      if (s && SPOTS.has(s)) setRoomSpot(s);
    };
    const onScroll = (e: Event) => {
      const t = e.target as HTMLElement;
      if (!t || !(t instanceof HTMLElement) || t.scrollHeight <= t.clientHeight) return;
      engine.current?.setDepth(t.scrollTop / (t.scrollHeight - t.clientHeight));
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("scroll", onScroll, true);
    return () => { document.removeEventListener("click", onClick, true); document.removeEventListener("scroll", onScroll, true); };
  }, [building]);

  if (!building) return null;
  return (
    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden>
      <div ref={host} className="absolute inset-0 opacity-[0.55] transition-opacity duration-700" />
    </div>
  );
}
