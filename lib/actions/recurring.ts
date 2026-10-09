"use server";

import { db } from "@/lib/db";
import { recurringTasks, tasks } from "@/lib/db/schema";
import { and, asc, eq, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";
import { TASK_PRIORITIES, isValidDaysMask, isValidTime, repeatsOn, type TaskPriority } from "@/lib/tasks";

const isPriority = (v: unknown): v is TaskPriority => TASK_PRIORITIES.includes(v as TaskPriority);

function revalidateTaskViews() {
  revalidatePath("/tasks");
  revalidatePath("/productivity");
}

export async function listRecurring() {
  try {
    const userId = await requireUserId();
    return await db
      .select()
      .from(recurringTasks)
      .where(eq(recurringTasks.userId, userId))
      .orderBy(asc(recurringTasks.time), asc(recurringTasks.id));
  } catch {
    return [];
  }
}

export async function createRecurring(input: { title: string; priority?: TaskPriority; days: string; time?: string | null }) {
  const userId = await requireUserId();
  const title = input.title.trim().slice(0, 500);
  if (!title) throw new Error("Title is required.");
  if (!isValidDaysMask(input.days)) throw new Error("Pick at least one day.");
  const [row] = await db
    .insert(recurringTasks)
    .values({
      userId,
      title,
      priority: isPriority(input.priority) ? input.priority : "none",
      days: input.days,
      time: isValidTime(input.time) ? input.time : null,
    })
    .returning();
  revalidateTaskViews();
  return row;
}

export async function updateRecurring(
  id: number,
  patch: { title?: string; priority?: TaskPriority; days?: string; time?: string | null; active?: boolean }
) {
  const userId = await requireUserId();
  const values: Partial<typeof recurringTasks.$inferInsert> = {};
  if (patch.title !== undefined && patch.title.trim()) values.title = patch.title.trim().slice(0, 500);
  if (patch.priority !== undefined && isPriority(patch.priority)) values.priority = patch.priority;
  if (patch.days !== undefined && isValidDaysMask(patch.days)) values.days = patch.days;
  if (patch.time !== undefined) values.time = isValidTime(patch.time) ? patch.time : null;
  if (typeof patch.active === "boolean") values.active = patch.active;
  if (Object.keys(values).length === 0) return;
  await db.update(recurringTasks).set(values).where(and(eq(recurringTasks.id, id), eq(recurringTasks.userId, userId)));
  revalidateTaskViews();
}

/** Deletes the template. Tasks it already created stay (recurring_id → null). */
export async function deleteRecurring(id: number) {
  const userId = await requireUserId();
  await db.delete(recurringTasks).where(and(eq(recurringTasks.id, id), eq(recurringTasks.userId, userId)));
  revalidateTaskViews();
}

/**
 * Materialise today's recurring tasks for the viewer's LOCAL date.
 *
 * Called by the client on load (the server doesn't know the user's timezone).
 * Idempotent: the unique index on (recurring_id, due_date) + ON CONFLICT DO
 * NOTHING means concurrent tabs can't create duplicates, and a removed
 * instance isn't recreated the same day.
 *
 * Also archives earlier unfinished instances, so missing "Gym" for a week
 * doesn't leave seven overdue copies — they stay in history (weekly review
 * counts them as missed) but leave your list.
 */
export async function ensureRecurringInstances(localToday: string): Promise<{ changed: boolean }> {
  const userId = await requireUserId();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localToday)) return { changed: false };
  // Accept only dates within a day of the server's clock (covers every
  // timezone) — the client can't pre-generate months of tasks.
  const drift = Math.abs(new Date(localToday + "T12:00:00Z").getTime() - Date.now());
  if (drift > 38 * 60 * 60 * 1000) return { changed: false };

  const templates = await db
    .select()
    .from(recurringTasks)
    .where(and(eq(recurringTasks.userId, userId), eq(recurringTasks.active, true)));
  const due = templates.filter((t) => repeatsOn(t.days, localToday));

  let created = 0;
  if (due.length > 0) {
    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(${tasks.orderIndex}), 0)::int` })
      .from(tasks)
      .where(eq(tasks.userId, userId));
    // Earlier times sort first among the new instances.
    const ordered = [...due].sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));
    const inserted = await db
      .insert(tasks)
      .values(
        ordered.map((t, i) => ({
          userId,
          title: t.title,
          priority: t.priority,
          dueDate: localToday,
          dueTime: t.time,
          recurringId: t.id,
          orderIndex: max + 1 + i,
        }))
      )
      .onConflictDoNothing({ target: [tasks.recurringId, tasks.dueDate] })
      .returning({ id: tasks.id });
    created = inserted.length;
  }

  const now = new Date();
  const archived = await db
    .update(tasks)
    .set({ deletedAt: now, deletionReviewedAt: now })
    .where(
      and(
        eq(tasks.userId, userId),
        isNotNull(tasks.recurringId),
        isNull(tasks.deletedAt),
        ne(tasks.status, "done"),
        lt(tasks.dueDate, localToday)
      )
    )
    .returning({ id: tasks.id });

  const changed = created > 0 || archived.length > 0;
  if (changed) revalidateTaskViews();
  return { changed };
}
