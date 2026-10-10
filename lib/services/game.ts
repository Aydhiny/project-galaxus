// Game dev (Hunter Mouse 2): devlog-from-commits + playtest log.
//
// Commits come from the GitHub API. A private repo needs a read-only token:
// fine-grained, that ONE repo, "Contents: Read-only" — stored encrypted as
// user_secrets "github_read", separate from the Actions-only voice token.

import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { gameCommits, gameSettings, playtestFeedback, tasks } from "@/lib/db/schema";
import { getSecret, setSecret } from "@/lib/services/secrets";
import { enqueueJobFor } from "@/lib/services/claude-jobs";
import type { DevlogCommit } from "@/lib/claude-jobs";

const DEFAULT_REPO = "Aydhiny/Hunter-Mouse-2";
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

async function settingsFor(userId: number) {
  await db.insert(gameSettings).values({ userId, repo: DEFAULT_REPO }).onConflictDoNothing();
  const [row] = await db.select().from(gameSettings).where(eq(gameSettings.userId, userId)).limit(1);
  return row;
}

export async function gameStateFor(userId: number) {
  const [settings, feedback, token, feed] = await Promise.all([
    settingsFor(userId),
    db.select().from(playtestFeedback).where(eq(playtestFeedback.userId, userId)).orderBy(desc(playtestFeedback.id)).limit(300),
    getSecret(userId, "github_read"),
    db.select({ n: sql<number>`count(*)::int`, last: sql<Date | null>`max(${gameCommits.createdAt})` }).from(gameCommits).where(eq(gameCommits.userId, userId)),
  ]);
  return { settings, feedback, hasRepoToken: !!token, feed: { commits: feed[0]?.n ?? 0, lastReceivedAt: feed[0]?.last ?? null } };
}

/** Called by the game repo's GitHub Action on every push (scope "game" token). */
export async function receiveCommitsFor(userId: number, repo: string, commits: { sha?: unknown; message?: unknown; date?: unknown }[]) {
  if (!REPO_RE.test(repo)) throw new Error("Bad repo.");
  const rows = commits
    .slice(0, 200)
    .filter((c) => typeof c.sha === "string" && /^[a-f0-9]{7,64}$/.test(c.sha) && typeof c.message === "string")
    .map((c) => ({
      userId,
      repo,
      sha: String(c.sha),
      message: String(c.message).slice(0, 4000),
      committedAt: Number.isNaN(new Date(String(c.date)).getTime()) ? new Date() : new Date(String(c.date)),
    }));
  if (rows.length === 0) return 0;
  const inserted = await db.insert(gameCommits).values(rows).onConflictDoNothing({ target: [gameCommits.userId, gameCommits.sha] }).returning({ id: gameCommits.id });
  return inserted.length;
}

/** Commits the Action already delivered, newer than the last devlog (first time: the latest 30). */
async function storedCommits(userId: number, since: Date | null): Promise<DevlogCommit[]> {
  const rows = await db
    .select()
    .from(gameCommits)
    .where(since ? and(eq(gameCommits.userId, userId), gt(gameCommits.committedAt, since)) : eq(gameCommits.userId, userId))
    .orderBy(desc(gameCommits.committedAt))
    .limit(since ? 60 : 30);
  return rows
    .filter((r) => !/^Merge (branch|pull request)/.test(r.message))
    .map((r) => ({ sha: r.sha, message: r.message, date: r.committedAt.toISOString() }));
}

export async function saveRepoFor(userId: number, repo: string, token?: string) {
  const r = repo.trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
  if (!REPO_RE.test(r)) throw new Error('Use the "owner/repo" form, e.g. Aydhiny/Hunter-Mouse-2.');
  await settingsFor(userId);
  await db.update(gameSettings).set({ repo: r, updatedAt: new Date() }).where(eq(gameSettings.userId, userId));
  if (token !== undefined) {
    const t = token.trim();
    if (t && !/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(t)) throw new Error("That doesn't look like a GitHub token.");
    await setSecret(userId, "github_read", t || null);
  }
}

async function fetchCommits(repo: string, token: string | null, since: { sha: string | null; at: Date | null }): Promise<DevlogCommit[]> {
  const params = new URLSearchParams({ per_page: "60" });
  // First devlog: the latest 30 commits. After that: everything since the last one.
  if (since.at) params.set("since", since.at.toISOString());
  else params.set("per_page", "30");
  const res = await fetch(`https://api.github.com/repos/${repo}/commits?${params}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Galaxus",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (res.status === 404) throw new Error(token ? "Repo not found — check the name and that your token can read it." : "Repo not found. If it's private, add a read-only GitHub token.");
  if (res.status === 401) throw new Error("GitHub rejected the token — it may have expired.");
  if (!res.ok) throw new Error(`GitHub returned HTTP ${res.status}.`);
  const list = (await res.json()) as { sha: string; commit: { message: string; author?: { date?: string } } }[];
  const out: DevlogCommit[] = [];
  for (const c of list) {
    if (c.sha === since.sha) break; // already covered by the last devlog
    if (/^Merge (branch|pull request)/.test(c.commit.message)) continue;
    out.push({ sha: c.sha, message: c.commit.message, date: c.commit.author?.date ?? new Date().toISOString() });
  }
  return out;
}

/** Claude turns the commits since the last devlog into a Short script (lands in YouTube → Work). */
export async function devlogFromCommitsFor(userId: number) {
  const s = await settingsFor(userId);
  if (!s.repo) throw new Error("Set your game's GitHub repo first.");
  // Commits pushed in by the repo's GitHub Action need no GitHub token here;
  // a read-only token is the fallback for repos without the Action.
  const token = await getSecret(userId, "github_read");
  const commits = token
    ? await fetchCommits(s.repo, token, { sha: s.lastDevlogSha, at: s.lastDevlogAt })
    : await storedCommits(userId, s.lastDevlogAt);
  if (commits.length === 0) throw new Error("No new commits since the last devlog — push some work first.");
  return enqueueJobFor(userId, "devlog", `Devlog from ${commits.length} commit${commits.length === 1 ? "" : "s"}`, {
    game: s.repo.split("/")[1].replace(/[-_]/g, " "),
    repo: s.repo,
    commits,
    headSha: commits[0].sha,
  });
}

// ─── Playtest log ─────────────────────────────────────────────────────────────

export async function addFeedbackFor(userId: number, input: { text: string; tester?: string; build?: string; rating?: number | null }) {
  const text = String(input.text ?? "").trim().slice(0, 4000);
  if (!text) throw new Error("Write what the player said.");
  const rating = input.rating == null || Number.isNaN(Number(input.rating)) ? null : Math.min(5, Math.max(1, Math.round(Number(input.rating))));
  const [row] = await db
    .insert(playtestFeedback)
    .values({ userId, text, tester: input.tester?.trim().slice(0, 80) || null, build: input.build?.trim().slice(0, 40) || null, rating })
    .returning();
  return row;
}

export async function deleteFeedbackFor(userId: number, id: number) {
  await db.delete(playtestFeedback).where(and(eq(playtestFeedback.id, id), eq(playtestFeedback.userId, userId)));
}

export async function groupFeedbackFor(userId: number) {
  const s = await settingsFor(userId);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(playtestFeedback).where(eq(playtestFeedback.userId, userId));
  if (n < 2) throw new Error("Add at least two pieces of feedback first.");
  return enqueueJobFor(userId, "playtest", `Group ${n} playtest notes`, { game: (s.repo ?? DEFAULT_REPO).split("/")[1].replace(/[-_]/g, " ") });
}

/** Turn a theme into a task on your list (high severity → high priority). */
export async function themeToTaskFor(userId: number, index: number) {
  const s = await settingsFor(userId);
  const theme = s.playtestThemes?.[index];
  if (!theme) throw new Error("Theme not found — group the feedback again.");
  const priority = theme.severity === "high" ? "high" : theme.severity === "medium" ? "medium" : "low";
  const notes = `Playtest: ${theme.theme} (${theme.count}×)\n${theme.examples.map((e) => `• "${e}"`).join("\n")}`;
  const [row] = await db.insert(tasks).values({ userId, title: theme.task.slice(0, 500), notes, priority }).returning({ id: tasks.id });
  return row;
}
