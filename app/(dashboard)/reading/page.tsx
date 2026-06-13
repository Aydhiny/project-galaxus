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
import { getReadingSessions, addReadingSession, deleteReadingSession, getAllReadingSessions } from "@/lib/actions/reading-sessions";
import { getBookContent, upsertBookContent } from "@/lib/actions/book-content";
import type { Book, ReadingSession, BookContent } from "@/lib/db/schema";
import { toast } from "sonner";
import { BookOpen, Plus, Trash2, CheckCircle, Loader2, Star, Bookmark, CheckCircle2, Upload, Clock, TrendingUp, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { format, differenceInDays } from "date-fns";
import PomodoroTimer from "@/components/pomodoro-timer";

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
  const [allSessions, setAllSessions] = useState<ReadingSession[]>([]);
  const [sessionForm, setSessionForm] = useState({ bookId: "", date: format(new Date(), "yyyy-MM-dd"), minutesRead: "", pagesRead: "", startPage: "", endPage: "" });
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [uploading, setUploading] = useState<number | null>(null);
  const [bookContentMap, setBookContentMap] = useState<Record<number, BookContent>>({});

  function reload() {
    startTransition(async () => {
      const [b, s, sess] = await Promise.all([getBooks(), getMonthlyReadingStats(), getAllReadingSessions()]);
      setBooks(b);
      setStats(s);
      setAllSessions(sess);
    });
  }

  useEffect(() => { reload(); }, []);

  async function handleAddSession(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionForm.bookId || !sessionForm.minutesRead) return;
    await addReadingSession({
      bookId: parseInt(sessionForm.bookId),
      date: sessionForm.date,
      minutesRead: parseInt(sessionForm.minutesRead),
      pagesRead: sessionForm.pagesRead ? parseInt(sessionForm.pagesRead) : 0,
      startPage: sessionForm.startPage ? parseInt(sessionForm.startPage) : undefined,
      endPage: sessionForm.endPage ? parseInt(sessionForm.endPage) : undefined,
    });
    toast.success("Reading session logged!");
    setShowSessionForm(false);
    setSessionForm({ bookId: "", date: format(new Date(), "yyyy-MM-dd"), minutesRead: "", pagesRead: "", startPage: "", endPage: "" });
    reload();
  }

  async function handleUpload(bookId: number, file: File) {
    setUploading(bookId);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) { toast.error("Upload failed"); return; }
      const data = await res.json();
      await upsertBookContent({ bookId, fileUrl: data.url, fileType: "pdf", fileName: data.fileName, fileSize: data.fileSize });
      const content = await getBookContent(bookId);
      if (content) setBookContentMap(m => ({ ...m, [bookId]: content }));
      toast.success("Book uploaded!");
    } catch { toast.error("Upload failed"); }
    finally { setUploading(null); }
  }

  // Reading pace: avg pages/min across all sessions
  const totalPagesLogged = allSessions.reduce((s, r) => s + (r.pagesRead ?? 0), 0);
  const totalMinsLogged = allSessions.reduce((s, r) => s + (r.minutesRead ?? 0), 0);
  const pacePerHour = totalMinsLogged > 0 ? Math.round((totalPagesLogged / totalMinsLogged) * 60) : 0;
  const totalHoursRead = Math.round(totalMinsLogged / 60 * 10) / 10;

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
      toast.success(`"${form.title}" added`);
      reload();
    });
  }

  const reading = books.filter((b) => b.status === "reading");
  const completed = books.filter((b) => b.status === "completed");
  const planned = books.filter((b) => b.status === "planned");

  const monthPct = Math.min((stats.completedThisMonth / MONTHLY_GOAL) * 100, 100);

  return (
    <div className="page max-w-4xl">
      {/* Pomodoro timer */}
      <PomodoroTimer />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="section-label mb-1">Reading</p>
          <h1 className="text-2xl font-bold heading-gradient" style={{ fontFamily: "var(--font-heading)" }}>Your Library</h1>
        </div>
        <Button
          onClick={() => setShowAdd(!showAdd)}
          className="] font-semibold rounded-xl gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Book
        </Button>
      </div>

      {/* Monthly goal */}
      <div className="glass p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="section-label mb-1">Monthly Goal</p>
            <p className="text-sm font-semibold mt-0.5">
              {stats.completedThisMonth} / {MONTHLY_GOAL} books this month
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-[var(--gold)]">{stats.totalCompleted}</p>
            <p className="text-xs text-muted-foreground">total read</p>
          </div>
        </div>
        <div className="h-2 rounded-full bg-foreground/[0.06] overflow-hidden">
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

      {/* Reading Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass p-4 text-center">
          <p className="text-2xl font-bold text-[var(--gold)]">{totalHoursRead}h</p>
          <p className="text-xs text-muted-foreground mt-1">Total read</p>
        </div>
        <div className="glass p-4 text-center">
          <p className="text-2xl font-bold">{pacePerHour}</p>
          <p className="text-xs text-muted-foreground mt-1">Pages / hour</p>
        </div>
        <div className="glass p-4 text-center">
          <p className="text-2xl font-bold text-[var(--emerald)]">{allSessions.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Sessions</p>
        </div>
      </div>

      {/* Session Logger */}
      <div className="glass p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" /> Reading Sessions
          </h2>
          <button
            onClick={() => setShowSessionForm(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
            style={{ background: "var(--gold)", color: "oklch(0.08 0.01 85)" }}
          >
            <Plus className="w-3.5 h-3.5" /> Log session
          </button>
        </div>

        {showSessionForm && (
          <form onSubmit={handleAddSession} className="rounded-xl border border-[var(--gold)]/25 bg-card p-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <select value={sessionForm.bookId} required
                onChange={e => setSessionForm(f => ({ ...f, bookId: e.target.value }))}
                className="col-span-2 sm:col-span-3 px-3 py-2 rounded-xl border border-border bg-muted/30 text-sm focus:outline-none focus:border-[var(--gold)]/50">
                <option value="">Select book *</option>
                {books.filter(b => b.status === "reading").map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
              </select>
              <input type="date" value={sessionForm.date}
                onChange={e => setSessionForm(f => ({ ...f, date: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-border bg-muted/30 text-sm focus:outline-none focus:border-[var(--gold)]/50" />
              <input type="number" placeholder="Minutes *" required min="1"
                value={sessionForm.minutesRead}
                onChange={e => setSessionForm(f => ({ ...f, minutesRead: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-border bg-muted/30 text-sm focus:outline-none focus:border-[var(--gold)]/50" />
              <input type="number" placeholder="Pages read"
                value={sessionForm.pagesRead}
                onChange={e => setSessionForm(f => ({ ...f, pagesRead: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-border bg-muted/30 text-sm focus:outline-none focus:border-[var(--gold)]/50" />
              <input type="number" placeholder="Start page"
                value={sessionForm.startPage}
                onChange={e => setSessionForm(f => ({ ...f, startPage: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-border bg-muted/30 text-sm focus:outline-none focus:border-[var(--gold)]/50" />
              <input type="number" placeholder="End page"
                value={sessionForm.endPage}
                onChange={e => setSessionForm(f => ({ ...f, endPage: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-border bg-muted/30 text-sm focus:outline-none focus:border-[var(--gold)]/50" />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowSessionForm(false)}
                className="px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-accent transition-colors">Cancel</button>
              <button type="submit" className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: "var(--gold)", color: "oklch(0.08 0.01 85)" }}>Save</button>
            </div>
          </form>
        )}

        {allSessions.slice(0, 6).map(s => {
          const book = books.find(b => b.id === s.bookId);
          return (
            <div key={s.id} className="flex items-center gap-2 text-xs group">
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: book?.coverColor ?? "var(--gold)" }} />
              <span className="text-muted-foreground w-16 shrink-0">{s.date}</span>
              <span className="font-semibold">{s.minutesRead}m</span>
              {s.pagesRead ? <span className="text-muted-foreground">· {s.pagesRead}p</span> : null}
              {book && <span className="text-muted-foreground flex-1 truncate">{book.title}</span>}
              <button onClick={() => deleteReadingSession(s.id).then(reload)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all ml-auto">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Add book form */}
      {showAdd && (
        <div className="glass p-6">
          <h2 className="font-semibold mb-4">Add New Book</h2>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <Label className="section-label mb-1">Title *</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Book title"
                  required
                  className="bg-foreground/[0.05] border-border"
                />
              </div>
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <Label className="section-label mb-1">Author</Label>
                <Input
                  value={form.author}
                  onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
                  placeholder="Author name"
                  className="bg-foreground/[0.05] border-border"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="section-label mb-1">Pages</Label>
                <Input
                  type="number"
                  value={form.pagesTotal}
                  onChange={(e) => setForm((f) => ({ ...f, pagesTotal: e.target.value }))}
                  placeholder="Total pages"
                  className="bg-foreground/[0.05] border-border"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="section-label mb-1">Status</Label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full h-10 rounded-lg bg-foreground/[0.05] border border-border px-3 text-sm text-foreground focus:outline-none focus:border-[var(--gold)]/40"
                >
                  <option value="reading">Reading now</option>
                  <option value="planned">Want to read</option>
                  <option value="completed">Already read</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="section-label mb-1">Cover Color</Label>
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
                className="] font-semibold rounded-xl"
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
        <Section title="Currently Reading" icon={<BookOpen className="w-4 h-4" />} count={reading.length}>
          <div className="space-y-3">
            {reading.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                sessions={allSessions.filter(s => s.bookId === book.id)}
                onDelete={() => { startTransition(async () => { await deleteBook(book.id); reload(); }); }}
                onProgress={(p) => { startTransition(async () => { await updateBookProgress(book.id, p); reload(); }); }}
                onComplete={() => { startTransition(async () => { await markBookComplete(book.id, 5); toast.success(`Finished "${book.title}"!`); reload(); }); }}
                onUpload={(file) => handleUpload(book.id, file)}
                uploading={uploading === book.id}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Want to read */}
      {planned.length > 0 && (
        <Section title="Want to Read" icon={<Bookmark className="w-4 h-4" />} count={planned.length}>
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
        <Section title="Completed" icon={<CheckCircle2 className="w-4 h-4" />} count={completed.length}>
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

function Section({ title, icon, count, children }: { title: string; icon: React.ReactNode; count: number; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
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
  onUpload,
  uploading,
  sessions,
}: {
  book: Book;
  onDelete: () => void;
  onProgress?: (p: number) => void;
  onComplete?: () => void;
  onUpload?: (file: File) => void;
  uploading?: boolean;
  sessions?: ReadingSession[];
}) {
  const pct =
    book.pagesTotal && book.pagesRead != null
      ? Math.round((book.pagesRead / book.pagesTotal) * 100)
      : null;

  // Projected finish date based on avg pages/session
  let projectedFinish: string | null = null;
  if (sessions && sessions.length >= 2 && book.pagesTotal && book.pagesRead != null) {
    const pagesPerSession = sessions.reduce((s, r) => s + (r.pagesRead ?? 0), 0) / sessions.length;
    if (pagesPerSession > 0) {
      const remaining = book.pagesTotal - book.pagesRead;
      const sessionsNeeded = Math.ceil(remaining / pagesPerSession);
      const minPerSession = sessions.reduce((s, r) => s + (r.minutesRead ?? 0), 0) / sessions.length;
      const daysNeeded = Math.ceil((sessionsNeeded * minPerSession) / 60 / 1.5);
      const d = new Date();
      d.setDate(d.getDate() + daysNeeded);
      projectedFinish = format(d, "MMM d");
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-1.5 rounded-full shrink-0 self-stretch" style={{ background: book.coverColor ?? "#C9A84C" }} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{book.title}</p>
          {book.author && <p className="text-xs text-muted-foreground">{book.author}</p>}
          {book.completedAt && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Finished {format(new Date(book.completedAt), "MMM d, yyyy")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onUpload && (
            <label className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors p-1">
              {uploading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Upload className="w-3.5 h-3.5" />}
              <input type="file" accept=".pdf" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
            </label>
          )}
          <a href={`/book-reader/${book.id}`} target="_blank" rel="noopener noreferrer"
            className="text-muted-foreground hover:text-[var(--gold)] transition-colors p-1"
            title="Open in reader">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button onClick={onDelete} className="text-muted-foreground hover:text-red-400 transition-colors p-1">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {book.status === "reading" && book.pagesTotal != null && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Page {book.pagesRead} of {book.pagesTotal}</span>
            <div className="flex items-center gap-2">
              {projectedFinish && (
                <span className="text-muted-foreground/60">est. {projectedFinish}</span>
              )}
              <span style={{ color: book.coverColor ?? "#C9A84C" }}>{pct}%</span>
            </div>
          </div>
          <div className="h-1 rounded-full bg-foreground/[0.06] overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: book.coverColor ?? "#C9A84C" }} />
          </div>
          <div className="flex gap-2">
            <input type="number" min={0} max={book.pagesTotal} defaultValue={book.pagesRead ?? 0}
              onBlur={(e) => onProgress?.(Number(e.target.value))}
              className="w-20 h-7 rounded-lg bg-foreground/[0.05] border border-border px-2 text-xs text-center focus:outline-none focus:border-[var(--gold)]/40" />
            <Button size="sm" variant="ghost" onClick={onComplete}
              className="h-7 text-xs text-[var(--emerald)] hover:text-[var(--emerald)] gap-1">
              <CheckCircle className="w-3 h-3" /> Done
            </Button>
          </div>
        </div>
      )}

      {book.rating != null && (
        <div className="flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className="w-3 h-3"
              style={{ color: i < (book.rating ?? 0) ? "#C9A84C" : "oklch(1 0 0 / 15%)" }}
              fill={i < (book.rating ?? 0) ? "#C9A84C" : "transparent"} />
          ))}
        </div>
      )}
    </div>
  );
}
