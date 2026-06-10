"use client";

import { useState, useEffect, useTransition } from "react";
import {
  getJournalEntries,
  addJournalEntry,
  deleteJournalEntry,
} from "@/lib/actions/journal";
import type { JournalEntry } from "@/lib/db/schema";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, NotebookPen, Heart, PenLine, Frown, Minus, Smile, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";

const MOOD_ICONS = [null, Frown, Minus, Smile, Heart, Star];
const MOOD_COLORS = ["", "oklch(0.62 0.22 26)", "oklch(0.70 0.19 32)", "oklch(0.72 0.14 78)", "var(--emerald)", "var(--gold)"];

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [tab, setTab] = useState<"gratitude" | "writing">("gratitude");
  const [content, setContent] = useState("");
  const [mood, setMood] = useState(3);
  const [showForm, setShowForm] = useState(false);
  const [pending, startTransition] = useTransition();

  function reload() {
    startTransition(async () => {
      const data = await getJournalEntries();
      setEntries(await data);
    });
  }

  useEffect(() => { reload(); }, []);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    startTransition(async () => {
      await addJournalEntry({ type: tab, content, mood });
      toast.success(tab === "gratitude" ? "Gratitude logged" : "Entry written");
      setContent(""); setMood(3); setShowForm(false);
      reload();
    });
  }

  const tabEntries = entries.filter((e) => e.type === tab);

  let streak = 0;
  const seen = new Set<string>();
  const sortedDates = [...new Set(tabEntries.map((e) => e.date))].sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime()
  );
  for (const d of sortedDates) {
    if (!seen.has(d)) {
      seen.add(d);
      streak++;
    }
  }

  return (
    <div className="p-6 space-y-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Journal</p>
          <h1 className="text-xl font-bold mt-0.5">Your Inner World</h1>
        </div>
        <Button
          onClick={() => setShowForm(!showForm)}
          className="bg-[var(--gold)] hover:bg-[var(--gold)]/90 text-[oklch(0.08_0.01_85)] font-semibold rounded-xl gap-2"
        >
          <Plus className="w-4 h-4" /> New Entry
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/6 w-fit">
        {(["gratitude", "writing"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t
                ? "bg-[var(--gold)] text-[oklch(0.08_0.01_85)]"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "gratitude" ? <Heart className="w-3.5 h-3.5" /> : <PenLine className="w-3.5 h-3.5" />}
            {t === "gratitude" ? "Gratitude" : "Writing"}
          </button>
        ))}
      </div>

      {/* Streak */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-white/6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--gold-muted)]">
          {tab === "gratitude" ? <Heart className="w-5 h-5 text-[var(--gold)]" /> : <PenLine className="w-5 h-5 text-[var(--gold)]" />}
        </div>
        <div>
          <p className="font-semibold text-[var(--gold)]">{streak} day streak</p>
          <p className="text-xs text-muted-foreground">
            {tabEntries.length} total {tab} entries
          </p>
        </div>
      </div>

      {/* New entry form */}
      {showForm && (
        <div className="rounded-2xl border border-[var(--gold)]/20 bg-card p-6">
          <h2 className="font-semibold mb-4">
            {tab === "gratitude" ? "What are you grateful for today?" : "Write freely..."}
          </h2>
          <form onSubmit={handleAdd} className="space-y-4">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                tab === "gratitude"
                  ? "Today I am grateful for..."
                  : "My thoughts today..."
              }
              rows={6}
              className="bg-white/5 border-white/10 focus:border-[var(--gold)]/40 resize-none text-sm"
              required
            />

            {tab === "gratitude" && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-widest">Today&apos;s Mood</p>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((m) => {
                    const Icon = MOOD_ICONS[m]!;
                    const color = MOOD_COLORS[m];
                    return (
                      <button key={m} type="button" onClick={() => setMood(m)}
                        className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all ${
                          mood === m ? "scale-110 border-transparent" : "border-border opacity-50 hover:opacity-80 bg-card"
                        }`}
                        style={mood === m ? { background: color, color: "white" } : { color }}>
                        <Icon className="w-5 h-5" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={pending}
                className="bg-[var(--gold)] hover:bg-[var(--gold)]/90 text-[oklch(0.08_0.01_85)] font-semibold rounded-xl"
              >
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Entry"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Entries list */}
      {tabEntries.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <NotebookPen className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No {tab} entries yet</p>
          <p className="text-sm mt-1">
            {tab === "gratitude"
              ? "Gratitude rewires your brain for positivity. Start today."
              : "Writing clarifies thinking. Capture your thoughts."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tabEntries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-xl border border-white/6 bg-card p-5 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <p className="text-[11px] text-muted-foreground">
                    {format(new Date(entry.createdAt!), "EEEE, MMMM d · h:mm a")}
                  </p>
                  {entry.mood != null && entry.type === "gratitude" && (() => {
                    const Icon = MOOD_ICONS[entry.mood];
                    const color = MOOD_COLORS[entry.mood];
                    if (!Icon) return null;
                    return <Icon className="w-4 h-4" style={{ color }} />;
                  })()}
                </div>
                <button
                  onClick={() =>
                    startTransition(async () => {
                      await deleteJournalEntry(entry.id);
                      reload();
                    })
                  }
                  className="text-muted-foreground hover:text-red-400 transition-colors p-1 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{entry.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
