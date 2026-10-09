"use server";

import { db } from "@/lib/db";
import { workspacePages } from "@/lib/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";
import { createBlock, sanitizeBlocks, type Block } from "@/lib/blocks";

export interface PageSummary {
  id: number;
  parentId: number | null;
  title: string;
  icon: string | null;
  isFavorite: boolean;
  updatedAt: Date | null;
}

/** Sidebar tree data — deliberately excludes `blocks` so the list query stays tiny. */
export async function listPages(): Promise<PageSummary[]> {
  try {
    const userId = await requireUserId();
    return await db
      .select({
        id: workspacePages.id,
        parentId: workspacePages.parentId,
        title: workspacePages.title,
        icon: workspacePages.icon,
        isFavorite: workspacePages.isFavorite,
        updatedAt: workspacePages.updatedAt,
      })
      .from(workspacePages)
      .where(eq(workspacePages.userId, userId))
      .orderBy(asc(workspacePages.orderIndex), asc(workspacePages.id));
  } catch {
    return [];
  }
}

export async function getPage(id: number) {
  try {
    const userId = await requireUserId();
    const rows = await db
      .select()
      .from(workspacePages)
      .where(and(eq(workspacePages.id, id), eq(workspacePages.userId, userId)))
      .limit(1);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function createPage(parentId?: number | null): Promise<number> {
  const userId = await requireUserId();

  // Ownership check on the parent — never let a page be nested under someone else's.
  if (parentId) {
    const parent = await getPage(parentId);
    if (!parent) throw new Error("Parent page not found.");
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workspacePages)
    .where(eq(workspacePages.userId, userId));

  const [row] = await db
    .insert(workspacePages)
    .values({
      userId,
      parentId: parentId ?? null,
      title: "",
      blocks: [createBlock("paragraph")],
      orderIndex: count,
    })
    .returning({ id: workspacePages.id });

  revalidatePath("/pages", "layout");
  return row.id;
}

/**
 * Autosave target. Content-only saves (blocks) intentionally skip
 * revalidatePath: the editor already holds the latest state, and re-rendering
 * the route on every debounced keystroke would be wasted server work.
 */
export async function savePage(
  id: number,
  patch: { title?: string; icon?: string | null; blocks?: Block[] }
) {
  const userId = await requireUserId();
  const values: Partial<typeof workspacePages.$inferInsert> = { updatedAt: new Date() };
  if (patch.title !== undefined) values.title = patch.title.slice(0, 255);
  if (patch.icon !== undefined) values.icon = patch.icon ? patch.icon.slice(0, 16) : null;
  if (patch.blocks !== undefined) values.blocks = sanitizeBlocks(patch.blocks);

  await db
    .update(workspacePages)
    .set(values)
    .where(and(eq(workspacePages.id, id), eq(workspacePages.userId, userId)));

  if (patch.title !== undefined || patch.icon !== undefined) revalidatePath("/pages", "layout");
}

export async function toggleFavoritePage(id: number) {
  const userId = await requireUserId();
  await db
    .update(workspacePages)
    .set({ isFavorite: sql`not ${workspacePages.isFavorite}` })
    .where(and(eq(workspacePages.id, id), eq(workspacePages.userId, userId)));
  revalidatePath("/pages", "layout");
}

/** Hard delete — child pages go with it (ON DELETE CASCADE on parent_id). */
export async function deletePage(id: number) {
  const userId = await requireUserId();
  await db
    .delete(workspacePages)
    .where(and(eq(workspacePages.id, id), eq(workspacePages.userId, userId)));
  revalidatePath("/pages", "layout");
}
