// Google / GitHub sign-in → our own users row (find-or-create by email).
// Deliberately NOT a "use server" file (it takes a raw email).
//
// Pre-account-takeover guard: anyone can register ANY email address with a
// password, and that account stays "unverified" until the link in the email is
// clicked. Before this guard, when the real owner of that address later signed
// in with Google, they were dropped into the squatter's account — and the
// squatter still knew its password (and could have turned on 2FA). Now an
// OAuth sign-in to an unverified account first removes everything the squatter
// could have set: the password, 2FA and backup codes, and every live session.
// The real owner can set a password again with "Forgot password".

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { backupCodes, users } from "@/lib/db/schema";
import { bumpSessionVersion } from "@/lib/auth-security";

export async function findOrCreateOAuthUser(rawEmail: string, name: string | null | undefined): Promise<number> {
  const email = rawEmail.trim().toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!existing) {
    const [created] = await db
      .insert(users)
      .values({
        name: (name ?? email.split("@")[0]).slice(0, 255),
        email,
        passwordHash: null,
        emailVerified: new Date(), // the OAuth provider already verified ownership of this email
      })
      .returning({ id: users.id });
    return created.id;
  }

  if (!existing.emailVerified) {
    const squatted = !!existing.passwordHash || existing.twoFactorEnabled || !!existing.twoFactorSecret;
    await db
      .update(users)
      .set({
        emailVerified: new Date(),
        ...(squatted ? { passwordHash: null, twoFactorEnabled: false, twoFactorSecret: null, totpLastStep: null } : {}),
      })
      .where(eq(users.id, existing.id));
    if (squatted) {
      await db.delete(backupCodes).where(eq(backupCodes.userId, existing.id));
      await bumpSessionVersion(existing.id); // signs out every session the unverified account had
    }
  }
  return existing.id;
}
