"use client";

// Small celebrations for /ops: a puff of confetti when a result gets accepted
// (a mission turns "done") and a full burst when a whole project finishes.
//
// It watches ids, not counts, and only reacts to ids that are NEW since the
// last render. So the 5-second data refresh, which re-sends the same ids,
// never fires anything, and neither does opening the page (the first render
// only records what's already done).

import { useEffect, useRef } from "react";
import { fireBurst, fireConfetti } from "@/lib/confetti";

export function OpsCelebrate({ doneMissions, doneProjects }: { doneMissions: number[]; doneProjects: number[] }) {
  const seen = useRef<{ missions: Set<number>; projects: Set<number> } | null>(null);
  const missionKey = doneMissions.join(",");
  const projectKey = doneProjects.join(",");

  useEffect(() => {
    const missions = new Set(missionKey ? missionKey.split(",").map(Number) : []);
    const projects = new Set(projectKey ? projectKey.split(",").map(Number) : []);
    const prev = seen.current;
    seen.current = { missions, projects };
    if (!prev) return; // first render: just remember what's already done
    const newProject = [...projects].some((id) => !prev.projects.has(id));
    const newMission = [...missions].some((id) => !prev.missions.has(id));
    if (newProject) void fireConfetti("big");
    else if (newMission) void fireBurst(null, ["#6b8afd", "#34d399", "#fbbf24"]);
  }, [missionKey, projectKey]);

  return null;
}
