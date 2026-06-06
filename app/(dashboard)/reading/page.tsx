"use client";

import { useState, useTransition, useEffect } from "react";
import {
  getBooks,
  addBook,
  updateBookProgress,
  markBookComplete,
  deleteBook,
  getMonthlyReadingStats,
} from "@/lib/actions/books";
import type { Book } from "@/lib/db/schema";
import { toast } from "sonner";
import { BookOpen, Plus, Trash2, CheckCircle, Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

const COVER_COLORS = [
  "#C9A84C", "#10B981", "#7C3AED", "#3B82F6", "#EF4444", "#F97316", "#EC4899",
];

const MONTHLY_GOAL = 2;

export default function ReadingPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [stats, setStats] = useState({ completedThisMonth: 0, totalCompleted: 0, currentlyReading: 0, planned: 0 });
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", author: "", pagesTotal: "", status: "reading", coverColor: COVER_COLORS[0] });
  const [pending, startTransition] = useTransition();

  function reload() {
    startTransition(async () => {
      const [b, s] = await Promise.all([getBooks(), getMonthlyReadingStats()]);
      setBooks(b);
      setStats(s);
    });
  }

  useEffect(() => { reload(); }, []);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await addBook({
        title: form.title,
        author: form.author || undefined,
        pagesTotal: form.pagesTotal ? Number(form.pagesTotal) : undefined,
        status: form.status,
        coverColor: form.coverColor,
      });
      setForm({ title: "", author: "", pagesTotal: "", status: "reading", coverColor: COVER_COLORS[0] });
      setShowAdd(false);
      toast.success(`"${form.title}" added! 📚`);
      reload();
    });
  }

  const reading = books.filter((b) => b.status === "reading");
  const completed = books.filter((b) => b.status === "completed");
  const planned = books.filter((b) => b.status === "planned");

  const monthPct = Math.min((stats.completedThisMonth / MONTHLY_GOAL) * 100, 100);

  return (
    <div className="p-6 space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Reading</p>
          <h1 className="text-xl font-bold mt-0.5">Your Library</h1>
        </div>
        <Button
          onClick={() => setShowAdd(!showAdd)}
          className="bg-[var(--gold)] hover:bg-[var(--gold)]/90 text-[oklch(0.08_0.01_85)] font-semibold rounded-xl gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Book
        </Button>
      </div>

      {/* Monthly goal */}
      <div className="rounded-2xl border border-[var(--gold)]/20 bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">Monthly Goal</p>
            <p className="text-sm font-semibold mt-0.5">
              {stats.completedThisMonth} / {MONTHLY_GOAL} books this month
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-[var(--gold)]">{stats.totalCompleted}</p>
            <p className="text-xs text-muted-foreground">total read</p>
          </div>
        </div>
        <div className="h-2 rounded-full bg-white/6 overflow-hidden">
          <div
            className="h-full rounded-full progress-bar transition-all duration-700"
            style={{ width: `${monthPct}%` }}
          />
        </div>
        {stats.completedThisMonth >= MONTHLY_GOAL && (
          <p className="text-xs text-[var(--gold)] mt-2 flex items-center gap-1">
            <Star className="w-3 h-3" /> Monthly goal reached! Excellent work.
          </p>
        )}
      </div>

      {/* Add book form */}
      {showAdd && (
        <div className="rounded-2xl border border-[var(--gold)]/20 bg-card p-6">
          <h2 className="font-semibold mb-4">Add New Book</h2>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <Label className="text-xs text-muted-foreground uppercase tracking-widest">Title *</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Book title"
                  required
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <Label className="text-xs text-muted-foreground uppercase tracking-widest">Author</Label>
                <Input
                  value={form.author}
                  onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
                  placeholder="Author name"
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-widest">Pages</Label>
                <Input
                  type="number"
                  value={form.pagesTotal}
                  onChange={(e) => setForm((f) => ({ ...f, pagesTotal: e.target.value }))}
                  placeholder="Total pages"
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-widest">Status</Label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full h-10 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-foreground focus:outline-none focus:border-[var(--gold)]/40"
                >
                  <option value="reading">Reading now</option>
                  <option value="planned">Want to read</option>
                  <option value="completed">Already read</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-widest">Cover Color</Label>
              <div className="flex gap-2">
                {COVER_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, coverColor: c }))}
                    className={`w-7 h-7 rounded-full border-2 transition-transform ${
                      form.coverColor === c ? "border-white scale-110" : "border-transparent"
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={pending}
                className="bg-[var(--gold)] hover:bg-[var(--gold)]/90 text-[oklch(0.08_0.01_85)] font-semibold rounded-xl"
              >
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add Book"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowAdd(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Currently Reading */}
      {reading.length > 0 && (
        <Section title="Currently Reading" emoji="📖" count={reading.length}>
          <div className="space-y-3">
            {reading.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onDelete={() => {
                  startTransition(async () => {
                    await deleteBook(book.id);
                    reload();
                  });
                }}
                onProgress={(p) => {
                  startTransition(async () => {
                    await updateBookProgress(book.id, p);
                    reload();
                  });
                }}
                onComplete={() => {
                  startTransition(async () => {
                    await markBookComplete(book.id, 5);
                    toast.success(`Finished "${book.title}"! 🎉`);
                    reload();
                  });
                }}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Want to read */}
      {planned.length > 0 && (
        <Section title="Want to Read" emoji="📋" count={planned.length}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {planned.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onDelete={() => {
                  startTransition(async () => {
                    await deleteBook(book.id);
                    reload();
                  });
                }}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <Section title="Completed" emoji="✅" count={completed.length}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {completed.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onDelete={() => {
                  startTransition(async () => {
                    await deleteBook(book.id);
                    reload();
                  });
                }}
              />
            ))}
          </div>
        </Section>
      )}

      {books.length === 0 && !showAdd && (
        <div className="text-center py-20 text-muted-foreground">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No books yet</p>
          <p className="text-sm mt-1">Add your first book to start tracking your reading journey.</p>
        </div>
      )}
    </div>
  );
}

function Section({ title, emoji, count, children }: { title: string; emoji: string; count: number; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span>{emoji}</span>
        <h2 className="font-semibold text-sm">{title}</h2>
        <Badge variant="secondary" className="text-xs">{count}</Badge>
      </div>
      {children}
    </div>
  );
}

function BookCard({
  book,
  onDelete,
  onProgress,
  onComplete,
}: {
  book: Book;
  onDelete: () => void;
  onProgress?: (p: number) => void;
  onComplete?: () => void;
}) {
  const pct =
    book.pagesTotal && book.pagesRead != null
      ? Math.round((book.pagesRead / book.pagesTotal) * 100)
      : null;

  return (
    <div className="rounded-xl border border-white/6 bg-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        {/* Cover spine */}
        <div
          className="w-1.5 rounded-full shrink-0 self-stretch"
          style={{ background: book.coverColor ?? "#C9A84C" }}
        />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{book.title}</p>
          {book.author && (
            <p className="text-xs text-muted-foreground">{book.author}</p>
          )}
          {book.completedAt && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Finished {format(new Date(book.completedAt), "MMM d, yyyy")}
            </p>
          )}
        </div>
        <button
          onClick={onDelete}
          className="text-muted-foreground hover:text-red-400 transition-colors p-1 shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {book.status === "reading" && book.pagesTotal != null && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">
              Page {book.pagesRead} of {book.pagesTotal}
            </span>
            <span style={{ color: book.coverColor ?? "#C9A84C" }}>{pct}%</span>
          </div>
          <div className="h-1 rounded-full bg-white/6 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                background: book.coverColor ?? "#C9A84C",
              }}
            />
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              max={book.pagesTotal}
              defaultValue={book.pagesRead ?? 0}
              onBlur={(e) => onProgress?.(Number(e.target.value))}
              className="w-20 h-7 rounded-lg bg-white/5 border border-white/8 px-2 text-xs text-center focus:outline-none focus:border-[var(--gold)]/40"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={onComplete}
              className="h-7 text-xs text-[var(--emerald)] hover:text-[var(--emerald)] gap-1"
            >
              <CheckCircle className="w-3 h-3" /> Done
            </Button>
          </div>
        </div>
      )}

      {book.rating != null && (
        <div className="flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className="w-3 h-3"
              style={{ color: i < (book.rating ?? 0) ? "#C9A84C" : "oklch(1 0 0 / 15%)" }}
              fill={i < (book.rating ?? 0) ? "#C9A84C" : "transparent"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
