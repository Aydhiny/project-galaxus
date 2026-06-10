"use server";

import { db } from "@/lib/db";
import { beatSales, beats } from "@/lib/db/schema";
import { eq, desc, sum } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { BeatSale } from "@/lib/db/schema";

export async function getBeatSales(): Promise<(BeatSale & { beatName: string | null })[]> {
  try {
    const rows = await db
      .select({
        id: beatSales.id,
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
  const [row] = await db.insert(beatSales).values(data).returning();
  revalidatePath("/beats");
  return row;
}

export async function deleteBeatSale(id: number): Promise<void> {
  await db.delete(beatSales).where(eq(beatSales.id, id));
  revalidatePath("/beats");
}

export async function getTotalRevenueCents(): Promise<number> {
  try {
    const result = await db.select({ total: sum(beatSales.amountCents) }).from(beatSales);
    return Number(result[0]?.total ?? 0);
  } catch {
    return 0;
  }
}
