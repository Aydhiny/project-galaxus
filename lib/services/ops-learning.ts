// Learning from your decisions (the pure rules are in lib/ops-learning.ts).
// Outreach and Ops call these when you decide something; each one updates a
// single "preference" memory per category + website status (same source key),
// so repeats change a tally instead of piling up memories. The business finder
// reads them back through preferencesFor to rank what it finds.

import { and, eq, like } from "drizzle-orm";
import { db } from "@/lib/db";
import { opsMemories } from "@/lib/db/schema";
import { mergeTables } from "@/lib/ops";
import { colIndex } from "@/lib/ops-progress";
import {
  PREF_PREFIX, addCounts, categoryKey, gapsBucket, leadDecisionDelta, parsePrefCounts, parsePrefSource, prefMemory, prefSource,
  type PrefDelta, type Preference, type WebsiteBucket,
} from "@/lib/ops-learning";

/** Every learned preference (category + website status → tally). Cheap: one indexed query. */
export async function preferencesFor(userId: number): Promise<Preference[]> {
  const rows = await db.select({ source: opsMemories.source, body: opsMemories.body }).from(opsMemories)
    .where(and(eq(opsMemories.userId, userId), eq(opsMemories.type, "preference"), like(opsMemories.source, `${PREF_PREFIX}%`))).limit(300);
  return rows.flatMap((r) => {
    const k = parsePrefSource(r.source);
    return k ? [{ ...k, counts: parsePrefCounts(r.body) }] : [];
  });
}

/**
 * Add one decision to a pair's tally and rewrite its memory. Read-then-write: two decisions on the
 * same pair in the same instant could lose one count, which is fine for a ranking hint.
 */
export async function recordDecision(userId: number, category: string, bucket: WebsiteBucket, delta: PrefDelta, note?: string | null) {
  const source = prefSource(category, bucket);
  const [prev] = await db.select({ body: opsMemories.body }).from(opsMemories).where(and(eq(opsMemories.userId, userId), eq(opsMemories.source, source))).limit(1);
  const counts = addCounts(parsePrefCounts(prev?.body), delta);
  const { remember } = await import("@/lib/services/ops-memory");
  // A decision without a note keeps the last one ("only dentists in the centre" is worth more than the click after it).
  const m = prefMemory(category, bucket, counts, note || prev?.body.match(/^Last note: (.+)$/m)?.[1]);
  return remember(userId, { type: "preference", title: m.title, body: m.body, source, touch: true });
}

/** An Outreach lead changed: learn from a skip (not a fit / wrong business), its undo, or a step forward. Never throws. */
export async function learnFromLeadUpdate(
  userId: number,
  before: { status: string; skipReason: string | null; category: string | null; gaps: string[] | null; website: string | null },
  after: { status: string; skipReason: string | null },
) {
  try {
    const delta = leadDecisionDelta(before, after);
    if (!delta) return null;
    const note = after.status === "skipped" && after.skipReason ? `last skipped as "${after.skipReason.replace(/_/g, " ")}"` : null;
    return await recordDecision(userId, categoryKey(before.category), gapsBucket(before.gaps, before.website), delta, note);
  } catch { return null; }
}

/**
 * You accepted or sent back a mission. A sheet of businesses teaches per category (from its
 * Category column); any other result teaches about that kind of mission. Never throws.
 */
export async function learnFromMissionReview(userId: number, m: { kind: string; deliverable: string | null }, verdict: "accept" | "sendBack", note?: string | null) {
  try {
    const delta: PrefDelta = verdict === "accept" ? { accept: 1 } : { sendBack: 1 };
    const sheet = mergeTables([m.deliverable ?? ""]);
    const cat = sheet.length > 1 ? colIndex(sheet[0], ["Category", "Type", "Business type"]) : -1;
    const cats = cat >= 0 ? [...new Set(sheet.slice(1).map((r) => categoryKey(r[cat])).filter((c) => c !== "other"))].slice(0, 5) : [];
    if (!cats.length) cats.push(`${m.kind}_mission`);
    for (const c of cats) await recordDecision(userId, c, "any", delta, note);
    return cats.length;
  } catch { return 0; }
}
