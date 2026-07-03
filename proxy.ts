import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  // Skip static assets, Next internals, PWA files, and NextAuth's own API routes.
  // Everything else — every dashboard page and /api/register/upload — passes
  // through authConfig.callbacks.authorized above.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|manifest.json|sw.js|offline.html|icons/).*)",
  ],
};
