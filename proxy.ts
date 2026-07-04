import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  // Skip static assets, Next internals, PWA files, NextAuth's own API routes,
  // and cron endpoints (server-to-server, no session cookie — they check
  // their own Authorization: Bearer <CRON_SECRET> header instead). Everything
  // else — every dashboard page and /api/register/upload — passes through
  // authConfig.callbacks.authorized above.
  matcher: [
    "/((?!api/auth|api/cron|_next/static|_next/image|favicon.ico|manifest.json|sw.js|offline.html|icons/).*)",
  ],
};
