// Extra empire data: habit citizens (your routines as people) and the
// real-data interiors you see when you step inside a building.

import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  books, communities, dailyCheckins, digests, gameCommits, gigEmails, gigs, income, leads, personalRecords, playtestFeedback, recurringTasks, tasks, voiceCommands,
  youtubeChannels, youtubeVideos,
} from "@/lib/db/schema";
import { routineStreak, type Citizen } from "@/lib/empire-world";
import { dealsFor } from "@/lib/services/deals";
import { hudFor } from "@/lib/services/hud";
import { holdStatsFor } from "@/lib/services/wellbeing";
import { prayerSettingsFor, vaktijaFor } from "@/lib/services/prayer";

const n = (v: unknown) => Number(v ?? 0) || 0;

/** Up to 8 active routines with their streaks (from the tasks each routine creates daily). */
export async function citizensFor(userId: number): Promise<Citizen[]> {
  const routines = await db.select().from(recurringTasks).where(and(eq(recurringTasks.userId, userId), eq(recurringTasks.active, true))).orderBy(recurringTasks.createdAt).limit(8);
  if (!routines.length) return [];
  const since = new Date(Date.now() - 125 * 86_400_000).toISOString().slice(0, 10);
  const done = await db.select({ rid: tasks.recurringId, due: tasks.dueDate }).from(tasks)
    .where(and(eq(tasks.userId, userId), inArray(tasks.recurringId, routines.map((r) => r.id)), eq(tasks.status, "done"), gte(tasks.dueDate, since)));
  const byRoutine = new Map<number, Set<string>>();
  for (const d of done) if (d.rid && d.due) (byRoutine.get(d.rid) ?? byRoutine.set(d.rid, new Set()).get(d.rid)!).add(String(d.due));
  const today = new Date();
  return routines.map((r) => {
    const s = routineStreak(r.days, byRoutine.get(r.id) ?? new Set(), today);
    return { id: r.id, name: r.title.slice(0, 24), streak: s.streak, doneToday: s.doneToday, sad: s.missedYesterday && !s.doneToday };
  });
}

export type Interior = {
  theme: "studio" | "media" | "vault" | "library" | "gym" | "mosque" | "office" | "hq" | "radar" | "factory" | "news" | "hall" | "home";
  title: string;
  screen: { title: string; lines: string[] };
  board: string[]; // notes pinned to the wall
  shelf: { label: string; value: string }[];
  piles: number; // 0–40 gold stacks / books / plates, by theme
};

const clip = (s: string, len = 46) => (s.length > len ? `${s.slice(0, len - 1)}…` : s);

/** What's inside a building — always real data, never placeholders. */
export async function interiorFor(userId: number, buildingId: string): Promise<Interior> {
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  switch (buildingId) {
    case "studio": {
      const [commits, notes] = await Promise.all([
        db.select({ m: gameCommits.message, at: gameCommits.committedAt }).from(gameCommits).where(eq(gameCommits.userId, userId)).orderBy(desc(gameCommits.committedAt)).limit(7),
        db.select({ t: playtestFeedback.text, who: playtestFeedback.tester }).from(playtestFeedback).where(eq(playtestFeedback.userId, userId)).orderBy(desc(playtestFeedback.createdAt)).limit(5),
      ]);
      return {
        theme: "studio", title: "Game Studio",
        screen: { title: "git log", lines: commits.length ? commits.map((c) => `• ${clip(c.m.split("\n")[0])}`) : ["No commits yet — connect your repo in Game dev."] },
        board: notes.map((x) => clip(`${x.who ? `${x.who}: ` : ""}${x.t}`, 70)),
        shelf: [{ label: "Commits this week", value: String(commits.filter((c) => c.at.getTime() > Date.now() - 7 * 86_400_000).length) }],
        piles: Math.min(40, commits.length * 4),
      };
    }
    case "youtube": {
      const vids = await db.select({ title: youtubeVideos.title, views: youtubeVideos.views }).from(youtubeVideos)
        .innerJoin(youtubeChannels, eq(youtubeVideos.channelRowId, youtubeChannels.id)).where(eq(youtubeChannels.userId, userId)).orderBy(desc(youtubeVideos.publishedAt)).limit(6);
      return {
        theme: "media", title: "YouTube Studio",
        screen: { title: "Latest uploads", lines: vids.length ? vids.map((v) => `▶ ${clip(v.title ?? "", 34)} · ${n(v.views).toLocaleString()} views`) : ["Connect YouTube to fill this screen."] },
        board: [], shelf: [{ label: "Views (latest 6)", value: vids.reduce((s, v) => s + n(v.views), 0).toLocaleString() }], piles: 0,
      };
    }
    case "vault": {
      const rows = await db.select({ d: income.description, src: income.source, c: income.amountKmCents }).from(income)
        .where(and(eq(income.userId, userId), gte(income.receivedAt, monthStart))).orderBy(desc(income.receivedAt)).limit(8);
      const total = rows.reduce((s, r) => s + r.c, 0) / 100;
      return {
        theme: "vault", title: "The Vault",
        screen: { title: `This month · ${Math.round(total).toLocaleString()} KM`, lines: rows.length ? rows.map((r) => `+${Math.round(r.c / 100)} KM · ${clip(r.d ?? r.src, 30)}`) : ["Nothing yet this month."] },
        board: [], shelf: [], piles: Math.min(40, Math.round(total / 50)),
      };
    }
    case "library": {
      const [read, all] = await Promise.all([
        db.select({ t: books.title }).from(books).where(and(eq(books.userId, userId), isNotNull(books.completedAt))).orderBy(desc(books.completedAt)).limit(6),
        db.select({ n: sql<number>`count(*)::int` }).from(books).where(eq(books.userId, userId)),
      ]);
      return {
        theme: "library", title: "Library",
        screen: { title: "Finished books", lines: read.length ? read.map((b) => `📖 ${clip(b.t)}`) : ["Finish a book to put it on the shelf."] },
        board: [], shelf: [{ label: "Books on the shelf", value: String(n(all[0]?.n)) }], piles: Math.min(40, n(all[0]?.n) * 2),
      };
    }
    case "gym": {
      const [week, prs] = await Promise.all([
        db.select({ d: dailyCheckins.date, m: dailyCheckins.trainingMinutes }).from(dailyCheckins)
          .where(and(eq(dailyCheckins.userId, userId), eq(dailyCheckins.training, true))).orderBy(desc(dailyCheckins.date)).limit(7),
        db.select({ e: personalRecords.exercise, v: personalRecords.value, u: personalRecords.unit }).from(personalRecords).where(eq(personalRecords.userId, userId)).orderBy(desc(personalRecords.id)).limit(5),
      ]);
      return {
        theme: "gym", title: "Gym",
        screen: { title: "Recent sessions", lines: week.length ? week.map((w) => `💪 ${w.d} · ${n(w.m)} min`) : ["Log a workout to see it here."] },
        board: prs.map((p) => `PR · ${p.e}: ${p.v}${p.u ? ` ${p.u}` : ""}`), shelf: [], piles: Math.min(40, prs.length * 6),
      };
    }
    case "mosque": {
      const today = new Date().toISOString().slice(0, 10);
      const [ck] = await db.select().from(dailyCheckins).where(and(eq(dailyCheckins.userId, userId), eq(dailyCheckins.date, today))).limit(1);
      const v = await vaktijaFor((await prayerSettingsFor(userId)).location);
      const names = [["fajr", "Zora", 0], ["dhuhr", "Podne", 2], ["asr", "Ikindija", 3], ["maghrib", "Akšam", 4], ["isha", "Jacija", 5]] as const;
      return {
        theme: "mosque", title: "Mosque",
        screen: { title: "Today", lines: names.map(([k, bs, i]) => `${ck?.[k] ? "✓" : "○"} ${bs} ${v?.times[i] ?? ""}`) },
        board: [], shelf: [{ label: "Qur'an pages today", value: String(n(ck?.quranPages)) }], piles: 0,
      };
    }
    case "deals": {
      const deals = (await dealsFor(userId)).filter((d) => !["won", "lost"].includes(d.stage)).slice(0, 7);
      return {
        theme: "office", title: "Deal Desk",
        screen: { title: "Open deals", lines: deals.length ? deals.map((d) => `${d.stage} · ${clip(d.title, 28)}${d.valueKm ? ` · ${d.valueKm} KM` : ""}`) : ["No open deals."] },
        board: [], shelf: [], piles: Math.min(40, deals.length * 5),
      };
    }
    case "outreach": {
      const rows = await db.select({ name: leads.name, status: leads.status }).from(leads).where(and(eq(leads.userId, userId), inArray(leads.status, ["queued", "ready", "sent"]))).orderBy(desc(leads.createdAt)).limit(7);
      return { theme: "office", title: "Outreach", screen: { title: "Pipeline", lines: rows.length ? rows.map((r) => `${r.status} · ${clip(r.name, 34)}`) : ["Outreach is quiet."] }, board: [], shelf: [], piles: 0 };
    }
    case "radar": {
      const rows = await db.select({ t: gigs.title, s: gigs.score }).from(gigs).where(and(eq(gigs.userId, userId), eq(gigs.status, "new"))).orderBy(desc(gigs.score)).limit(7);
      return { theme: "radar", title: "Gig Radar", screen: { title: "Top gigs right now", lines: rows.length ? rows.map((r) => `${r.s} · ${clip(r.t, 38)}`) : ["No new gigs."] }, board: [], shelf: [], piles: 0 };
    }
    case "autopilot": {
      const rows = await db.select({ s: gigEmails.subject, st: gigEmails.status }).from(gigEmails).where(eq(gigEmails.userId, userId)).orderBy(desc(gigEmails.createdAt)).limit(7);
      return { theme: "factory", title: "Autopilot", screen: { title: "Latest emails", lines: rows.length ? rows.map((r) => `${r.st} · ${clip(r.s, 36)}`) : ["No emails yet."] }, board: [], shelf: [], piles: 0 };
    }
    case "runner": {
      const rows = await db.select({ k: voiceCommands.kind, st: voiceCommands.status, sum: voiceCommands.summary }).from(voiceCommands).where(eq(voiceCommands.userId, userId)).orderBy(desc(voiceCommands.createdAt)).limit(7);
      return { theme: "factory", title: "Claude Runner", screen: { title: "Recent jobs", lines: rows.length ? rows.map((r) => `${r.st} · ${r.k}${r.sum ? ` · ${clip(r.sum, 26)}` : ""}`) : ["No jobs yet."] }, board: [], shelf: [], piles: 0 };
    }
    case "news": {
      const [d] = await db.select({ items: digests.items }).from(digests).where(eq(digests.userId, userId)).orderBy(desc(digests.day)).limit(1);
      const items = ((d?.items ?? []) as { title?: string }[]).slice(0, 7);
      return { theme: "news", title: "Daily Brief", screen: { title: "Today's headlines", lines: items.length ? items.map((i) => `• ${clip(i.title ?? "", 44)}`) : ["The brief builds itself at 06:00."] }, board: [], shelf: [], piles: 0 };
    }
    case "community": {
      const rows = await db.select({ name: communities.name, m: communities.members }).from(communities).where(and(eq(communities.userId, userId), eq(communities.status, "joined"))).limit(7);
      return { theme: "hall", title: "Community", screen: { title: "Servers you joined", lines: rows.length ? rows.map((r) => `${clip(r.name, 32)} · ${n(r.m).toLocaleString()}`) : ["Mark servers as joined on Community."] }, board: [], shelf: [], piles: 0 };
    }
    case "home": {
      const h = await holdStatsFor(userId);
      return { theme: "home", title: "Home", screen: { title: "Hold the line", lines: [`${h.wonThisMonth}/${h.daysSoFar} days won this month`] }, board: [], shelf: [], piles: 0 };
    }
    default: {
      const hud = await hudFor(userId);
      return {
        theme: "hq", title: "HQ",
        screen: { title: `Level ${hud.level} · ${hud.rank}`, lines: hud.skills.map((s) => `${s.emoji} ${s.label} · LV ${s.level}`) },
        board: [], shelf: [{ label: "Total XP", value: hud.xp.toLocaleString() }, { label: "Streak", value: `${hud.streak} days` }], piles: Math.min(40, hud.level * 2),
      };
    }
  }
}
