import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  // Skip static assets, Next internals, PWA files, NextAuth's own API routes,
  // cron endpoints, the MCP endpoint and voice runner endpoints (bearer API
  // tokens, see app/api/mcp and app/api/voice),
  // and the Stripe webhook (all server-to-server, no session
  // cookie — they authenticate themselves via their own shared secret /
  // signature check instead). Everything else — every dashboard page and
  // /api/register/upload — passes through authConfig.callbacks.authorized above.
  matcher: [
    "/((?!api/auth|api/cron|api/stripe|api/mcp|api/voice|_next/static|_next/image|favicon.ico|manifest.json|sw.js|offline.html|icons/).*)",
  ],
};
