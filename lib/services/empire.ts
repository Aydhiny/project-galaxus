// Your empire, live: every Galaxus system as a building, with what it's doing
// right now. Building size follows the matching skill level; message bubbles
// are the things that need you (or just happened). Read every ~45 seconds by
// the 3D overview.

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  autopilotSettings, communities, digests, gameCommits, gigEmails, gigs, leads, outreachSettings, taskRuns, voiceCommands, youtubeChannels, youtubeVideos,
} from "@/lib/db/schema";
import { hudFor } from "@/lib/services/hud";
import { dealsFor } from "@/lib/services/deals";
import { claudeHealthy } from "@/lib/services/claude-jobs";
import { holdStatsFor } from "@/lib/services/wellbeing";
import { worldFor } from "@/lib/services/empire-world";
import { activityStatusFor } from "@/lib/services/activity";
import { cleanStyle } from "@/lib/empire-world";
import { userSettings } from "@/lib/db/schema";

const count = sql<number>`count(*)::int`;
const n = (v: unknown) => Number(v ?? 0) || 0;

export type Bubble = { text: string; tone: "info" | "good" | "warn" | "urgent" };
export type Building = {
  id: string;
  kind: "tower" | "office" | "bank" | "vault" | "news" | "hall" | "studio" | "factory" | "mosque" | "library" | "gym" | "house" | "castle";
  label: string;
  emoji: string;
  route: string;
  level: number; // drives the building's height
  active: boolean; // switched on → lit windows / smoke / spinning parts
  working?: boolean; // an automation is running right now → workers walk in and out
  neglected?: boolean; // untouched for 14+ days → cracks and weeds until you use it again
  status: string;
  bubbles: Bubble[];
  stats: { label: string; value: string }[];
};

export async function empireFor(userId: number) {
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const today = dayStart.toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [hud, deals, runnerOk, hold, gigCounts, emailsToday, needsYou, auto, outreach, queued, ready, brief, newCommunities, commits, lastBeat, yt, jobs] = await Promise.all([
    hudFor(userId),
    dealsFor(userId),
    claudeHealthy(userId),
    holdStatsFor(userId),
    db.select({ fresh: count, hot: sql<number>`count(*) filter (where ${gigs.score} >= 70)::int`, today: sql<number>`count(*) filter (where ${gigs.createdAt} >= ${dayStart.toISOString()})::int` })
      .from(gigs).where(and(eq(gigs.userId, userId), eq(gigs.status, "new"))),
    db.select({ n: count }).from(gigEmails).where(and(eq(gigEmails.userId, userId), inArray(gigEmails.status, ["sent", "shadow"]), gte(gigEmails.createdAt, dayStart))),
    db.select({ n: count }).from(gigEmails).where(and(eq(gigEmails.userId, userId), eq(gigEmails.needsYou, true))),
    db.select({ mode: autopilotSettings.mode }).from(autopilotSettings).where(eq(autopilotSettings.userId, userId)).limit(1),
    db.select({ active: outreachSettings.active }).from(outreachSettings).where(eq(outreachSettings.userId, userId)).limit(1),
    db.select({ n: count }).from(leads).where(and(eq(leads.userId, userId), eq(leads.status, "queued"))),
    db.select({ n: count }).from(leads).where(and(eq(leads.userId, userId), eq(leads.status, "ready"))),
    db.select({ ready: sql<boolean>`${digests.briefing} is not null`, items: sql<number>`jsonb_array_length(${digests.items})` }).from(digests).where(and(eq(digests.userId, userId), eq(digests.day, today))).limit(1),
    db.select({ n: count }).from(communities).where(and(eq(communities.userId, userId), eq(communities.status, "new"), gte(communities.createdAt, weekAgo))),
    db.select({ n: count }).from(gameCommits).where(and(eq(gameCommits.userId, userId), gte(gameCommits.committedAt, weekAgo))),
    db.select({ at: taskRuns.lastRunAt, task: taskRuns.task }).from(taskRuns).where(eq(taskRuns.userId, userId)).orderBy(desc(taskRuns.lastRunAt)).limit(1),
    db.select({ views: sql<number>`coalesce(sum(${youtubeVideos.views}),0)::bigint`, recent: sql<number>`count(*) filter (where ${youtubeVideos.publishedAt} >= ${weekAgo.toISOString()})::int` })
      .from(youtubeVideos).innerJoin(youtubeChannels, eq(youtubeVideos.channelRowId, youtubeChannels.id)).where(eq(youtubeChannels.userId, userId)),
    db.select({ n: count }).from(voiceCommands).where(and(eq(voiceCommands.userId, userId), inArray(voiceCommands.status, ["queued", "running"]))),
  ]);

  const skill = (k: string) => hud.skills.find((s) => s.key === k)?.level ?? 1;
  const g = gigCounts[0];
  const mode = auto[0]?.mode ?? "off";
  const readyDeals = deals.filter((d) => d.stage === "ready");
  const openDeals = deals.filter((d) => !["won", "lost"].includes(d.stage));
  const pipeline = openDeals.reduce((s, d) => s + (d.valueKm ?? 0), 0);
  const beatMinutesAgo = lastBeat[0] ? Math.round((Date.now() - lastBeat[0].at.getTime()) / 60_000) : null;
  const schedulerAlive = beatMinutesAgo !== null && beatMinutesAgo < 30;
  const B = (b: Building) => b;
  // "Working" = something automatic is happening right now (not just switched on).
  const justRan = beatMinutesAgo !== null && beatMinutesAgo < 12;
  const jobsRunning = n(jobs[0]?.n);

  const buildings: Building[] = [
    B({ id: "hq", kind: "castle", label: "HQ", emoji: "🏰", route: "/level", level: hud.level, active: true,
      status: `Level ${hud.level} · ${hud.rank}`, bubbles: [],
      stats: [{ label: "XP", value: hud.xp.toLocaleString() }, { label: "Next level", value: `${hud.progress}%` }, { label: "Streak", value: `${hud.streak} days` }] }),
    B({ id: "radar", kind: "tower", label: "Gig Radar", emoji: "📡", route: "/gigs", level: skill("hustle") + 1, active: schedulerAlive, working: justRan,
      status: schedulerAlive ? "Scanning Reddit & job boards every hour" : "Waiting for the next scan",
      bubbles: [
        ...(n(g?.hot) > 0 ? [{ text: `${n(g?.hot)} hot gig${n(g?.hot) === 1 ? "" : "s"}`, tone: "good" as const }] : []),
        ...(n(g?.today) > 0 ? [{ text: `+${n(g?.today)} today`, tone: "info" as const }] : []),
      ],
      stats: [{ label: "New", value: String(n(g?.fresh)) }, { label: "Hot (70+)", value: String(n(g?.hot)) }, { label: "Found today", value: String(n(g?.today)) }] }),
    B({ id: "autopilot", kind: "factory", label: "Autopilot", emoji: "🏭", route: "/gigs", level: skill("hustle"), active: mode !== "off", working: mode !== "off" && justRan,
      status: mode === "on" ? "Applying by email & answering replies" : mode === "shadow" ? "Shadow mode — drafting, not sending" : "Off",
      bubbles: [
        ...(n(needsYou[0]?.n) > 0 ? [{ text: `${n(needsYou[0]?.n)} repl${n(needsYou[0]?.n) === 1 ? "y needs" : "ies need"} you`, tone: "urgent" as const }] : []),
        ...(n(emailsToday[0]?.n) > 0 ? [{ text: `${n(emailsToday[0]?.n)} ${mode === "on" ? "sent" : "drafted"} today`, tone: "info" as const }] : []),
      ],
      stats: [{ label: "Mode", value: mode }, { label: "Today", value: String(n(emailsToday[0]?.n)) }, { label: "Needs you", value: String(n(needsYou[0]?.n)) }] }),
    B({ id: "deals", kind: "bank", label: "Deal Desk", emoji: "🏦", route: "/deals", level: skill("hustle") + 1, active: openDeals.length > 0,
      status: `${openDeals.length} open · ${pipeline.toLocaleString()} KM pipeline`,
      bubbles: readyDeals.length ? [{ text: `${readyDeals.length} deal${readyDeals.length === 1 ? "" : "s"} ready!`, tone: "urgent" }] : [],
      stats: [{ label: "Open", value: String(openDeals.length) }, { label: "Pipeline", value: `${pipeline.toLocaleString()} KM` }, { label: "Ready", value: String(readyDeals.length) }] }),
    B({ id: "outreach", kind: "office", label: "Outreach", emoji: "🏢", route: "/outreach", level: skill("hustle"), active: !!outreach[0]?.active, working: !!outreach[0]?.active && justRan,
      status: outreach[0]?.active ? "Scouting businesses & drafting messages" : "Paused",
      bubbles: n(queued[0]?.n) > 0 ? [{ text: `${n(queued[0]?.n)} to send`, tone: "warn" }] : [],
      stats: [{ label: "To send", value: String(n(queued[0]?.n)) }, { label: "Drafted, in stock", value: String(n(ready[0]?.n)) }] }),
    B({ id: "vault", kind: "vault", label: "Money", emoji: "💰", route: "/money", level: Math.max(1, Math.floor(Math.log10(hud.totalKm + 10) * 2)), active: hud.monthKm > 0,
      status: `${hud.monthKm.toLocaleString()} KM this month`,
      bubbles: hud.goalKm && hud.monthKm >= hud.goalKm ? [{ text: "Goal hit!", tone: "good" }] : [],
      stats: [{ label: "This month", value: `${hud.monthKm.toLocaleString()} KM` }, { label: "All time", value: `${hud.totalKm.toLocaleString()} KM` }, { label: "Goal", value: hud.goalKm ? `${hud.goalKm.toLocaleString()} KM` : "—" }] }),
    B({ id: "news", kind: "news", label: "Daily Brief", emoji: "📰", route: "/brief", level: 2, active: !!brief[0], working: !!brief[0] && !brief[0].ready,
      status: brief[0] ? `${n(brief[0].items)} stories today` : "Builds itself at 06:00",
      bubbles: brief[0] ? [{ text: "Today's brief", tone: "info" }] : [],
      stats: [{ label: "Stories", value: String(n(brief[0]?.items)) }, { label: "AI summary", value: brief[0]?.ready ? "Yes" : "Headlines" }] }),
    B({ id: "runner", kind: "factory", label: "Claude Runner", emoji: "🤖", route: "/connections", level: 3, active: runnerOk && schedulerAlive, working: jobsRunning > 0,
      status: !runnerOk ? "Token expired — renew it" : schedulerAlive ? `Last beat ${beatMinutesAgo} min ago` : "Idle",
      bubbles: !runnerOk ? [{ text: "Token expired", tone: "urgent" }] : [],
      stats: [{ label: "Claude", value: runnerOk ? "Working" : "Needs token" }, { label: "Jobs running", value: String(jobsRunning) }, { label: "Scheduler", value: beatMinutesAgo === null ? "—" : `${beatMinutesAgo} min ago` }] }),
    B({ id: "community", kind: "hall", label: "Community", emoji: "🏛️", route: "/community", level: 2, active: true,
      status: "Scouting Discord servers daily",
      bubbles: n(newCommunities[0]?.n) > 0 ? [{ text: `${n(newCommunities[0]?.n)} new servers`, tone: "info" }] : [],
      stats: [{ label: "New this week", value: String(n(newCommunities[0]?.n)) }] }),
    B({ id: "studio", kind: "studio", label: "Game Studio", emoji: "🎮", route: "/game", level: skill("coding"), active: n(commits[0]?.n) > 0,
      status: `${n(commits[0]?.n)} commits this week`, bubbles: [],
      stats: [{ label: "Commits (7d)", value: String(n(commits[0]?.n)) }, { label: "Coding", value: `LV ${skill("coding")}` }] }),
    B({ id: "youtube", kind: "studio", label: "YouTube", emoji: "🎬", route: "/youtube", level: skill("editing"), active: n(yt[0]?.recent) > 0,
      status: `${n(yt[0]?.views).toLocaleString()} views total`, bubbles: n(yt[0]?.recent) > 0 ? [{ text: `${n(yt[0]?.recent)} new upload${n(yt[0]?.recent) === 1 ? "" : "s"}`, tone: "good" }] : [],
      stats: [{ label: "Views", value: n(yt[0]?.views).toLocaleString() }, { label: "Uploads (7d)", value: String(n(yt[0]?.recent)) }] }),
    B({ id: "mosque", kind: "mosque", label: "Faith", emoji: "🕌", route: "/spiritual", level: skill("faith"), active: true, status: `Faith LV ${skill("faith")}`, bubbles: [],
      stats: [{ label: "Faith", value: `LV ${skill("faith")}` }] }),
    B({ id: "library", kind: "library", label: "Library", emoji: "📚", route: "/diary", level: skill("mind"), active: true, status: `Mind LV ${skill("mind")}`, bubbles: [],
      stats: [{ label: "Mind", value: `LV ${skill("mind")}` }] }),
    B({ id: "gym", kind: "gym", label: "Gym", emoji: "💪", route: "/training", level: skill("fitness"), active: true, status: `Fitness LV ${skill("fitness")}`, bubbles: [],
      stats: [{ label: "Fitness", value: `LV ${skill("fitness")}` }] }),
    B({ id: "home", kind: "house", label: "Home", emoji: "🏡", route: "/hold", level: skill("discipline"), active: true,
      status: `${hold.wonThisMonth}/${hold.daysSoFar} days won this month`, bubbles: [],
      stats: [{ label: "Days won", value: `${hold.wonThisMonth}/${hold.daysSoFar}` }, { label: "Good nights", value: String(hud.goodNights) }] }),
  ];
  const [world, act] = await Promise.all([worldFor(userId, { streak: hud.streak, monthKm: hud.monthKm, goalKm: hud.goalKm, skills: hud.skills }), activityStatusFor(userId)]);
  world.distracted = act.doomscrolling;
  // Deep work tracked by the desktop app makes the matching building work right now.
  const live = (id: string, cats: string[], label: string) => {
    const b = buildings.find((x) => x.id === id);
    if (!b) return;
    const mins = cats.reduce((s, c) => s + (act.deepToday[c as keyof typeof act.deepToday] ?? 0), 0);
    if (act.activeNow.some((c) => cats.includes(c))) { b.working = true; b.active = true; }
    if (mins > 0) {
      b.bubbles = [{ text: `${label} · ${mins} min today`, tone: "good" }, ...b.bubbles];
      b.stats = [{ label: "Deep work today", value: `${mins} min` }, ...b.stats];
    }
  };
  live("studio", ["code", "gamedev"], "💻 Deep work");
  live("youtube", ["editing", "design"], "🎬 Editing");
  live("hq", ["music"], "🎧 Producing");
  for (const b of buildings) if (world.neglected.includes(b.id)) {
    b.neglected = true;
    b.bubbles = [{ text: "Falling apart — open me", tone: "warn" }, ...b.bubbles];
  }
  const [st] = await db.select({ style: userSettings.empireStyle, city: userSettings.cityName }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  return { buildings, world, style: cleanStyle(st?.style), cityName: st?.city ?? null, level: hud.level, rank: hud.rank, xp: hud.xp, progress: hud.progress, monthKm: hud.monthKm, updatedAt: new Date().toISOString() };
}
export type EmpireState = Awaited<ReturnType<typeof empireFor>>;
