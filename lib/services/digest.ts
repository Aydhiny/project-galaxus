// Daily brief: once per local day — fetch the feeds, fill in missing images
// from each article's og:image (one small request per chosen story), save,
// then queue Claude (no tools) to write the brief on the subscription runner.
// If Claude can't run, the headlines alone still make a good page.

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { digests, outreachSettings, userSettings, voiceCommands, type Digest } from "@/lib/db/schema";
import { FEEDS, SECTION_META, ogImageFrom, parseFeed, parseBriefing, selectItems, type DigestItem } from "@/lib/digest";
import { localNow } from "@/lib/outreach";
import { parseJsonReply } from "@/lib/claude-jobs";
import { notifyUser } from "@/lib/services/outreach/push";

const UA = "Mozilla/5.0 (compatible; GalaxusBrief/1.0; daily personal news digest)";

async function timezoneFor(userId: number) {
  const [row] = await db.select({ tz: outreachSettings.timezone }).from(outreachSettings).where(eq(outreachSettings.userId, userId)).limit(1);
  return row?.tz ?? "Europe/Sarajevo";
}

async function fetchText(url: string, maxBytes: number, timeoutMs: number): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store", redirect: "follow" });
  if (!res.ok || !res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** Missing images: read the article's og:image (only the <head>, ~120 KB max). */
async function fillImages(items: DigestItem[], limit = 45) {
  const todo = items.filter((i) => !i.image).slice(0, limit);
  for (let i = 0; i < todo.length; i += 9) {
    await Promise.all(
      todo.slice(i, i + 9).map(async (it) => {
        try {
          it.image = ogImageFrom(await fetchText(it.link, 120_000, 6_000));
        } catch {
          /* no image is fine */
        }
      })
    );
  }
}

export async function collectHeadlines(): Promise<DigestItem[]> {
  const lists = await Promise.all(
    FEEDS.map(async (f) => {
      try {
        return parseFeed(await fetchText(f.url, 3_000_000, 12_000), f);
      } catch {
        return []; // one broken feed never sinks the brief
      }
    })
  );
  const items = selectItems(lists.flat());
  await fillImages(items);
  return items;
}

/**
 * Build today's brief if it doesn't exist yet (idempotent — safe to call from
 * every scheduler beat and every page view). Returns the row.
 */
export async function ensureTodayDigestFor(userId: number, opts: { force?: boolean } = {}): Promise<Digest | null> {
  const local = localNow(await timezoneFor(userId));
  const [existing] = await db.select().from(digests).where(and(eq(digests.userId, userId), eq(digests.day, local.day))).limit(1);
  if (existing && !opts.force) return existing;
  if (!opts.force && local.minutes < 6 * 60) return null; // the day's news starts at 06:00 your time

  const items = await collectHeadlines();
  if (items.length === 0) return existing ?? null;
  const [row] = existing
    ? await db.update(digests).set({ items, briefing: null, createdAt: new Date() }).where(eq(digests.id, existing.id)).returning()
    : await db.insert(digests).values({ userId, day: local.day, items }).onConflictDoNothing().returning();
  if (!row) return (await db.select().from(digests).where(and(eq(digests.userId, userId), eq(digests.day, local.day))).limit(1))[0] ?? null;

  // Claude writes the brief on the runner; imported lazily to avoid an import cycle.
  const { enqueueJobFor } = await import("@/lib/services/claude-jobs");
  try {
    await enqueueJobFor(userId, "digest", `Daily brief · ${local.day}`, { digestId: row.id });
  } catch {
    await notifyBrief(userId, row); // rate-limited: still tell them the headlines are in
  }
  return row;
}

export async function digestFor(userId: number, day?: string) {
  const [row] = day
    ? await db.select().from(digests).where(and(eq(digests.userId, userId), eq(digests.day, day))).limit(1)
    : await db.select().from(digests).where(eq(digests.userId, userId)).orderBy(desc(digests.day)).limit(1);
  const recent = await db.select({ day: digests.day }).from(digests).where(eq(digests.userId, userId)).orderBy(desc(digests.day)).limit(14);
  const [prefs] = await db.select({ on: userSettings.notifyDailyBrief }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  // Is Claude still working on this day's brief? (a queued/running digest job for it)
  const pending = row && !row.briefing
    ? (await db.select({ id: voiceCommands.id }).from(voiceCommands)
        .where(and(eq(voiceCommands.userId, userId), eq(voiceCommands.kind, "digest"), inArray(voiceCommands.status, ["queued", "running"]),
          sql`(${voiceCommands.payload} ->> 'digestId')::int = ${row.id}`)).limit(1)).length > 0
    : false;
  return { digest: row ?? null, days: recent.map((r) => r.day), notify: prefs?.on ?? true, pending };
}

export async function setBriefNotificationsFor(userId: number, on: boolean) {
  await db.insert(userSettings).values({ userId, notifyDailyBrief: on })
    .onConflictDoUpdate({ target: userSettings.userId, set: { notifyDailyBrief: on, updatedAt: new Date() } });
}

/** Job result → briefing on the digest row. */
export async function applyDigestResult(userId: number, digestId: number, text: string): Promise<string> {
  const [row] = await db.select().from(digests).where(and(eq(digests.id, digestId), eq(digests.userId, userId))).limit(1);
  if (!row) throw new Error("Digest not found.");
  const briefing = parseBriefing(parseJsonReply(text), row.items);
  if (!briefing) throw new Error("Claude's brief couldn't be read.");
  const [updated] = await db.update(digests).set({ briefing }).where(eq(digests.id, row.id)).returning();
  await notifyBrief(userId, updated);
  return briefing.oneLiner || "Your daily brief is ready";
}

/** Push + bell, only if the user wants it. Uses the top story's image when there is one. */
export async function notifyBrief(userId: number, d: Digest) {
  const [prefs] = await db.select({ on: userSettings.notifyDailyBrief }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  if (prefs && prefs.on === false) return;
  const first = d.briefing?.sections[0]?.items[0];
  const story = first ? d.items.find((i) => i.id === first.id) : d.items.find((i) => i.image);
  const sections = d.briefing ? d.briefing.sections.map((s) => SECTION_META[s.section].emoji).join(" ") : "";
  await notifyUser(userId, {
    title: d.briefing ? `☀️ Your daily brief ${sections}` : "☀️ Today's headlines are in",
    body: (d.briefing?.oneLiner || first?.headline || story?.title || "Islam, Bosnia, world, tech and nature — in 3 minutes.").slice(0, 160),
    url: "/brief",
    tag: `brief-${d.day}`,
    image: story?.image ?? undefined,
  }).catch(() => {});
}
