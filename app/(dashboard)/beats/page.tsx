"use client";

import { useEffect, useState, useRef } from "react";
import { getBeats, createBeat, updateBeat, deleteBeat } from "@/lib/actions/beats";
import type { Beat } from "@/lib/db/schema";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { RowSkeleton } from "@/components/ui/skeleton";
import {
  Plus, Search, Download, Trash2, Pencil, Check, X, Disc3,
  Music2, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STATUSES = ["idea", "draft", "finished", "released", "sold"] as const;
type BeatStatus = typeof STATUSES[number];

const STATUS_COLOR: Record<BeatStatus, string> = {
  idea:     "oklch(0.60 0.10 240)",
  draft:    "oklch(0.65 0.15 55)",
  finished: "var(--emerald)",
  released: "oklch(0.65 0.20 290)",
  sold:     "var(--gold)",
};

const MOODS = ["dark", "melodic", "trap", "afro", "drill", "chill", "hard", "emotional", "bounce"];
const KEYS_LIST = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#",
  "Am", "A#m", "Bm", "Cm", "C#m", "Dm", "D#m", "Em", "Fm", "F#m", "Gm", "G#m"];

interface FormState {
  name: string; bpm: string; key: string; mood: string;
  genre: string; status: BeatStatus; client: string; notes: string; producedAt: string;
}

const EMPTY_FORM: FormState = {
  name: "", bpm: "", key: "", mood: "", genre: "",
  status: "idea", client: "", notes: "", producedAt: "",
};

function BeatForm({
  initial, onSave, onCancel,
}: {
  initial?: FormState;
  onSave: (f: FormState) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial ?? EMPTY_FORM);
  const set = (k: keyof FormState, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <form onSubmit={e => { e.preventDefault(); if (form.name.trim()) onSave(form); }}
      className="rounded-2xl border border-[var(--gold)]/25 bg-card p-5 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="col-span-2 sm:col-span-3">
          <input value={form.name} onChange={e => set("name", e.target.value)}
            placeholder="Beat name *" required
            className="w-full px-3 py-2 rounded-xl border border-border bg-muted/30 text-sm font-semibold focus:outline-none focus:border-[var(--gold)]/50 focus:ring-1 focus:ring-[var(--gold)]/20" />
        </div>
        <input value={form.bpm} onChange={e => set("bpm", e.target.value)}
          placeholder="BPM" type="number" min="40" max="300"
          className="px-3 py-2 rounded-xl border border-border bg-muted/30 text-sm focus:outline-none focus:border-[var(--gold)]/50" />
        <select value={form.key} onChange={e => set("key", e.target.value)}
          className="px-3 py-2 rounded-xl border border-border bg-muted/30 text-sm focus:outline-none focus:border-[var(--gold)]/50">
          <option value="">Key</option>
          {KEYS_LIST.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        <select value={form.mood} onChange={e => set("mood", e.target.value)}
          className="px-3 py-2 rounded-xl border border-border bg-muted/30 text-sm focus:outline-none focus:border-[var(--gold)]/50">
          <option value="">Mood / Tag</option>
          {MOODS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <input value={form.genre} onChange={e => set("genre", e.target.value)}
          placeholder="Genre"
          className="px-3 py-2 rounded-xl border border-border bg-muted/30 text-sm focus:outline-none focus:border-[var(--gold)]/50" />
        <select value={form.status} onChange={e => set("status", e.target.value as BeatStatus)}
          className="px-3 py-2 rounded-xl border border-border bg-muted/30 text-sm focus:outline-none focus:border-[var(--gold)]/50">
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input value={form.client} onChange={e => set("client", e.target.value)}
          placeholder="Client / Artist"
          className="px-3 py-2 rounded-xl border border-border bg-muted/30 text-sm focus:outline-none focus:border-[var(--gold)]/50" />
        <input value={form.producedAt} onChange={e => set("producedAt", e.target.value)}
          type="date"
          className="px-3 py-2 rounded-xl border border-border bg-muted/30 text-sm focus:outline-none focus:border-[var(--gold)]/50" />
        <input value={form.notes} onChange={e => set("notes", e.target.value)}
          placeholder="Notes"
          className="col-span-2 sm:col-span-3 px-3 py-2 rounded-xl border border-border bg-muted/30 text-sm focus:outline-none focus:border-[var(--gold)]/50" />
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
          Cancel
        </button>
        <button type="submit"
          className="px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
          style={{ background: "var(--gold)", color: "oklch(0.08 0.01 85)" }}>
          Save beat
        </button>
      </div>
    </form>
  );
}

function BeatRow({
  beat, onUpdate, onDelete,
}: {
  beat: Beat;
  onUpdate: (id: number, data: Partial<Beat>) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);

  const formFromBeat = (): FormState => ({
    name:       beat.name,
    bpm:        beat.bpm?.toString() ?? "",
    key:        beat.key ?? "",
    mood:       beat.mood ?? "",
    genre:      beat.genre ?? "",
    status:     (beat.status ?? "idea") as BeatStatus,
    client:     beat.client ?? "",
    notes:      beat.notes ?? "",
    producedAt: beat.producedAt ?? "",
  });

  if (editing) {
    return (
      <div className="col-span-full">
        <BeatForm
          initial={formFromBeat()}
          onSave={f => {
            onUpdate(beat.id, {
              name: f.name, bpm: f.bpm ? parseInt(f.bpm) : null,
              key: f.key || null, mood: f.mood || null, genre: f.genre || null,
              status: f.status, client: f.client || null, notes: f.notes || null,
              producedAt: f.producedAt || null,
            });
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const status = (beat.status ?? "idea") as BeatStatus;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-2 group relative hover:border-[var(--gold)]/25 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-sm truncate flex-1">{beat.name}</p>
        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0"
          style={{ background: `${STATUS_COLOR[status]}20`, color: STATUS_COLOR[status] }}>
          {status}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {beat.bpm && <Tag>{beat.bpm} BPM</Tag>}
        {beat.key && <Tag>{beat.key}</Tag>}
        {beat.mood && <Tag>{beat.mood}</Tag>}
        {beat.genre && <Tag>{beat.genre}</Tag>}
        {beat.client && <Tag color="var(--gold)">{beat.client}</Tag>}
      </div>
      {beat.notes && <p className="text-[11px] text-muted-foreground line-clamp-2">{beat.notes}</p>}
      {beat.producedAt && (
        <p className="text-[10px] text-muted-foreground">{beat.producedAt}</p>
      )}
      <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => setEditing(true)}
          className="w-6 h-6 rounded-lg bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <Pencil className="w-3 h-3" />
        </button>
        <button onClick={() => onDelete(beat.id)}
          className="w-6 h-6 rounded-lg bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function Tag({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-muted/50 text-muted-foreground"
      style={color ? { borderColor: `${color}30`, color } : {}}>
      {children}
    </span>
  );
}

export default function BeatsPage() {
  const [beats, setBeats] = useState<Beat[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<BeatStatus | "all">("all");

  useEffect(() => {
    getBeats().then(b => { setBeats(b); setLoading(false); });
  }, []);

  async function handleCreate(f: FormState) {
    const beat = await createBeat({
      name: f.name, bpm: f.bpm ? parseInt(f.bpm) : null,
      key: f.key || null, mood: f.mood || null, genre: f.genre || null,
      status: f.status, client: f.client || null, notes: f.notes || null,
      producedAt: f.producedAt || null,
    });
    setBeats(prev => [beat, ...prev]);
    setAdding(false);
  }

  async function handleUpdate(id: number, data: Partial<Beat>) {
    await updateBeat(id, data);
    setBeats(prev => prev.map(b => b.id === id ? { ...b, ...data } : b));
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this beat?")) return;
    await deleteBeat(id);
    setBeats(prev => prev.filter(b => b.id !== id));
  }

  function exportCSV() {
    const headers = ["name", "bpm", "key", "mood", "genre", "status", "client", "producedAt", "notes"];
    const rows = beats.map(b =>
      headers.map(h => JSON.stringify((b as Record<string, unknown>)[h] ?? "")).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `beats-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const filtered = beats.filter(b => {
    const matchSearch = !search ||
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      (b.client ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (b.mood ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (b.genre ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || b.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const counts = STATUSES.reduce((acc, s) => {
    acc[s] = beats.filter(b => b.status === s).length;
    return acc;
  }, {} as Record<BeatStatus, number>);

  return (
    <ErrorBoundary label="Beat Catalog">
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <Disc3 className="w-5 h-5 text-[var(--gold)]" />
              <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-heading)" }}>Beat Catalog</h1>
            </div>
            <p className="text-xs text-muted-foreground">{beats.length} beats total · {counts.finished ?? 0} finished · {counts.sold ?? 0} sold</p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
            <button onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:scale-105"
              style={{ background: "var(--gold)", color: "oklch(0.08 0.01 85)" }}>
              <Plus className="w-4 h-4" /> Add beat
            </button>
          </div>
        </div>

        {/* Status pills */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setStatusFilter("all")}
            className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              statusFilter === "all" ? "bg-[var(--gold-muted)] border-[var(--gold)]/30 text-[var(--gold)]" : "border-border text-muted-foreground hover:text-foreground")}>
            All ({beats.length})
          </button>
          {STATUSES.map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                statusFilter === s ? "border-transparent" : "border-border text-muted-foreground hover:text-foreground")}
              style={statusFilter === s ? { background: `${STATUS_COLOR[s]}20`, color: STATUS_COLOR[s], borderColor: `${STATUS_COLOR[s]}40` } : {}}>
              {s} ({counts[s] ?? 0})
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search beats by name, client, mood, genre…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-muted/30 text-sm focus:outline-none focus:border-[var(--gold)]/50 focus:ring-1 focus:ring-[var(--gold)]/20" />
        </div>

        {/* Add form */}
        {adding && (
          <BeatForm onSave={handleCreate} onCancel={() => setAdding(false)} />
        )}

        {/* Grid */}
        {loading ? (
          <RowSkeleton count={6} />
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-12 text-center">
            <Music2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {beats.length === 0 ? "No beats yet. Hit \"Add beat\" to start your catalog." : "No beats match your search."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(b => (
              <BeatRow key={b.id} beat={b} onUpdate={handleUpdate} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
