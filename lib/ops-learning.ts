// Learning from your decisions. Every time you skip a lead (not a fit / wrong
// business), move one forward (replied, meeting, client), or accept / send back
// an Ops mission, the decision is tallied by business category + website status
// ("dentists with a good website"). The tallies live in shared memory (type
// "preference", one memory per pair, updated in place), so the planner reads
// them, and the business finder ranks with them. Pure, so it's unit-tested.

import { OSM_TYPES } from "@/lib/outreach";

export type WebsiteBucket = "none" | "social" | "broken" | "weak" | "good" | "any";
export type PrefCounts = { skip: number; advance: number; accept: number; sendBack: number };
export type PrefDelta = Partial<PrefCounts>;
export type Preference = { category: string; bucket: WebsiteBucket; counts: PrefCounts };

export const EMPTY_COUNTS: PrefCounts = { skip: 0, advance: 0, accept: 0, sendBack: 0 };
export const PREF_PREFIX = "pref:";

const BUCKET_LABEL: Record<WebsiteBucket, string> = {
  none: "no website", social: "only a Facebook/Instagram page", broken: "a broken website", weak: "a weak website", good: "a good website", any: "",
};

/**
 * "Dentists", "Dentist", "dentist", "Stomatolog (Dentists)" → "dentist" (an OSM type key when it is one),
 * else a short slug of the text. Leads and ops sheets name categories differently; this makes them meet.
 */
export function categoryKey(raw: string | null | undefined): string {
  const t = String(raw ?? "").toLowerCase().replace(/[^\p{L}\p{N}&, ]+/gu, " ").replace(/\s+/g, " ").trim();
  if (!t) return "other";
  for (const o of OSM_TYPES) {
    const label = o.label.toLowerCase();
    const first = label.split(/[&,]/)[0].trim().replace(/s$/, ""); // "hair salons" → "hair salon"
    if (t === o.key || t === label || t.replace(/s$/, "") === o.key || t.replace(/s$/, "") === first || t.includes(label)) return o.key;
  }
  return t.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/s$/, "").slice(0, 30) || "other";
}

/** A finder row's "Website status" text → bucket. */
export function statusBucket(status: string | null | undefined): WebsiteBucket {
  const s = String(status ?? "");
  if (/no website/i.test(s)) return "none";
  if (/facebook|instagram/i.test(s)) return "social";
  if (/broken/i.test(s)) return "broken";
  if (/outdated|mobile|booking|https/i.test(s)) return "weak";
  if (/^good$/i.test(s.trim())) return "good";
  return "any"; // unknown (the finder ran out of time before checking it)
}

/** An Outreach lead's gaps (+ whether it has a website at all) → bucket. */
export function gapsBucket(gaps: string[] | null | undefined, website?: string | null): WebsiteBucket {
  const g = gaps ?? [];
  if (g.includes("no_website")) return "none";
  if (g.includes("social_only")) return "social";
  if (g.includes("site_down")) return "broken";
  if (g.some((x) => ["no_booking", "not_mobile", "outdated", "no_https"].includes(x))) return "weak";
  return website ? "good" : g.length ? "weak" : "any";
}

/** The memory's source key: stable per pair, so a repeat updates the same memory instead of adding one. */
export const prefSource = (category: string, bucket: WebsiteBucket) => `${PREF_PREFIX}${category}:${bucket}`.slice(0, 60);

export function parsePrefSource(source: string): { category: string; bucket: WebsiteBucket } | null {
  const m = source.match(/^pref:([^:]+):(none|social|broken|weak|good|any)$/);
  return m ? { category: m[1], bucket: m[2] as WebsiteBucket } : null;
}

/** The tally line at the end of the memory's body (machine-readable, and plain enough for an agent to read). */
export function parsePrefCounts(body: string | null | undefined): PrefCounts {
  const m = String(body ?? "").match(/\[tally: skipped (\d+) · advanced (\d+) · accepted (\d+) · sent back (\d+)\]/);
  return m ? { skip: +m[1], advance: +m[2], accept: +m[3], sendBack: +m[4] } : { ...EMPTY_COUNTS };
}

export function addCounts(a: PrefCounts, d: PrefDelta): PrefCounts {
  const k = (x: keyof PrefCounts) => Math.max(0, a[x] + (d[x] ?? 0));
  return { skip: k("skip"), advance: k("advance"), accept: k("accept"), sendBack: k("sendBack") };
}

const plural = (cat: string) => {
  const t = OSM_TYPES.find((o) => o.key === cat);
  return t ? t.label.toLowerCase() : cat.replace(/_/g, " ").replace(/([^s])$/, "$1s");
};
const subject = (cat: string, bucket: WebsiteBucket) => `${plural(cat)}${bucket === "any" ? "" : ` with ${BUCKET_LABEL[bucket]}`}`;

/**
 * The memory for one pair, e.g. title "Skipped: dentists with a good website (3×)".
 * The title leads with the strongest signal, so the planner's brief reads at a glance.
 */
export function prefMemory(category: string, bucket: WebsiteBucket, c: PrefCounts, lastNote?: string | null) {
  const what = subject(category, bucket);
  const neg = c.skip + c.sendBack, pos = c.advance + c.accept;
  const title = neg >= pos
    ? `${c.skip >= c.sendBack ? "Skipped" : "Sent back"}: ${what} (${Math.max(c.skip, c.sendBack)}×)`
    : `${c.advance >= c.accept ? "Moved forward" : "Accepted"}: ${what} (${Math.max(c.advance, c.accept)}×)`;
  const lean = neg > pos ? "The user tends to pass on these: rank them lower and find fewer." : pos > neg ? "The user likes these: rank them higher and find more." : "Mixed signals so far.";
  const body = [
    `The user's decisions on ${what}. ${lean}`,
    lastNote ? `Last note: ${lastNote.replace(/\s+/g, " ").slice(0, 200)}` : "",
    `[tally: skipped ${c.skip} · advanced ${c.advance} · accepted ${c.accept} · sent back ${c.sendBack}]`,
  ].filter(Boolean).join("\n");
  return { title, body };
}

/**
 * How much the user likes a pair, in (-1, 1). Moving a lead forward counts double (a real reply
 * beats a click); smoothing (+2) keeps one decision from swinging the ranking.
 */
export function pairWeight(c: PrefCounts | undefined) {
  if (!c) return 0;
  const pos = c.advance * 2 + c.accept, neg = c.skip + c.sendBack;
  return (pos - neg) / (pos + neg + 2);
}

/** The learned factor for one business: its exact pair matters most, the category as a whole a little. */
export function learnedWeight(prefs: Preference[], category: string, status: string) {
  const cat = categoryKey(category), bucket = statusBucket(status);
  const find = (b: WebsiteBucket) => prefs.find((p) => p.category === cat && p.bucket === b)?.counts;
  // The category's overall lean: every pair in it, summed.
  const all = prefs.filter((p) => p.category === cat).reduce((s, p) => addCounts(s, p.counts), { ...EMPTY_COUNTS });
  return bucket === "any" ? pairWeight(all) : 0.7 * pairWeight(find(bucket)) + 0.3 * pairWeight(all);
}

export type RankableRow = { category: string; websiteStatus: string; phone: string };

/** The finder's need tier: no website first, then social-only, broken, weak, good (and unchecked last). */
export const needTier = (status: string) => (/No website/.test(status) ? 0 : /Facebook|Instagram/.test(status) ? 1 : /broken/.test(status) ? 2 : /outdated|mobile/.test(status) ? 3 : 4);

/**
 * Sort businesses: who needs a website most, adjusted by what you've learned to like (a strong
 * lean moves a row about two tiers), then who has a phone. Stable for ties.
 */
export function rankBusinessRows<T extends RankableRow>(rows: T[], prefs: Preference[]): T[] {
  const score = (r: T) => (4 - needTier(r.websiteStatus)) + 3 * learnedWeight(prefs, r.category, r.websiteStatus) + (r.phone ? 0.5 : 0);
  return rows.map((r, i) => ({ r, i, s: score(r) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.r);
}

/** Lead status changes that teach us something: a skip (with its reason) or a step forward. */
export const ADVANCE_STATUSES = ["replied", "meeting", "client"] as const;
export const SKIP_REASONS = ["wrong_business", "not_a_fit"] as const;

/** What one lead update means for the tally (null = nothing to learn). Undoing a skip takes it back. */
export function leadDecisionDelta(before: { status: string; skipReason: string | null }, after: { status: string; skipReason: string | null }): PrefDelta | null {
  const wasSkip = before.status === "skipped" && (SKIP_REASONS as readonly string[]).includes(before.skipReason ?? "");
  const isSkip = after.status === "skipped" && (SKIP_REASONS as readonly string[]).includes(after.skipReason ?? "");
  const adv = (s: string) => (ADVANCE_STATUSES as readonly string[]).includes(s);
  if (isSkip && !wasSkip) return { skip: 1 };
  if (wasSkip && !isSkip) return { skip: -1, ...(adv(after.status) ? { advance: 1 } : {}) };
  if (adv(after.status) && !adv(before.status)) return { advance: 1 };
  if (adv(before.status) && !adv(after.status) && !isSkip) return { advance: -1 }; // undo a "replied" tap
  return null;
}

/** The planner's line: the strongest preferences, most decided first. */
export function preferenceSummary(prefs: Preference[], max = 6) {
  return prefs
    .map((p) => ({ p, n: p.counts.skip + p.counts.advance + p.counts.accept + p.counts.sendBack }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map(({ p }) => `- ${prefMemory(p.category, p.bucket, p.counts).title}`)
    .join("\n");
}
