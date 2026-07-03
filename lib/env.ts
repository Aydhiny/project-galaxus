const REQUIRED = ["DATABASE_URL", "AUTH_SECRET"] as const;

/**
 * Fail fast and loud on a misconfigured deploy instead of surfacing as a
 * confusing runtime error the first time a page tries to hit the DB or
 * decode a session. Called once from instrumentation.ts at server start.
 */
export function validateEnv() {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        `Copy .env.local.example to .env.local and fill them in.`
    );
  }

  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.length < 32) {
    throw new Error("AUTH_SECRET must be at least 32 characters long.");
  }
}
