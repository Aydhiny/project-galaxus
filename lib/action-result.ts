// Errors as values for server actions.
//
// Why: in production, Next.js replaces the message of any error THROWN from a
// server action with a generic "An error occurred in the Server Components
// render…" — so "API key not valid" never reached the user. Returned values
// aren't masked, so actions return { ok: false, error } instead.
//
// Next masks errors to avoid leaking internals, and we keep that guarantee:
// only plain `new Error("…")` messages (the ones our own code writes for
// people) pass through. Database / driver / runtime errors (DrizzleQueryError,
// NeonDbError, TypeError…) become a generic message and are logged server-side.

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const GENERIC = "Something went wrong. Please try again.";

function userFacing(e: unknown): string {
  if (!(e instanceof Error) || e.constructor !== Error) return GENERIC;
  if (/^Failed query|^\s*$/i.test(e.message)) return GENERIC;
  return e.message.slice(0, 300);
}

/** Server side: run an action body and turn a throw into a result. */
export async function toResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    console.error("[action]", e);
    return { ok: false, error: userFacing(e) };
  }
}

/** Client side: back to a normal throw with the real, safe message. */
export function unwrap<T>(r: ActionResult<T>): T {
  if (r.ok) return r.data;
  throw new Error(r.error);
}

/** Wrap a result-returning action so callers can keep using try/catch. */
export function unwrapped<A extends unknown[], T>(fn: (...args: A) => Promise<ActionResult<T>>) {
  return async (...args: A): Promise<T> => unwrap(await fn(...args));
}
