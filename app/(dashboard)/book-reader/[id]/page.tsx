"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { getBooks } from "@/lib/actions/books";
import { getBookContent } from "@/lib/actions/book-content";
import { getBookmarks, addBookmark, deleteBookmark } from "@/lib/actions/bookmarks";
import { addReadingSession } from "@/lib/actions/reading-sessions";
import { updateBookProgress } from "@/lib/actions/books";
import type { Book, BookContent, Bookmark } from "@/lib/db/schema";
import { format } from "date-fns";
import { Bookmark as BookmarkIcon, Plus, Trash2, Clock, ChevronLeft, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export default function BookReaderPage() {
  const params = useParams();
  const bookId = parseInt(params.id as string);

  const [book, setBook] = useState<Book | null>(null);
  const [content, setContent] = useState<BookContent | null>(null);
  const [bookmarks, setBookmarksState] = useState<Bookmark[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [newBookmarkNote, setNewBookmarkNote] = useState("");
  const [showBookmarks, setShowBookmarks] = useState(false);

  const startTimeRef = useRef<number>(Date.now());
  const startPageRef = useRef<number>(1);

  useEffect(() => {
    (async () => {
      const [books, bContent, bms] = await Promise.all([
        getBooks(),
        getBookContent(bookId),
        getBookmarks(bookId),
      ]);
      const b = books.find(x => x.id === bookId) ?? null;
      setBook(b);
      setContent(bContent);
      setBookmarksState(bms);
      if (b?.pagesRead) { setCurrentPage(b.pagesRead); startPageRef.current = b.pagesRead; }
    })();

    // Save reading session when leaving
    return () => {
      const mins = Math.round((Date.now() - startTimeRef.current) / 60000);
      if (mins < 1) return;
    };
  }, [bookId]);

  async function saveSession() {
    const mins = Math.round((Date.now() - startTimeRef.current) / 60000);
    if (mins < 1) { toast.error("Read for at least 1 minute to log a session"); return; }
    const pagesRead = currentPage - startPageRef.current;
    await addReadingSession({
      bookId,
      date: format(new Date(), "yyyy-MM-dd"),
      minutesRead: mins,
      pagesRead: Math.max(0, pagesRead),
      startPage: startPageRef.current,
      endPage: currentPage,
    });
    if (pagesRead > 0) await updateBookProgress(bookId, currentPage);
    startTimeRef.current = Date.now();
    startPageRef.current = currentPage;
    toast.success(`Session saved: ${mins}m${pagesRead > 0 ? `, ${pagesRead} pages` : ""}`);
  }

  async function handleAddBookmark() {
    const bm = await addBookmark({ bookId, page: currentPage, note: newBookmarkNote || undefined });
    setBookmarksState(prev => [...prev, bm].sort((a, b) => a.page - b.page));
    setNewBookmarkNote("");
    toast.success(`Bookmark added at page ${currentPage}`);
  }

  async function handleDeleteBookmark(id: number) {
    await deleteBookmark(id);
    setBookmarksState(prev => prev.filter(b => b.id !== id));
  }

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000)), 1000);
    return () => clearInterval(iv);
  }, []);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  if (!content && book) {
    return (
      <div className="page max-w-3xl">
        <Link href="/reading" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Library
        </Link>
        <div className="glass p-12 text-center space-y-4">
          <BookmarkIcon className="w-12 h-12 text-muted-foreground/30 mx-auto" />
          <p className="font-semibold">{book.title}</p>
          <p className="text-sm text-muted-foreground">No file uploaded yet. Go to the Reading page and upload a PDF.</p>
          <Link href="/reading"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: "var(--gold)", color: "oklch(0.08 0.01 85)" }}>
            Upload PDF
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-background/95 backdrop-blur-sm shrink-0">
        <Link href="/reading" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <p className="font-semibold text-sm truncate flex-1">{book?.title}</p>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-foreground/[0.05] px-2.5 py-1.5 rounded-lg">
          <Clock className="w-3.5 h-3.5" />
          <span className="tabular-nums">{mins}:{String(secs).padStart(2, "0")}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <input
            type="number"
            value={currentPage}
            onChange={e => setCurrentPage(Number(e.target.value))}
            min={1}
            className="w-14 text-center text-xs bg-foreground/[0.05] border border-border rounded-lg px-2 py-1.5 focus:outline-none"
          />
          <span className="text-xs text-muted-foreground">/ {book?.pagesTotal ?? "?"}</span>
        </div>

        <button onClick={() => setShowBookmarks(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
          <BookmarkIcon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Bookmarks ({bookmarks.length})</span>
        </button>

        <button onClick={saveSession}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
          style={{ background: "var(--gold)", color: "oklch(0.08 0.01 85)" }}>
          <Clock className="w-3.5 h-3.5" /> Save session
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* PDF Viewer */}
        {content && (
          <iframe
            src={`${content.fileUrl}#page=${currentPage}`}
            className="flex-1 border-0"
            title={book?.title ?? "Book"}
          />
        )}

        {/* Bookmarks panel */}
        {showBookmarks && (
          <div className="w-72 border-l border-border bg-background overflow-y-auto flex flex-col shrink-0">
            <div className="p-4 border-b border-border">
              <p className="text-sm font-semibold mb-3">Bookmarks</p>
              <div className="flex gap-2">
                <input
                  value={newBookmarkNote}
                  onChange={e => setNewBookmarkNote(e.target.value)}
                  placeholder={`Page ${currentPage} note…`}
                  className="flex-1 text-xs bg-foreground/[0.05] border border-border rounded-lg px-2 py-1.5 focus:outline-none"
                />
                <button onClick={handleAddBookmark}
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "var(--gold)", color: "oklch(0.08 0.01 85)" }}>
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex-1 p-3 space-y-2">
              {bookmarks.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No bookmarks yet.</p>
              ) : bookmarks.map(bm => (
                <div key={bm.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-foreground/[0.04] group transition-colors">
                  <button onClick={() => setCurrentPage(bm.page)}
                    className="flex-1 text-left">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-[var(--gold)]">p.{bm.page}</span>
                      <span className="text-[10px] text-muted-foreground">{bm.createdAt ? format(new Date(bm.createdAt), "MMM d") : ""}</span>
                    </div>
                    {bm.note && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{bm.note}</p>}
                  </button>
                  <button onClick={() => handleDeleteBookmark(bm.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all shrink-0">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
