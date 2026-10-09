"use client";

import { useRef, useState } from "react";
import { format } from "date-fns";
import { ExternalLink, ImagePlus, Link2, Loader2, Repeat, Sun, Sunrise, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { MonthlyGoal, Task } from "@/lib/db/schema";
import { SheetTitle } from "@/components/ui/sheet";
import { STATUS_DOT, tomorrowOf } from "@/components/tasks/task-list";
import { monthLabel } from "@/lib/goals";
import { AREAS, AREA_META } from "@/lib/areas";
import { attachmentLabel, isSafeUrl, MAX_ATTACHMENTS, type TaskAttachment } from "@/lib/attachments";
import {
  PRIORITY_LABEL, STATUS_LABEL, TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus,
} from "@/lib/tasks";

export type TaskDetailPatch = Partial<Pick<Task, "title" | "notes" | "status" | "priority" | "dueDate" | "dueTime" | "goalId" | "phase" | "area" | "attachments">>;

/** Everything about one task. Rendered inside a Sheet (Tasks page, goal page). */
export function TaskDetail({ task, today, goals, onPatch, onDelete }: {
  task: Task;
  today: string;
  goals: MonthlyGoal[];
  onPatch: (p: TaskDetailPatch) => void;
  onDelete: () => void;
}) {
  const tomorrow = tomorrowOf(today);
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");

  // Text fields save on blur rather than per keystroke — one request per edit
  // session instead of dozens.
  const commitTitle = () => { if (title.trim() && title !== task.title) onPatch({ title: title.trim() }); };
  const commitNotes = () => { if (notes !== (task.notes ?? "")) onPatch({ notes: notes || null }); };

  return (
    <div className="flex flex-col min-h-full">
      <SheetTitle className="sr-only">Edit task</SheetTitle>
      <div className="p-6 pb-4 pr-12">
        <textarea
          value={title}
          rows={2}
          onChange={(e) => setTitle(e.target.value.replace(/\n/g, ""))}
          onBlur={commitTitle}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
          className="w-full resize-none bg-transparent p-0 border-0 shadow-none outline-none focus:shadow-none focus-visible:outline-none text-xl font-semibold leading-snug"
        />
      </div>

      <div className="px-6 space-y-4 text-sm">
        <Field label="Status">
          <Segmented
            options={TASK_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s], dot: STATUS_DOT[s] }))}
            value={task.status}
            onChange={(v) => onPatch({ status: v as TaskStatus })}
          />
        </Field>
        <Field label="Priority">
          <Segmented
            options={TASK_PRIORITIES.map((p) => ({ value: p, label: p === "none" ? "None" : PRIORITY_LABEL[p] }))}
            value={task.priority}
            onChange={(v) => onPatch({ priority: v as TaskPriority })}
          />
        </Field>
        <Field label="Do it">
          <div className="flex flex-wrap items-center gap-1.5">
            <ScheduleChip active={task.dueDate === today} onClick={() => onPatch({ dueDate: today })} icon={Sun} label="Today" />
            <ScheduleChip active={task.dueDate === tomorrow} onClick={() => onPatch({ dueDate: tomorrow })} icon={Sunrise} label="Tomorrow" />
            <input
              type="date"
              value={task.dueDate ?? ""}
              onChange={(e) => onPatch({ dueDate: e.target.value || null })}
              className="h-8 rounded-md border border-border bg-transparent px-2 text-sm"
              aria-label="Pick a date"
            />
            {task.dueDate && (
              <button onClick={() => onPatch({ dueDate: null })} className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent" aria-label="Clear date">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </Field>
        <Field label="Time">
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={task.dueTime ?? ""}
              onChange={(e) => onPatch({ dueTime: e.target.value || null })}
              className="h-8 rounded-md border border-border bg-transparent px-2 text-sm"
            />
            {task.recurringId && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Repeat className="w-3 h-3" /> From a routine</span>}
          </div>
        </Field>
        <Field label="Area">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Area of life">
            {AREAS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => onPatch({ area: task.area === a ? null : a })}
                aria-pressed={task.area === a}
                title={AREA_META[a].label}
                className={cn(
                  "h-8 rounded-md text-sm transition-colors inline-flex items-center gap-1",
                  task.area === a ? "px-2 bg-accent ring-1 ring-primary font-medium" : "w-8 justify-center hover:bg-accent"
                )}
              >
                {AREA_META[a].emoji}
                {task.area === a && <span className="text-xs">{AREA_META[a].label}</span>}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Goal">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={task.goalId ?? ""}
              onChange={(e) => onPatch({ goalId: e.target.value ? Number(e.target.value) : null })}
              className="h-8 max-w-[14rem] rounded-md border border-border bg-transparent px-2 text-sm"
              aria-label="Monthly goal"
            >
              <option value="">No goal</option>
              {goals.filter((g) => g.status !== "abandoned" || g.id === task.goalId).map((g) => (
                <option key={g.id} value={g.id}>{g.emoji ?? "🎯"} {g.title} · {monthLabel(g.month).split(" ")[0]}</option>
              ))}
            </select>
            {task.goalId && (
              <input
                key={task.id}
                defaultValue={task.phase ?? ""}
                onBlur={(e) => { if ((e.target.value || null) !== task.phase) onPatch({ phase: e.target.value.trim() || null }); }}
                placeholder="Phase"
                className="h-8 w-36 rounded-md border border-border bg-transparent px-2 text-sm"
                aria-label="Phase"
              />
            )}
          </div>
        </Field>
      </div>

      <div className="px-6 pt-6">
        <p className="text-xs font-medium text-muted-foreground mb-2">Notes</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={commitNotes}
          placeholder="Details, cues, sub-steps…"
          className="min-h-28 w-full resize-y rounded-lg border border-border bg-transparent p-3 text-sm leading-6"
        />
      </div>

      <Attachments
        items={task.attachments ?? []}
        onChange={(attachments) => onPatch({ attachments })}
      />

      <div className="p-6 mt-auto flex items-center justify-between text-xs text-muted-foreground">
        <span>{task.createdAt ? `Created ${format(new Date(task.createdAt), "MMM d, yyyy")}` : ""}</span>
        <button onClick={onDelete} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>
      </div>
    </div>
  );
}

// ─── Attachments ────────────────────────────────────────────────────────────

function Attachments({ items, onChange }: { items: TaskAttachment[]; onChange: (next: TaskAttachment[]) => void }) {
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const images = items.filter((a) => a.type === "image");
  const links = items.filter((a) => a.type !== "image");
  const full = items.length >= MAX_ATTACHMENTS;

  function addLink() {
    const u = url.trim();
    const normalized = /^https?:\/\//i.test(u) ? u : `https://${u}`;
    if (!isSafeUrl(normalized)) { toast.error("That doesn't look like a valid link."); return; }
    onChange([...items, { type: "link", url: normalized }]);
    setUrl("");
  }

  async function upload(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/attachments", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      onChange([...items, { type: "image", url: data.url, title: file.name.slice(0, 120) }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const remove = (a: TaskAttachment) => onChange(items.filter((x) => x !== a));

  return (
    <div className="px-6 pt-6 space-y-3">
      <p className="text-xs font-medium text-muted-foreground">Attachments</p>

      {links.length > 0 && (
        <ul className="space-y-1.5">
          {links.map((a, i) => (
            <li key={a.url + i} className="group flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <Link2 className="w-4 h-4 shrink-0 text-muted-foreground" />
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 truncate hover:underline underline-offset-4">
                {attachmentLabel(a)}
              </a>
              <ExternalLink className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
              <button onClick={() => remove(a)} className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive" aria-label="Remove attachment">
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((a, i) => (
            <div key={a.url + i} className="relative group aspect-square rounded-lg overflow-hidden border border-border bg-muted">
              <a href={a.url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded blob URLs, arbitrary sizes */}
                <img src={a.url} alt={a.title ?? "Attachment"} className="w-full h-full object-cover" loading="lazy" />
              </a>
              <button onClick={() => remove(a)} className="absolute top-1 right-1 w-6 h-6 rounded-md bg-background/80 flex items-center justify-center opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100" aria-label="Remove image">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {!full && (
        <div className="flex items-center gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && url.trim()) addLink(); }}
            placeholder="Paste a link (video, doc, repo)…"
            className="flex-1 min-w-0 h-9 rounded-md border border-border bg-transparent px-3 text-sm"
            aria-label="Link URL"
          />
          <button onClick={addLink} disabled={!url.trim()} className="h-9 px-3 rounded-md border border-border text-sm disabled:opacity-50">Add</button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="h-9 w-9 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-50" aria-label="Upload image" title="Upload image">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Small pieces ───────────────────────────────────────────────────────────

function ScheduleChip({ active, onClick, icon: Icon, label }: {
  active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-xs transition-colors",
        active ? "border-primary bg-primary/10 text-foreground font-medium" : "border-border text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] items-center gap-3">
      <span className="text-muted-foreground">{label}</span>
      <div>{children}</div>
    </div>
  );
}

function Segmented({ options, value, onChange }: {
  options: { value: string; label: string; dot?: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-border p-0.5 bg-muted/50">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs transition-colors",
            value === o.value ? "bg-background shadow-xs text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.dot && <span className={cn("w-1.5 h-1.5 rounded-full", o.dot)} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

