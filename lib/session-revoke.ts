// Separate from lib/auth-security.ts because it needs auth.ts (which itself
// imports auth-security) — keeping them apart avoids a circular import.
import { unstable_update, signSessionGrant } from "@/auth";
import { bumpSessionVersion } from "@/lib/auth-security";

/**
 * "Sign out everywhere else": bumps the user's session version (killing every
 * other device's session within a few minutes — see auth.ts) and immediately
 * re-issues THIS request's session cookie at the new version, so the person
 * who made the change stays signed in.
 *
 * Must be called from a server action / route handler (needs to set cookies).
 */
export async function revokeOtherSessions(userId: number) {
  const version = await bumpSessionVersion(userId);
  // Custom fields travel to the jwt callback as `session` on trigger "update".
  await unstable_update({ sv: version, svGrant: signSessionGrant(String(userId), version) } as never);
}
