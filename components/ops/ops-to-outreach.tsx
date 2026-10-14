"use client";

// "To Outreach": a mission's lead sheet (or a whole project's) → Outreach leads in one click.
// Only adds leads; Outreach prepares the messages and you still press send.

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { sendToOutreachC } from "@/lib/client/ops";

export function ToOutreach({ missionId, projectId, big }: { missionId?: number; projectId?: number; big?: boolean }) {
  const [busy, start] = useTransition();
  const send = () => start(async () => {
    try {
      const r = await sendToOutreachC(projectId ? { projectId } : { missionId });
      if (r.added) toast.success(`${r.added} lead${r.added === 1 ? "" : "s"} added to Outreach${r.skipped ? ` · ${r.skipped} already there` : ""}.`);
      else toast.message(`Nothing new: all ${r.skipped} are already in Outreach.`);
    } catch (e) { toast.error((e as Error).message); }
  });
  return (
    <button type="button" disabled={busy} onClick={send} title="Add these businesses as Outreach leads (nothing is sent)"
      className={cn(big
        ? "h-7 px-2.5 rounded-lg border border-[#6b8afd]/50 bg-[#6b8afd]/10 text-xs text-white hover:bg-[#6b8afd]/20 inline-flex items-center gap-1"
        : "text-[11px] text-[#8ea6ff] hover:text-white inline-flex items-center gap-1", "disabled:opacity-60")}>
      {busy ? <Loader2 className={cn(big ? "w-3.5 h-3.5" : "w-3 h-3", "animate-spin")} /> : <UserPlus className={big ? "w-3.5 h-3.5" : "w-3 h-3"} />} To Outreach
    </button>
  );
}
