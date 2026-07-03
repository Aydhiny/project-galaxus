import * as Sentry from "@sentry/nextjs";

export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/env");
    validateEnv();

    Sentry.init({ dsn, tracesSampleRate: 0.1, enabled: !!dsn });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({ dsn, tracesSampleRate: 0.1, enabled: !!dsn });
  }
}

export const onRequestError = Sentry.captureRequestError;
