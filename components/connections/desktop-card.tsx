"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Download, FolderOpen, MonitorSmartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORY_LABEL } from "@/lib/activity";
import { getActivityStatusC } from "@/lib/client/activity";
import { DESKTOP_KEYS, tauriInvoke, type ActivityStatus } from "@/components/desktop-bridge";

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } };

/** Automatic tracking from the desktop app: deep work, doomscroll guard, beat folder. */
export function DesktopCard() {
  const [desktop] = useState(() => !!tauriInvoke());
  const [tracking, setTracking] = useState(() => read(DESKTOP_KEYS.tracking) !== "off");
  const [folder, setFolder] = useState(() => read(DESKTOP_KEYS.beatFolder) ?? "");
  const [status, setStatus] = useState<ActivityStatus | null>(null);

  useEffect(() => { getActivityStatusC().then(setStatus).catch(() => {}); }, []);

  async function saveFolder() {
    const dir = folder.trim();
    if (!dir) { write(DESKTOP_KEYS.beatFolder, null); toast.success("Beat folder removed."); return; }
    const invoke = tauriInvoke();
    if (!invoke) return;
    try {
      await invoke("list_new_files", { dir, ext: "flp", sinceMs: Date.now() });
      write(DESKTOP_KEYS.beatFolder, dir);
      write(DESKTOP_KEYS.beatSince, String(Date.now() - 7 * 86_400_000));
      toast.success("Watching that folder — new .flp projects become beats.");
    } catch (e) { toast.error(String(e)); }
  }

  const deep = Object.entries(status?.deepToday ?? {}).filter(([, m]) => (m ?? 0) > 0);
  return (
    <section className="rounded-2xl border border-border bg-card p-5 flex flex-col">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-sky-500/12 text-sky-600 dark:text-sky-400 flex items-center justify-center"><MonitorSmartphone className="w-5 h-5" /></span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold">Desktop app · automatic tracking</p>
          <p className="text-xs text-muted-foreground mt-0.5">Time in VS Code, Unity, FL Studio, Premiere and co. is logged as deep work and earns skill XP. 20+ minutes on YouTube or Instagram fogs up your empire and brings Galaxus forward. App names and window titles stay on your computer; only minutes per category are saved.</p>
        </div>
        <span className={cn("text-xs font-medium rounded-full px-2 py-0.5", desktop ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>{desktop ? "This is the desktop app" : "Not in the desktop app"}</span>
      </div>

      {deep.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {deep.map(([k, m]) => <span key={k} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{CATEGORY_LABEL[k as keyof typeof CATEGORY_LABEL]} · {m} min today</span>)}
        </div>
      )}

      {desktop ? (
        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={tracking} onChange={(e) => { setTracking(e.target.checked); write(DESKTOP_KEYS.tracking, e.target.checked ? null : "off"); }} />
            Track deep work and scrolling on this computer
          </label>
          <div>
            <p className="text-xs font-medium mb-1 flex items-center gap-1.5"><FolderOpen className="w-3.5 h-3.5" /> FL Studio projects folder</p>
            <div className="flex gap-2">
              <input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="C:\Users\you\Documents\Image-Line\FL Studio\Projects"
                className="flex-1 h-9 rounded-lg border border-border bg-transparent px-3 text-xs font-mono" />
              <button onClick={saveFolder} className="h-9 px-3 rounded-lg bg-foreground text-background text-xs font-medium">Save</button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">New projects saved there show up in your Beat Catalog as drafts. Only file names are read.</p>
          </div>
          <p className="text-[11px] text-muted-foreground">Closing the window keeps Galaxus in the tray so tracking continues. Quit from the tray icon.</p>
        </div>
      ) : (
        <Link href="/install" className="mt-4 h-9 self-start px-3 rounded-lg border border-border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-muted"><Download className="w-3.5 h-3.5" /> Get the desktop app</Link>
      )}
    </section>
  );
}
