import type { NextAuthConfig } from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { reportOnlyCsp } from "@/lib/csp";

// Routes a logged-in user should be bounced away from (back to /dashboard)
const AUTHED_REDIRECT_PATHS = new Set(["/login", "/register"]); // "/" (the landing page) stays visible when signed in

// Routes a guest is allowed to see without a session
const GUEST_ALLOWED_PATHS = new Set(["/", "/login", "/register", "/privacy", "/terms", "/forgot-password", "/install"]);

// Guests must be able to POST here to create an account in the first place —
// /api/auth/* is excluded from the proxy matcher entirely, but /api/register
// isn't, so it needs an explicit allowance here. Reset/verify links are visited
// by definition while logged out (or from a different device/session).
const GUEST_ALLOWED_PREFIXES = ["/api/register", "/reset-password/", "/verify-email/", "/p/"]; // /p/<slug> = public demo sites for leads

/**
 * Let the request through, adding a nonce-based Content-Security-Policy-Report-Only
 * (a dry run of a strict CSP — nothing is blocked, see lib/csp.ts). The policy also
 * goes on the REQUEST headers because that is where Next.js reads the nonce from to
 * stamp its own <script> tags. API routes don't render HTML, so they're left alone.
 *
 * ⚠ This must stay a returned Response from `authorized`. Passing a handler to
 * NextAuth's auth(...) instead would skip its "not authorized → sign-in" redirect.
 */
export function allowWithReportOnlyCsp(request: NextRequest): NextResponse | true {
  if (request.nextUrl.pathname.startsWith("/api/")) return true;
  const nonce = btoa(crypto.randomUUID());
  const policy = reportOnlyCsp(nonce);
  const headers = new Headers(request.headers);
  headers.set("content-security-policy-report-only", policy);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy-Report-Only", policy);
  return res;
}

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
        return NextResponse.redirect(new URL("/empire", request.nextUrl)); // your empire is home
      }
      const isGuestAllowed =
        GUEST_ALLOWED_PATHS.has(pathname) || GUEST_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));

      if (!isLoggedIn && !isGuestAllowed) {
        return false; // NextAuth redirects to pages.signIn with ?callbackUrl=
      }
      return allowWithReportOnlyCsp(request);
    },
  },
} satisfies NextAuthConfig;
