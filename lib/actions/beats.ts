"use server";

import { db } from "@/lib/db";
import { beats } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { Beat } from "@/lib/db/schema";
import { requireUserId } from "@/lib/auth-session";

export async function getBeats(): Promise<Beat[]> {
  try {
    const userId = await requireUserId();
    return await db.select().from(beats).where(eq(beats.userId, userId)).orderBy(desc(beats.createdAt));
  } catch {
    return [];
  }
}

export async function createBeat(data: {
  name: string;
  bpm?: number | null;
  key?: string | null;
  mood?: string | null;
  genre?: string | null;
  status?: string;
  client?: string | null;
  notes?: string | null;
  producedAt?: string | null;
}): Promise<Beat> {
  const userId = await requireUserId();
  const [row] = await db.insert(beats).values({ ...data, userId }).returning();
  revalidatePath("/beats");
  return row;
}

export async function updateBeat(
  id: number,
  data: Partial<Omit<Beat, "id" | "userId" | "createdAt">>
): Promise<void> {
  const userId = await requireUserId();
  await db.update(beats).set({ ...data, updatedAt: new Date() }).where(and(eq(beats.id, id), eq(beats.userId, userId)));
  revalidatePath("/beats");
}

export async function deleteBeat(id: number): Promise<void> {
  const userId = await requireUserId();
  await db.delete(beats).where(and(eq(beats.id, id), eq(beats.userId, userId)));
  revalidatePath("/beats");
}
