import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { headers } from "next/headers";
import { checkRateLimit } from "@/lib/ratelimit";
import { getUserByEmail, verifyPassword } from "@/lib/actions/users";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const hdrs = await headers();
        const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
        const { allowed, retryAfterSeconds } = checkRateLimit(ip);

        if (!allowed) {
          throw new Error(`Too many attempts. Try again in ${retryAfterSeconds}s.`);
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        // Env-var admin fallback (for existing single-user setup)
        if (
          email === process.env.ADMIN_USERNAME &&
          password === process.env.ADMIN_PASSWORD
        ) {
          return { id: "0", name: "Ajdin", email: process.env.ADMIN_USERNAME! };
        }

        // DB user lookup
        const user = await getUserByEmail(email);
        if (!user) return null;

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) return null;

        return { id: String(user.id), name: user.name, email: user.email };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET,
});
