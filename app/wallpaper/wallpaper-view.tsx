"use client";

import dynamic from "next/dynamic";

// three.js stays client-only; the scene is the same live city as /empire, minus the HUD.
const EmpireScene = dynamic(() => import("@/components/empire/empire-host").then((m) => m.EmpireScene), { ssr: false });

export function WallpaperView() {
  return (
    <div className="fixed inset-0 bg-[#bfdcf0]">
      <EmpireScene active chrome={false} />
    </div>
  );
}
