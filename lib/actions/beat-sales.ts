"use server";

import { db } from "@/lib/db";
import { beatSales, beats } from "@/lib/db/schema";
import { and, eq, desc, sum } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { BeatSale } from "@/lib/db/schema";
import { requireUserId } from "@/lib/auth-session";

export async function getBeatSales(): Promise<(BeatSale & { beatName: string | null })[]> {
  try {
    const userId = await requireUserId();
    const rows = await db
      .select({
        id: beatSales.id,
        userId: beatSales.userId,
        beatId: beatSales.beatId,
        beatName: beats.name,
        date: beatSales.date,
        amountCents: beatSales.amountCents,
        platform: beatSales.platform,
        client: beatSales.client,
        notes: beatSales.notes,
        createdAt: beatSales.createdAt,
      })
      .from(beatSales)
      .leftJoin(beats, eq(beatSales.beatId, beats.id))
      .where(eq(beatSales.userId, userId))
      .orderBy(desc(beatSales.date));
    return rows;
  } catch {
    return [];
  }
}

export async function createBeatSale(data: {
  beatId?: number | null;
  date: string;
  amountCents: number;
  platform?: string | null;
  client?: string | null;
  notes?: string | null;
}): Promise<BeatSale> {
  const userId = await requireUserId();

  if (data.beatId != null) {
    const owned = await db.select({ id: beats.id }).from(beats).where(and(eq(beats.id, data.beatId), eq(beats.userId, userId))).limit(1);
    if (!owned[0]) throw new Error("Beat not found.");
  }

  const [row] = await db.insert(beatSales).values({ ...data, userId }).returning();
  revalidatePath("/beats");
  return row;
}

export async function deleteBeatSale(id: number): Promise<void> {
  const userId = await requireUserId();
  await db.delete(beatSales).where(and(eq(beatSales.id, id), eq(beatSales.userId, userId)));
  revalidatePath("/beats");
}

export async function getTotalRevenueCents(): Promise<number> {
  try {
    const userId = await requireUserId();
    const result = await db.select({ total: sum(beatSales.amountCents) }).from(beatSales).where(eq(beatSales.userId, userId));
    return Number(result[0]?.total ?? 0);
  } catch {
    return 0;
  }
}
