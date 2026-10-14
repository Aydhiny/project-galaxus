// What happens to a deliverable after you read it: it goes where it belongs in
// Galaxus (tasks, a page, an outreach lead, a Reddit draft), and pull requests
// an agent opened show their real GitHub status on the mission and the desk.
//
// Deliverables are agent-written text, so everything here is plain text:
// markdown is turned into page blocks, never into HTML.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { opsMissions, redditPosts, workspacePages } from "@/lib/db/schema";
import { createBlock, sanitizeBlocks, type Block } from "@/lib/blocks";
import { mdToBlocks, parsePrUrl, type PrStatus } from "@/lib/ops";

const today = () => new Date().toISOString().slice(0, 10);

async function deliverable(userId: number, id: number) {
  const [m] = await db.select().from(opsMissions).where(and(eq(opsMissions.id, id), eq(opsMissions.userId, userId))).limit(1);
  if (!m) throw new Error("Mission not found.");
  if (!m.deliverable) throw new Error("That mission has no result yet.");
  return m;
}

/** Markdown → page blocks the editor understands. */
export function blocksFromMarkdown(md: string): Block[] {
  return mdToBlocks(md).map((b) => {
    const block = createBlock(b.type === "table" ? "paragraph" : b.type, b.text); // tables only appear with { inline: true }
    if (b.type === "todo") block.checked = !!b.checked;
    if (b.indent) block.indent = b.indent;
    if (b.lang) block.lang = b.lang;
    return block;
  });
}

/** A new page in Pages. Returns its id. */
export async function createPageFromMarkdown(userId: number, title: string, md: string, opts: { icon?: string; intro?: string } = {}) {
  const intro = opts.intro ? [Object.assign(createBlock("callout", opts.intro), { emoji: "🛰️" })] : [];
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(workspacePages).where(eq(workspacePages.userId, userId));
  const [row] = await db.insert(workspacePages).values({
    userId, title: title.slice(0, 255), icon: opts.icon ?? "🛰️", blocks: sanitizeBlocks([...intro, ...blocksFromMarkdown(md)]), orderIndex: n,
  }).returning({ id: workspacePages.id });
  return row.id;
}

/** Add blocks to the end of a page you own. */
export async function appendMarkdownToPage(userId: number, pageId: number, heading: string, md: string) {
  const [p] = await db.select({ blocks: workspacePages.blocks }).from(workspacePages).where(and(eq(workspacePages.id, pageId), eq(workspacePages.userId, userId))).limit(1);
  if (!p) return;
  const extra = [createBlock("divider"), createBlock("h2", heading), ...blocksFromMarkdown(md)];
  await db.update(workspacePages).set({ blocks: sanitizeBlocks([...p.blocks, ...extra]), updatedAt: new Date() }).where(eq(workspacePages.id, pageId));
}

export async function missionToPageFor(userId: number, id: number) {
  const m = await deliverable(userId, id);
  return createPageFromMarkdown(userId, m.deliverableTitle || m.title, m.deliverable!, { intro: `From Ops: "${m.title}" (${String(m.day)}).` });
}

/** The tasks you ticked in the preview become real tasks (titles only, cleaned and capped). */
export async function missionToTasksFor(userId: number, id: number, titles: string[]) {
  const m = await deliverable(userId, id);
  const clean = [...new Set((Array.isArray(titles) ? titles : []).map((t) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, 200)).filter((t) => t.length >= 2))].slice(0, 20);
  if (!clean.length) throw new Error("Pick at least one task.");
  const { createTasksFor } = await import("@/lib/services/tasks");
  const made = await createTasksFor(userId, clean.map((title) => ({ title, notes: `From Ops: ${m.title}` })));
  return made.length;
}

/** One business from a deliverable into Outreach (it goes through the normal audit, nothing is sent). */
export async function missionToLeadFor(userId: number, id: number, lead: { name: string; phone?: string | null; website?: string | null; city?: string | null }) {
  await deliverable(userId, id);
  const name = String(lead.name ?? "").replace(/[\r\n,;|]+/g, " ").trim().slice(0, 200);
  if (name.length < 2) throw new Error("Give the business a name.");
  const line = [name, lead.phone ?? "", lead.website ?? ""].map((x) => String(x).replace(/[\r\n]+/g, " ").trim()).filter(Boolean).join(", ");
  const { importLeadsFor } = await import("@/lib/services/outreach/engine");
  const r = await importLeadsFor(userId, line, { city: lead.city ?? undefined, category: "From Ops" });
  if (!r.added) throw new Error("That business is already in Outreach.");
  return r.added;
}

/** A Reddit draft for the game promo queue. Drafts are never posted for you. */
export async function missionToRedditFor(userId: number, id: number, post: { subreddit: string; title: string; body: string }) {
  await deliverable(userId, id);
  const sub = String(post.subreddit ?? "").replace(/^\/?r\//i, "").trim();
  if (!/^[A-Za-z0-9_]{2,21}$/.test(sub)) throw new Error("That isn't a valid subreddit name.");
  const title = String(post.title ?? "").trim().slice(0, 300);
  if (title.length < 5) throw new Error("Give the post a title.");
  const [row] = await db.insert(redditPosts).values({
    userId, subreddit: sub, day: today(), title, body: String(post.body ?? "").slice(0, 20_000), status: "draft", angle: "From Ops",
  }).returning({ id: redditPosts.id });
  return row.id;
}

// ─── Pull request status (GitHub) ─────────────────────────────────────────────

async function gh<T>(path: string, token: string | null): Promise<T | null> {
  try {
    const res = await fetch(`https://api.github.com${path}`, {
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Galaxus", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      next: { revalidate: 120 }, // a PR's status is fine two minutes stale; keeps us far under GitHub's limits
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Live status for each PR url (null when GitHub can't be reached or the repo is private and no token can read it). */
export async function prStatusesFor(userId: number, urls: string[]): Promise<Record<string, PrStatus | null>> {
  const uniq = [...new Set(urls)].map(parsePrUrl).filter((p): p is NonNullable<typeof p> => !!p).slice(0, 6);
  if (!uniq.length) return {};
  const { getSecret } = await import("@/lib/services/secrets");
  const token = (await getSecret(userId, "github_read")) ?? (await getSecret(userId, "github"));
  const out: Record<string, PrStatus | null> = {};
  await Promise.all(uniq.map(async (p) => {
    const base = `/repos/${p.owner}/${p.repo}`;
    const pr = await gh<{ title: string; state: string; merged: boolean; draft: boolean; head: { sha: string } }>(`${base}/pulls/${p.number}`, token);
    if (!pr) { out[p.url] = null; return; }
    const [checks, reviews] = await Promise.all([
      gh<{ check_runs: { status: string; conclusion: string | null }[] }>(`${base}/commits/${pr.head.sha}/check-runs?per_page=50`, token),
      gh<{ state: string; user: { login: string } }[]>(`${base}/pulls/${p.number}/reviews?per_page=50`, token),
    ]);
    const runs = checks?.check_runs ?? [];
    const latest = new Map<string, string>();
    for (const r of reviews ?? []) if (r.state !== "COMMENTED") latest.set(r.user.login, r.state);
    const states = [...latest.values()];
    out[p.url] = {
      url: p.url, title: pr.title.slice(0, 200),
      state: pr.merged ? "merged" : pr.state === "closed" ? "closed" : pr.draft ? "draft" : "open",
      checks: !runs.length ? "none" : runs.some((r) => r.status !== "completed") ? "running"
        : runs.some((r) => ["failure", "timed_out", "cancelled", "action_required"].includes(r.conclusion ?? "")) ? "failing" : "passing",
      review: states.includes("CHANGES_REQUESTED") ? "changes" : states.includes("APPROVED") ? "approved" : "pending",
    };
  }));
  return out;
}
