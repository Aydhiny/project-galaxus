"use server";

import { db } from "@/lib/db";
import { journalEntries, dailyCheckins, users } from "@/lib/db/schema";
import { and, eq, gte, ilike, or } from "drizzle-orm";
import { format, subDays } from "date-fns";
import { requireUserId } from "@/lib/auth-session";
import { clampHistoryDays } from "@/lib/plan";

export interface SearchResult {
  id: string; // prefixed so journal/checkin ids never collide in a merged list
  kind: "journal" | "checkin";
  snippet: string;
  date: string;
}

function snippet(text: string, max = 120): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > max ? trimmed.slice(0, max) + "…" : trimmed;
}

/**
 * Covers journal entries + daily check-in free-text fields (gratitude, notes,
 * tomorrow note) — not "Notes", which is client-only localStorage with no
 * server table to search (see app/(dashboard)/notes/page.tsx's own filter).
 */
export async function searchContent(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  try {
    const userId = await requireUserId();
    const [user] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, userId)).limit(1);
    // Reuses the same free-tier history cap every other feature respects —
    // a huge requested window collapses to "no floor" for pro, 30 days for free.
    const cappedDays = clampHistoryDays(user?.plan ?? "free", 36500);
    const since = format(subDays(new Date(), cappedDays), "yyyy-MM-dd");
    const like = `%${q}%`;

    const [journalRows, checkinRows] = await Promise.all([
      db
        .select()
        .from(journalEntries)
        .where(and(eq(journalEntries.userId, userId), ilike(journalEntries.content, like), gte(journalEntries.date, since)))
        .limit(10),
      db
        .select()
        .from(dailyCheckins)
        .where(
          and(
            eq(dailyCheckins.userId, userId),
            gte(dailyCheckins.date, since),
            or(
              ilike(dailyCheckins.gratitudeText, like),
              ilike(dailyCheckins.notes, like),
              ilike(dailyCheckins.tomorrowNote, like)
            )
          )
        )
        .limit(10),
    ]);

    const journalResults: SearchResult[] = journalRows.map((r) => ({
      id: `journal-${r.id}`,
      kind: "journal",
      snippet: snippet(r.content),
      date: r.date,
    }));
    const checkinResults: SearchResult[] = checkinRows.map((r) => ({
      id: `checkin-${r.id}`,
      kind: "checkin",
      snippet: snippet([r.gratitudeText, r.notes, r.tomorrowNote].filter(Boolean).join(" — ")),
      date: r.date,
    }));

    return [...journalResults, ...checkinResults]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
  } catch {
    return [];
  }
}
