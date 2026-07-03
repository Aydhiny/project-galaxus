import type { NextAuthConfig } from "next-auth";
import { NextResponse } from "next/server";

// Routes a logged-in user should be bounced away from (back to /dashboard)
const AUTHED_REDIRECT_PATHS = new Set(["/", "/login", "/register"]);

// Routes a guest is allowed to see without a session
const GUEST_ALLOWED_PATHS = new Set(["/", "/login", "/register", "/privacy", "/terms"]);

/**
 * Edge-safe base config — no Credentials provider here (it needs bcrypt +
 * a DB call + next/headers, none of which belong in the middleware bundle).
 * `auth.ts` spreads this and adds the real provider for Node runtime use.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET,
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.id = token.id as string;
      return session;
    },
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const pathname = request.nextUrl.pathname;

      if (isLoggedIn && AUTHED_REDIRECT_PATHS.has(pathname)) {
        return NextResponse.redirect(new URL("/dashboard", request.nextUrl));
      }
      if (!isLoggedIn && !GUEST_ALLOWED_PATHS.has(pathname)) {
        return false; // NextAuth redirects to pages.signIn with ?callbackUrl=
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
