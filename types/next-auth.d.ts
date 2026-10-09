import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    /** users.session_version this token was issued at (revocation check). */
    sv?: number;
    /** Epoch ms of the last revocation check against the DB. */
    svCheckedAt?: number;
  }
}
