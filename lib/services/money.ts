// Money dashboard: income entries + beat sales + client retainers + an
// optional Stripe sync with the user's OWN restricted key (never the app's
// platform key — other people's Galaxus subscriptions aren't your income).

import Stripe from "stripe";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { beatSales, income, leads, userSettings } from "@/lib/db/schema";
import { toKmCents, type Currency } from "@/lib/money";
import { getSecret, setSecret } from "@/lib/services/secrets";

async function settings(userId: number) {
  const [s] = await db.select({ goal: userSettings.incomeGoalKm, usd: userSettings.usdToKm }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  return { goalKm: s?.goal ?? null, usdToKm: s?.usd ?? 1.8 };
}

export async function moneyFor(userId: number) {
  const since = new Date(Date.now() - 400 * 86_400_000);
  const [s, rows, beats, clients, stripeKey] = await Promise.all([
    settings(userId),
    db.select().from(income).where(and(eq(income.userId, userId), gte(income.receivedAt, since))).orderBy(desc(income.receivedAt)),
    db.select().from(beatSales).where(eq(beatSales.userId, userId)),
    db.select({ id: leads.id, name: leads.name, retainerKm: leads.retainerKm }).from(leads).where(and(eq(leads.userId, userId), eq(leads.status, "client"))),
    getSecret(userId, "stripe"),
  ]);
  // Beat sales live in their own table (Beat Catalog); BeatStars pays USD.
  const beatRows = beats.map((b) => ({
    id: -b.id, source: "beat", amountKmCents: toKmCents(b.amountCents, "USD", s.usdToKm),
    description: `Beat sale${b.platform ? ` · ${b.platform}` : ""}${b.client ? ` · ${b.client}` : ""}`, receivedAt: new Date(String(b.date) + "T12:00:00Z"),
  }));
  return {
    ...s,
    entries: [...rows.map((r) => ({ id: r.id, source: r.source, amountKmCents: r.amountKmCents, description: r.description, receivedAt: r.receivedAt })), ...beatRows]
      .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime()),
    clients,
    stripeConnected: !!stripeKey,
  };
}

export async function addIncomeFor(userId: number, input: { amount: number; currency: Currency; source: string; description?: string; receivedAt?: string; leadId?: number | null }) {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) throw new Error("Enter an amount.");
  const { usdToKm } = await settings(userId);
  const cents = Math.round(amount * 100);
  const [row] = await db.insert(income).values({
    userId,
    source: ["client", "retainer", "beat", "gig", "stripe", "other"].includes(input.source) ? input.source : "other",
    amountKmCents: toKmCents(cents, input.currency, usdToKm),
    originalAmountCents: cents,
    originalCurrency: input.currency,
    description: input.description?.trim().slice(0, 300) || null,
    leadId: input.leadId ?? null,
    receivedAt: input.receivedAt && /^\d{4}-\d{2}-\d{2}$/.test(input.receivedAt) ? new Date(input.receivedAt + "T12:00:00Z") : new Date(),
  }).returning();
  return row;
}

export async function deleteIncomeFor(userId: number, id: number) {
  await db.delete(income).where(and(eq(income.id, id), eq(income.userId, userId)));
}

export async function saveMoneySettingsFor(userId: number, patch: { goalKm?: number | null; usdToKm?: number }) {
  const set: { incomeGoalKm?: number | null; usdToKm?: number; updatedAt: Date } = { updatedAt: new Date() };
  if (patch.goalKm !== undefined) set.incomeGoalKm = patch.goalKm && patch.goalKm > 0 ? Math.round(patch.goalKm) : null;
  if (patch.usdToKm !== undefined && patch.usdToKm > 0.5 && patch.usdToKm < 5) set.usdToKm = patch.usdToKm;
  await db.insert(userSettings).values({ userId, ...set }).onConflictDoUpdate({ target: userSettings.userId, set });
}

/** Paste your own restricted Stripe key (read charges only). */
export async function saveStripeKeyFor(userId: number, key: string) {
  const k = key.trim();
  if (!k) return setSecret(userId, "stripe", null);
  if (!/^(rk|sk)_(live|test)_[A-Za-z0-9]{20,}$/.test(k)) throw new Error("That isn't a Stripe key — use a restricted key (rk_live_…) with Charges: Read.");
  await new Stripe(k).charges.list({ limit: 1 }); // prove it works
  await setSecret(userId, "stripe", k);
}

/** Daily: pull the last 35 days of successful charges into income (idempotent by charge id). */
export async function syncStripeFor(userId: number) {
  const key = await getSecret(userId, "stripe");
  if (!key) return { synced: 0, skipped: "no key" };
  const { usdToKm } = await settings(userId);
  const stripe = new Stripe(key);
  const charges = await stripe.charges.list({ limit: 100, created: { gte: Math.floor(Date.now() / 1000) - 35 * 86_400 } });
  let synced = 0;
  for (const c of charges.data) {
    if (c.status !== "succeeded" || c.refunded) continue;
    const cur = c.currency.toUpperCase() === "BAM" ? "KM" : c.currency.toUpperCase();
    if (!["KM", "EUR", "USD"].includes(cur)) continue;
    const net = c.amount - (c.amount_refunded ?? 0);
    const res = await db.insert(income).values({
      userId, source: "stripe", externalId: `stripe:${c.id}`, amountKmCents: toKmCents(net, cur, usdToKm),
      originalAmountCents: net, originalCurrency: cur, description: (c.description ?? c.billing_details?.name ?? "Stripe payment").slice(0, 300),
      receivedAt: new Date(c.created * 1000),
    }).onConflictDoNothing({ target: [income.userId, income.externalId] }).returning({ id: income.id });
    synced += res.length;
  }
  return { synced };
}
