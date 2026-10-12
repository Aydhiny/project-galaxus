// The one super admin. Checked against the database (the account's email),
// never against anything the browser sends.
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const SUPER_ADMIN_EMAIL = "ayden.diagrampixel@gmail.com";

export async function isSuperAdmin(userId: number | null | undefined) {
  if (!userId) return false;
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
}
