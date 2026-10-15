"use server";

import { db } from "@/lib/db";
import { safeFetch } from "@/lib/safe-fetch";
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
  patch: { title?: string; icon?: string | null; blocks?: Block[]; cover?: string | null }
) {
  const userId = await requireUserId();
  const values: Partial<typeof workspacePages.$inferInsert> = { updatedAt: new Date() };
  if (patch.title !== undefined) values.title = patch.title.slice(0, 255);
  if (patch.icon !== undefined) values.icon = patch.icon ? patch.icon.slice(0, 16) : null;
  if (patch.blocks !== undefined) values.blocks = sanitizeBlocks(patch.blocks);
  if (patch.cover !== undefined) values.cover = patch.cover && /^(grad:[a-z]{2,20}|\/api\/page-files\/[\w-]{8,64})$/.test(patch.cover) ? patch.cover : null;

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

/**
 * Web bookmark preview (title, description, image) for a pasted link.
 * Guarded against SSRF: https only, no IP literals or internal hostnames,
 * 6 s timeout, and only the first 300 KB of the page is read.
 */
export async function linkPreview(url: string) {
  await requireUserId();
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || /^[\d.]+$/.test(host) || host.includes(":") || host === "localhost" || /\.(local|internal|lan|home)$/.test(host) || !host.includes(".")) return null;
  try {
    // safeFetch also checks what the name resolves to and every redirect hop (a redirect to 169.254.169.254 used to be followed).
    const res = await safeFetch(u, { headers: { "User-Agent": "Mozilla/5.0 (compatible; GalaxusBot/1.0; link preview)", Accept: "text/html" } }, { timeoutMs: 6000, httpsOnly: true });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("text/html")) return { title: host, site: host };
    const reader = res.body?.getReader();
    let html = "", got = 0;
    const decoder = new TextDecoder(); // one streaming decoder, so multi-byte characters split across chunks survive
    while (reader && got < 300_000) { const { done, value } = await reader.read(); if (done) break; got += value.length; html += decoder.decode(value, { stream: true }); }
    reader?.cancel().catch(() => {});
    const meta = (name: string) => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`, "i"))?.[1]
      ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`, "i"))?.[1];
    const dec = (s?: string) => s?.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
    let image = meta("og:image") ?? meta("twitter:image");
    if (image && image.startsWith("/")) image = new URL(image, u).href;
    return {
      title: dec(meta("og:title") ?? html.match(/<title[^>]*>([^<]{1,300})<\/title>/i)?.[1])?.slice(0, 300) ?? host,
      description: dec(meta("og:description") ?? meta("description"))?.slice(0, 600),
      image: image && image.startsWith("https://") ? image.slice(0, 1000) : undefined,
      site: dec(meta("og:site_name"))?.slice(0, 100) ?? host.replace(/^www\./, ""),
    };
  } catch {
    return { title: host, site: host.replace(/^www\./, "") };
  }
}
