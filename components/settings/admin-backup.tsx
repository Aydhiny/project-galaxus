"use client";

// Super admin only: download a backup of the database to keep on your PC.
// The download is read-only on the server — nothing is changed or deleted.

import { useState } from "react";
import { DatabaseBackup, Download, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export function AdminBackup() {
  const [busy, setBusy] = useState<"all" | "me" | null>(null);

  async function download(scope: "all" | "me") {
    setBusy(scope);
    try {
      const res = await fetch(`/api/admin/backup?scope=${scope}`, { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Backup failed (${res.status})`);
      const blob = await res.blob();
      const name = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? `galaxus-backup-${scope}.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success(`Backup saved (${(blob.size / 1024 / 1024).toFixed(1)} MB).`);
    } catch (e) { toast.error((e as Error).message); }
    setBusy(null);
  }

  return (
    <section className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.04] p-5 mb-6">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0"><DatabaseBackup className="w-5 h-5" /></span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold flex items-center gap-1.5">Database backups <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300"><ShieldCheck className="w-3 h-3" /> Super admin</span></p>
          <p className="text-xs text-muted-foreground mt-0.5">Download a JSON copy of the database to keep on your PC. Read-only — nothing on the server changes. Only you see this card.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => void download("me")} disabled={!!busy} className="h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
              {busy === "me" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} My data
            </button>
            <button onClick={() => void download("all")} disabled={!!busy} className="h-9 px-3 rounded-lg border border-border text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50 hover:bg-muted">
              {busy === "all" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Full backup (all users)
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">The full backup contains every user&apos;s data (diaries stay encrypted, passwords are hashed). Keep the file somewhere private.</p>
        </div>
      </div>
    </section>
  );
}
