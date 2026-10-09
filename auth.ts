import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { headers } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { checkRateLimit, resetRateLimit } from "@/lib/ratelimit";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { authConfig } from "@/auth.config";
import { verifyTwoFactorCode, getSessionVersion } from "@/lib/auth-security";

// Distinguishable error codes surfaced to the client via signIn()'s `code`
// field (redirect: false) — see app/login/login-client.tsx for the UI.
class TwoFactorRequiredError extends CredentialsSignin {
  code = "2fa_required";
}
class TwoFactorInvalidError extends CredentialsSignin {
  code = "2fa_invalid";
}
class OAuthOnlyError extends CredentialsSignin {
  code = "oauth_only";
}
// Previously this was a plain `throw new Error(...)`, which NextAuth swallows
// into a generic error — the user just saw "Invalid email or password" while
// actually being rate-limited.
class RateLimitedError extends CredentialsSignin {
  code = "rate_limited";
}

// Compared against when the email doesn't exist, so "no such user" takes the
// same ~bcrypt time as "wrong password" and response timing can't be used to
// discover which emails have accounts.
const DUMMY_HASH = "$2b$12$cmF71I3xpuD.hQT0X.QJwOgSuA7uFdbJrDd3pjukb.c/F5GfUtbfG";

/** How often (ms) a live session re-checks that it hasn't been revoked. */
const REVOCATION_CHECK_MS = 5 * 60 * 1000;

/**
 * Signed proof that the server itself is re-issuing a session at a new
 * version (after "sign out everywhere else", password change, 2FA change).
 * The client-side useSession().update() can send arbitrary data, so a stale
 * session must not be able to just claim a newer version — it would need
 * this HMAC, which requires AUTH_SECRET.
 */
export function signSessionGrant(userId: string, version: number): string {
  return createHmac("sha256", process.env.AUTH_SECRET ?? "")
    .update(`session-grant:${userId}:${version}`)
    .digest("hex");
}

function isValidGrant(userId: string, version: unknown, grant: unknown): version is number {
  if (typeof version !== "number" || typeof grant !== "string") return false;
  const expected = Buffer.from(signSessionGrant(userId, version));
  const given = Buffer.from(grant);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

async function clientIp(): Promise<string> {
  const hdrs = await headers();
  return hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days of inactivity → signed out
    updateAge: 24 * 60 * 60, // rolling: the cookie is re-issued (rotated) at most daily while in use
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email" },
        password: { label: "Password", type: "password" },
        totpCode: { label: "2FA Code", type: "text" },
      },
      async authorize(credentials) {
        const email = String(credentials.email ?? "").trim().toLowerCase();
        const password = String(credentials.password ?? "");
        const totpCode = (credentials.totpCode as string | undefined)?.trim();

        // Bucket per IP *and* email: one attacker can't lock everyone out
        // from a shared IP, and one account can't be hammered from many tabs.
        const ip = await clientIp();
        const limitKey = `login:${ip}:${email}`;
        if (!checkRateLimit(limitKey).allowed) throw new RateLimitedError();

        if (!email || !password) return null;

        const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
        const user = rows[0];
        if (!user) {
          await bcrypt.compare(password, DUMMY_HASH);
          return null;
        }
        if (!user.passwordHash) throw new OAuthOnlyError();
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        if (user.twoFactorEnabled) {
          if (!totpCode) throw new TwoFactorRequiredError();
          const codeValid = await verifyTwoFactorCode(user.id, totpCode);
          if (!codeValid) throw new TwoFactorInvalidError();
        }

        // Successful sign-in shouldn't eat into the next session's attempt budget.
        resetRateLimit(limitKey);
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
      // overwrite user.id with OUR id so the jwt/session callbacks (shared
      // with Credentials) pick it up identically.
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

    /**
     * Node-runtime jwt callback = edge callback (auth.config.ts) + revocation.
     * The edge proxy only decodes the cookie (no DB there); every server
     * component / action that calls auth() runs this version, which rejects
     * sessions whose version is behind users.session_version.
     */
    async jwt(params) {
      const token = await authConfig.callbacks.jwt(params);
      const { user, trigger, session } = params;
      if (!token.id) return token;
      const userId = String(token.id);
      const now = Date.now();

      // Fresh sign-in: stamp the token with the user's current version.
      if (user) {
        token.sv = (await getSessionVersion(Number(userId))) ?? 0;
        token.svCheckedAt = now;
        return token;
      }

      // Server-initiated re-issue at a new version (see signSessionGrant).
      if (trigger === "update" && isValidGrant(userId, session?.sv, session?.svGrant)) {
        token.sv = session.sv;
        token.svCheckedAt = now;
        return token;
      }

      // Periodic revocation check. Throttled so normal page loads don't all
      // hit the DB; a revoked session dies within REVOCATION_CHECK_MS.
      if (typeof token.svCheckedAt !== "number" || now - token.svCheckedAt > REVOCATION_CHECK_MS) {
        const current = await getSessionVersion(Number(userId));
        // User deleted, or version bumped since this token was issued → revoke.
        // Returning null makes NextAuth clear the session cookie.
        if (current === null || current !== (token.sv ?? 0)) return null;
        token.svCheckedAt = now;
      }
      return token;
    },
  },
});
