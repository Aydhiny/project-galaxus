import { auth } from "@/auth";

/**
 * Every server action must call this first. Middleware already blocks
 * unauthenticated requests from reaching these routes, so a missing
 * session here means something is wrong (e.g. called outside a request
 * context) rather than an expected guest visit.
 */
export async function requireUserId(): Promise<number> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error("Not authenticated.");
  return Number(id);
}
