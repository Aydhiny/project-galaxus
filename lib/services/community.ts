// Community scout: finds Discord servers worth joining — AI automation, vibe
// coding, video editing, web dev, freelancing — from two public places:
//   1. Reddit posts in relevant subreddits that share a discord.gg invite
//   2. GitHub's curated "awesome-discord-communities" list
// Every invite is checked with Discord's public invite endpoint (no key), so
// only live servers with real member counts are shown. Nothing joins for you.

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { communities, type Community } from "@/lib/db/schema";
import { classifyCommunity, communityRank, extractInviteCodes, iconUrl } from "@/lib/community";

const UA = "Galaxus/1.0 (personal community finder; https://project-galaxus.vercel.app)";
const SUBREDDITS = "n8n+automation+nocode+vibecoding+cursor+lovable+SideProject+indiehackers+VideoEditing+editors+premiere+NewTubers+webdev+freelance+forhire+Entrepreneur+gamedev+discordservers";
const AWESOME_LIST = "https://raw.githubusercontent.com/mhxion/awesome-discord-communities/main/README.md";

async function getText(url: string, timeoutMs = 15_000) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (!res.ok) throw new Error(`${new URL(url).hostname} ${res.status}`);
  return res.text();
}

type Found = { code: string; source: string; sourceUrl: string };

async function fromReddit(): Promise<Found[]> {
  const xml = await getText(`https://www.reddit.com/r/${SUBREDDITS}/search.rss?q=${encodeURIComponent("discord.gg OR \"discord server\"")}&restrict_sr=on&sort=new&t=month&limit=100`);
  const out: Found[] = [];
  for (const [, entry] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const link = entry.match(/<link href="([^"]+)"/)?.[1] ?? "https://www.reddit.com";
    const content = entry.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    for (const code of extractInviteCodes(content)) out.push({ code, source: "reddit", sourceUrl: link });
  }
  return out;
}

async function fromGithub(): Promise<Found[]> {
  const md = await getText(AWESOME_LIST);
  return extractInviteCodes(md).map((code) => ({ code, source: "github", sourceUrl: "https://github.com/mhxion/awesome-discord-communities" }));
}

type Invite = {
  guild?: { id: string; name: string; description: string | null; icon: string | null; features?: string[] };
  approximate_member_count?: number;
  approximate_presence_count?: number;
  expires_at?: string | null;
};

async function lookupInvite(code: string): Promise<Invite | null> {
  const res = await fetch(`https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=true`, {
    headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8_000), cache: "no-store",
  });
  if (res.status === 429) throw new Error("rate limited");
  if (!res.ok) return null; // expired / invalid invite
  return (await res.json()) as Invite;
}

export async function scanCommunitiesFor(userId: number, opts: { maxLookups?: number } = {}) {
  const maxLookups = opts.maxLookups ?? 40;
  const errors: string[] = [];
  const settled = await Promise.allSettled([fromReddit(), fromGithub()]);
  const found = settled.flatMap((r, i) => {
    if (r.status === "fulfilled") return r.value;
    errors.push(`${i === 0 ? "Reddit" : "GitHub"}: ${r.reason instanceof Error ? r.reason.message : "failed"}`);
    return [];
  });
  // Unique codes we haven't checked yet; Reddit (fresh) first.
  const known = new Set((await db.select({ code: communities.code }).from(communities).where(eq(communities.userId, userId))).map((r) => r.code.toLowerCase()));
  const todo = [...new Map(found.filter((f) => !known.has(f.code.toLowerCase())).map((f) => [f.code.toLowerCase(), f])).values()].slice(0, maxLookups);

  let added = 0;
  for (const f of todo) {
    let inv: Invite | null;
    try {
      inv = await lookupInvite(f.code);
    } catch {
      errors.push("Discord asked us to slow down — the rest are checked on the next run.");
      break;
    }
    await new Promise((r) => setTimeout(r, 350)); // polite pacing
    if (!inv?.guild || inv.expires_at) continue; // temporary invites die — only permanent ones
    const { topics, relevance } = classifyCommunity(inv.guild.name, inv.guild.description);
    if (topics.length === 0) continue; // not about your kind of work
    const row = {
      userId, code: f.code.slice(0, 40), guildId: inv.guild.id, name: inv.guild.name.slice(0, 120),
      description: inv.guild.description?.slice(0, 600) ?? null, icon: iconUrl(inv.guild.id, inv.guild.icon),
      members: inv.approximate_member_count ?? null, online: inv.approximate_presence_count ?? null,
      topics, relevance, source: f.source, sourceUrl: f.sourceUrl.slice(0, 500), checkedAt: new Date(),
    };
    const r = await db.insert(communities).values(row).onConflictDoNothing({ target: [communities.userId, communities.guildId] }).returning({ id: communities.id });
    added += r.length;
  }
  return { found: found.length, checked: todo.length, added, errors };
}

export async function communitiesFor(userId: number) {
  const rows = await db.select().from(communities).where(and(eq(communities.userId, userId), inArray(communities.status, ["new", "joined"]))).orderBy(desc(communities.relevance)).limit(300);
  return rows.sort((a, b) => communityRank(b) - communityRank(a));
}

export async function setCommunityStatusFor(userId: number, id: number, status: "new" | "joined" | "hidden") {
  await db.update(communities).set({ status }).where(and(eq(communities.id, id), eq(communities.userId, userId)));
}

export type { Community };
