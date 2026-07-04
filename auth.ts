import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { headers } from "next/headers";
import { checkRateLimit } from "@/lib/ratelimit";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { authConfig } from "@/auth.config";
import { verifyTwoFactorCode } from "@/lib/actions/two-factor";

// Distinguishable error codes surfaced to the client via signIn()'s `code`
// field (redirect: false) — see app/login/page.tsx for the two-step UI this drives.
class TwoFactorRequiredError extends CredentialsSignin {
  code = "2fa_required";
}
class TwoFactorInvalidError extends CredentialsSignin {
  code = "2fa_invalid";
}
class OAuthOnlyError extends CredentialsSignin {
  code = "oauth_only";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email" },
        password: { label: "Password", type: "password" },
        totpCode: { label: "2FA Code", type: "text" },
      },
      async authorize(credentials) {
        const hdrs = await headers();
        const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
        const { allowed, retryAfterSeconds } = checkRateLimit(ip);

        if (!allowed) {
          throw new Error(`Too many attempts. Try again in ${retryAfterSeconds}s.`);
        }

        const email = (credentials.email as string) ?? "";
        const password = (credentials.password as string) ?? "";
        const totpCode = (credentials.totpCode as string | undefined)?.trim();

        const rows = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
        const user = rows[0];
        if (!user) return null;
        if (!user.passwordHash) throw new OAuthOnlyError();
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        if (user.twoFactorEnabled) {
          if (!totpCode) throw new TwoFactorRequiredError();
          const codeValid = await verifyTwoFactorCode(user.id, totpCode);
          if (!codeValid) throw new TwoFactorInvalidError();
        }

        return { id: String(user.id), name: user.name, email: user.email };
      },
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      if (account?.provider === "credentials") return true;
      if (!user.email) return false;

      // OAuth: find-or-create a row in our own `users` table by email, then
      // overwrite user.id with OUR id so the existing jwt/session callbacks
      // (unchanged, shared with Credentials) pick it up identically.
      const email = user.email.toLowerCase();
      const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
      let dbUser = existing[0];

      if (!dbUser) {
        const [created] = await db
          .insert(users)
          .values({
            name: user.name ?? email.split("@")[0],
            email,
            passwordHash: null,
            emailVerified: new Date(), // the OAuth provider already verified ownership of this email
          })
          .returning();
        dbUser = created;
      } else if (!dbUser.emailVerified) {
        await db.update(users).set({ emailVerified: new Date() }).where(eq(users.id, dbUser.id));
      }

      user.id = String(dbUser.id);
      return true;
    },
  },
});
