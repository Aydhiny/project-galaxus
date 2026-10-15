// Rate limits that hold across serverless instances. lib/ratelimit.ts keeps
// its counters in one instance's memory, so on Vercel an attacker spread over
// many cold starts (or just a busy deploy) gets a fresh budget per instance.
// This one counts in Postgres: one upsert per attempt, a fixed window per key.
//
// Use it where the budget really matters (login, register, password reset).
// If the database can't be reached it falls back to the in-memory limiter,
// so a DB hiccup degrades the limit instead of locking everyone out.

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/ratelimit";

type Rows = { rows?: { hits: number; left: number }[] };

export async function hitRateLimit(key: string, max: number, windowMs: number): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const k = key.slice(0, 200);
  const secs = Math.max(1, Math.ceil(windowMs / 1000));
  try {
    // All times are the database's now(), so app-server clocks and time zones never matter.
    const r = (await db.execute(sql`
      insert into "rate_limits" ("key", "hits", "reset_at") values (${k}, 1, now() + (${secs}::int * interval '1 second'))
      on conflict ("key") do update set
        "hits" = case when "rate_limits"."reset_at" <= now() then 1 else "rate_limits"."hits" + 1 end,
        "reset_at" = case when "rate_limits"."reset_at" <= now() then excluded."reset_at" else "rate_limits"."reset_at" end
      returning "hits", greatest(1, ceil(extract(epoch from ("reset_at" - now()))))::int as "left"`)) as unknown as Rows;
    const row = r.rows?.[0];
    if (!row) throw new Error("no row returned");
    const hits = Number(row.hits);
    return hits <= max ? { allowed: true, retryAfterSeconds: 0 } : { allowed: false, retryAfterSeconds: Number(row.left) };
  } catch (e) {
    console.error("[rate-limit] database limiter unavailable, using the per-instance one:", e instanceof Error ? e.message : e);
    return checkRateLimit(`db-fallback:${k}`, max, windowMs);
  }
}

/** Forget a key (e.g. after a successful sign-in). */
export async function clearRateLimit(key: string) {
  try {
    await db.execute(sql`delete from "rate_limits" where "key" = ${key.slice(0, 200)}`);
  } catch {
    /* best effort */
  }
}
