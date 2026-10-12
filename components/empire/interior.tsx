"use client";

// Step inside a building from the empire: the room flies in full screen and
// you can look around its parts (screen, board, shelf, the room's own prop).

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getInteriorC, type Interior } from "@/lib/client/empire";
import type { RoomEngine, Spot } from "./room-engine";

const LOOK: { spot: Spot; label: string }[] = [
  { spot: "overview", label: "Room" }, { spot: "screen", label: "Screen" }, { spot: "board", label: "Wall" },
  { spot: "shelf", label: "Stats" }, { spot: "prop", label: "Feature" }, { spot: "pile", label: "Stacks" },
];

export function InteriorView({ buildingId, onClose }: { buildingId: string; onClose: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const room = useRef<RoomEngine | null>(null);
  const [data, setData] = useState<Interior | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spot, setSpot] = useState<Spot>("overview");

  useEffect(() => { getInteriorC(buildingId).then(setData).catch((e) => setError((e as Error).message)); }, [buildingId]);

  useEffect(() => {
    const el = host.current;
    if (!el || !data) return;
    let disposed = false;
    import("./room-engine").then(({ RoomEngine }) => {
      if (disposed) return;
      room.current = new RoomEngine(el, data, "full");
      room.current.run();
    });
    return () => { disposed = true; room.current?.dispose(); room.current = null; };
  }, [data]);

  const look = (s: Spot) => { setSpot(s); room.current?.setSpot(s); };
  const visible = LOOK.filter((l) => (l.spot === "board" ? !!data?.board.length : l.spot === "shelf" ? !!data?.shelf.length : l.spot === "pile" ? (data?.piles ?? 0) > 0 : true));

  return (
    <div className="absolute inset-0 z-40 bg-black animate-in fade-in-0 duration-500">
      <div ref={host} className="absolute inset-0" />
      {!data && !error && <div className="absolute inset-0 flex items-center justify-center text-white/70"><Loader2 className="w-6 h-6 animate-spin" /></div>}
      {error && <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">{error}</div>}
      <div className="absolute top-3 left-3 sm:top-4 sm:left-4 flex items-center gap-2">
        <button onClick={onClose} className="h-10 px-3 rounded-xl bg-black/60 text-white backdrop-blur-md inline-flex items-center gap-1.5 text-sm"><ArrowLeft className="w-4 h-4" /> Back to the city</button>
        {data && <span className="h-10 px-3 rounded-xl bg-black/60 text-white backdrop-blur-md inline-flex items-center font-hud uppercase tracking-wide">{data.title}</span>}
      </div>
      {data && (
        <div className="absolute left-1/2 -translate-x-1/2 flex gap-1 rounded-2xl bg-black/60 backdrop-blur-md p-1 max-w-[calc(100%-1.5rem)] overflow-x-auto" style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          {visible.map((l) => (
            <button key={l.spot} onClick={() => look(l.spot)}
              className={cn("h-9 px-3 rounded-xl text-sm whitespace-nowrap", spot === l.spot ? "bg-white text-black" : "text-white/80 hover:text-white")}>{l.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
