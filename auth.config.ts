import type { NextAuthConfig } from "next-auth";
import { NextResponse } from "next/server";

// Routes a logged-in user should be bounced away from (back to /dashboard)
const AUTHED_REDIRECT_PATHS = new Set(["/", "/login", "/register"]);

// Routes a guest is allowed to see without a session
const GUEST_ALLOWED_PATHS = new Set(["/", "/login", "/register", "/privacy", "/terms", "/forgot-password"]);

// Guests must be able to POST here to create an account in the first place —
// /api/auth/* is excluded from the proxy matcher entirely, but /api/register
// isn't, so it needs an explicit allowance here. Reset/verify links are visited
// by definition while logged out (or from a different device/session).
const GUEST_ALLOWED_PREFIXES = ["/api/register", "/reset-password/", "/verify-email/"];

/**
 * Edge-safe base config — no Credentials provider here (it needs bcrypt +
 * a DB call + next/headers, none of which belong in the middleware bundle).
 * `auth.ts` spreads this and adds the real provider for Node runtime use.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET,
  // Trust the Host header from the platform's edge (Vercel, or any reverse
  // proxy in front of `next start`) rather than requiring a static AUTH_URL.
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.email = user.email;
      }
      // Fires when the client calls useSession().update(...) — e.g. Settings'
      // profile-save flow. Without this branch the JWT never picks up the new
      // name/email, so the UI keeps showing stale data until next sign-in.
      if (trigger === "update" && session) {
        if (session.name) token.name = session.name;
        if (session.email) token.email = session.email;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        if (token.name) session.user.name = token.name as string;
        if (token.email) session.user.email = token.email as string;
      }
      return session;
    },
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const pathname = request.nextUrl.pathname;

      if (isLoggedIn && AUTHED_REDIRECT_PATHS.has(pathname)) {
        return NextResponse.redirect(new URL("/dashboard", request.nextUrl));
      }
      const isGuestAllowed =
        GUEST_ALLOWED_PATHS.has(pathname) || GUEST_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));

      if (!isLoggedIn && !isGuestAllowed) {
        return false; // NextAuth redirects to pages.signIn with ?callbackUrl=
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
