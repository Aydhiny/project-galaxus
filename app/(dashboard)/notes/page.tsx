"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { StickyNote, Plus, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface Note {
  id: string;
  title: string;
  content: string;
  category: string;
  createdAt: string;
}

const STORAGE_KEY = "galaxus-notes";

const CATEGORIES = ["General", "Ideas", "Workout", "Music", "Learning", "Random"] as const;

const CATEGORY_COLORS: Record<string, string> = {
  General: "bg-foreground/[0.10] text-white/60",
  Ideas: "bg-[var(--gold)]/15 text-[var(--gold)]",
  Workout: "bg-orange-500/15 text-orange-400",
  Music: "bg-purple-500/15 text-purple-400",
  Learning: "bg-[var(--emerald)]/15 text-[var(--emerald)]",
  Random: "bg-blue-500/15 text-blue-400",
};

function loadNotes(): Note[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Note[]) : [];
  } catch {
    return [];
  }
}

function saveNotes(notes: Note[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function newNote(): Note {
  return {
    id: crypto.randomUUID(),
    title: "Untitled",
    content: "",
    category: "General",
    createdAt: new Date().toISOString(),
  };
}

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load on mount
  useEffect(() => {
    const loaded = loadNotes();
    setNotes(loaded);
    if (loaded.length > 0) setActiveId(loaded[0].id);
  }, []);

  const activeNote = notes.find((n) => n.id === activeId) ?? null;

  const filtered = notes
    .filter((n) => {
      const q = search.toLowerCase();
      return (
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.category.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  function createNote() {
    const note = newNote();
    const updated = [note, ...notes];
    setNotes(updated);
    saveNotes(updated);
    setActiveId(note.id);
  }

  const handleField = useCallback(
    (field: keyof Note, value: string) => {
      if (!activeId) return;
      const updated = notes.map((n) =>
        n.id === activeId ? { ...n, [field]: value } : n
      );
      setNotes(updated);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        saveNotes(updated);
      }, 500);
    },
    [activeId, notes]
  );

  function deleteNote(id: string) {
    const updated = notes.filter((n) => n.id !== id);
    setNotes(updated);
    saveNotes(updated);
    setConfirmDelete(null);
    if (activeId === id) {
      setActiveId(updated.length > 0 ? updated[0].id : null);
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] max-h-[900px] overflow-hidden rounded-2xl border border-border bg-card m-6">
      {/* Left sidebar — note list */}
      <div className="w-72 shrink-0 border-r border-border flex flex-col">
        {/* Sidebar header */}
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="section-label mb-0.5">Brain Dump</p>
              <h1 className="text-sm font-bold heading-gradient" style={{ fontFamily: "var(--font-heading)" }}>Notes</h1>
            </div>
            <Button
              onClick={createNote}
              size="sm"
              className="h-8 w-8 p-0 bg-[var(--gold)] hover:bg-[var(--gold)]/90 text-[oklch(0.08_0.01_85)] rounded-lg"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes…"
              className="pl-8 h-8 text-xs"
            />
          </div>
        </div>

        {/* Note list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground px-4">
              <StickyNote className="w-8 h-8 mb-2 opacity-20" />
              <p className="text-xs">
                {notes.length === 0
                  ? "No notes yet. Hit + to start."
                  : "No notes match your search."}
              </p>
            </div>
          ) : (
            filtered.map((note) => (
              <button
                key={note.id}
                onClick={() => setActiveId(note.id)}
                className={cn(
                  "w-full text-left p-3 rounded-xl transition-all duration-150 space-y-1",
                  activeId === note.id
                    ? "bg-[var(--gold)]/10 border border-[var(--gold)]/25"
                    : "hover:bg-accent border border-transparent"
                )}
              >
                <p className="text-xs font-semibold truncate">{note.title}</p>
                <p className="text-[10px] text-muted-foreground truncate leading-relaxed">
                  {note.content || "Empty note"}
                </p>
                <div className="flex items-center justify-between pt-0.5">
                  <Badge
                    className={cn(
                      "text-[9px] px-1.5 py-0 rounded-md border-0",
                      CATEGORY_COLORS[note.category] ?? "bg-foreground/[0.10] text-white/60"
                    )}
                  >
                    {note.category}
                  </Badge>
                  <span className="text-[9px] text-muted-foreground">
                    {format(new Date(note.createdAt), "MMM d")}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeNote ? (
          <>
            {/* Editor toolbar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="space-y-0.5">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-widest">Category</Label>
                  <Select
                    value={activeNote.category}
                    onValueChange={(v) => v && handleField("category", v)}
                  >
                    <SelectTrigger className="h-7 w-36 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat} className="text-xs">
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">
                  Auto-saved · {format(new Date(activeNote.createdAt), "MMM d, yyyy")}
                </span>
                {confirmDelete === activeNote.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-400">Delete?</span>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-xs px-2"
                      onClick={() => deleteNote(activeNote.id)}
                    >
                      Yes
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs px-2"
                      onClick={() => setConfirmDelete(null)}
                    >
                      No
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(activeNote.id)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Title */}
            <div className="px-6 pt-5">
              <input
                type="text"
                value={activeNote.title}
                onChange={(e) => handleField("title", e.target.value)}
                placeholder="Note title…"
                className="w-full bg-transparent text-2xl font-bold outline-none placeholder:text-muted-foreground/40 border-none"
              />
            </div>

            {/* Content */}
            <div className="flex-1 px-6 pb-6 pt-3 overflow-hidden">
              <Textarea
                value={activeNote.content}
                onChange={(e) => handleField("content", e.target.value)}
                placeholder="Start writing…"
                className="w-full h-full resize-none bg-transparent border-none outline-none text-sm leading-relaxed text-foreground/80 placeholder:text-muted-foreground/30 focus-visible:ring-0 p-0"
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <StickyNote className="w-12 h-12 mb-3 opacity-15" />
            <p className="font-medium text-sm">No note selected</p>
            <p className="text-xs mt-1">Create a note or select one from the list.</p>
            <Button
              onClick={createNote}
              className="mt-4 bg-[var(--gold)] hover:bg-[var(--gold)]/90 text-[oklch(0.08_0.01_85)] font-semibold rounded-xl gap-2"
            >
              <Plus className="w-4 h-4" /> New Note
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
