// Spacing calls to free providers with tight per-second limits (Mistral's free
// tier is ~1 request/second, so two agents and a health check firing together
// got a 429). Each call reserves the next slot in the provider's row
// (free_llm_keys.last_call_at) and waits for it; the reservation is a
// compare-and-set, so parallel runs (and parallel server functions) queue up
// instead of colliding. Rules in lib/free-limits.ts.

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { freeLlmKeys } from "@/lib/db/schema";
import { MAX_SPACING_WAIT_MS, minGapMs, nextSlot } from "@/lib/free-limits";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wait for this provider's next free slot. Returns false (without waiting) when
 * the queue is longer than `maxWaitMs`: better to use another provider than to
 * hold a server function.
 */
export async function waitTurn(keyId: number, provider: string, maxWaitMs = MAX_SPACING_WAIT_MS): Promise<boolean> {
  const gap = minGapMs(provider);
  if (!gap) return true;
  for (let tries = 0; tries < 5; tries++) {
    const [row] = await db.select({ last: freeLlmKeys.lastCallAt }).from(freeLlmKeys).where(eq(freeLlmKeys.id, keyId)).limit(1);
    if (!row) return false;
    const now = Date.now();
    const slot = nextSlot(row.last, gap, now);
    if (slot - now > maxWaitMs) return false;
    // Only if nobody took a slot since we read it; otherwise read again.
    const taken = await db.update(freeLlmKeys).set({ lastCallAt: new Date(slot) })
      .where(and(eq(freeLlmKeys.id, keyId), row.last ? eq(freeLlmKeys.lastCallAt, row.last) : isNull(freeLlmKeys.lastCallAt)))
      .returning({ id: freeLlmKeys.id });
    if (taken.length) {
      if (slot > now) await sleep(slot - now);
      return true;
    }
  }
  return false;
}
