// Per-user provider keys, encrypted at rest. One place for every feature, so
// an Anthropic key pasted in Outreach also powers the YouTube studio.

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { outreachSettings, userSecrets } from "@/lib/db/schema";
import { encrypt, tryDecrypt } from "@/lib/crypto-box";

export type SecretName = "anthropic" | "google" | "youtube" | "github" | "github_read" | "calendar";

export async function getSecret(userId: number, name: SecretName): Promise<string | null> {
  const [row] = await db
    .select({ value: userSecrets.value })
    .from(userSecrets)
    .where(and(eq(userSecrets.userId, userId), eq(userSecrets.name, name)))
    .limit(1);
  if (row) return tryDecrypt(row.value);

  // Keys saved before user_secrets existed lived on outreach_settings.
  if (name === "anthropic" || name === "google") {
    const [legacy] = await db
      .select({ anthropic: outreachSettings.anthropicKeyEnc, google: outreachSettings.googleKeyEnc })
      .from(outreachSettings)
      .where(eq(outreachSettings.userId, userId))
      .limit(1);
    return tryDecrypt(legacy?.[name]);
  }
  return null;
}

/** Reject obviously wrong pastes before they're saved (and fail later). */
export function checkSecretFormat(name: SecretName, v: string) {
  if ((name === "google" || name === "youtube") && !/^AIza[0-9A-Za-z_-]{35}$/.test(v)) {
    throw new Error("That isn't a Google API key — those start with \"AIza\" and are 39 characters. In Google Cloud → Credentials, copy the API key (not the project ID or a client ID).");
  }
  if (name === "anthropic" && !/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(v)) {
    throw new Error("That isn't an Anthropic API key — those start with \"sk-ant-\".");
  }
}

/** "" or null removes the key. */
export async function setSecret(userId: number, name: SecretName, value: string | null) {
  const v = value?.trim();
  if (v) checkSecretFormat(name, v);
  if (!v) {
    await db.delete(userSecrets).where(and(eq(userSecrets.userId, userId), eq(userSecrets.name, name)));
    if (name === "anthropic") await db.update(outreachSettings).set({ anthropicKeyEnc: null }).where(eq(outreachSettings.userId, userId));
    if (name === "google") await db.update(outreachSettings).set({ googleKeyEnc: null }).where(eq(outreachSettings.userId, userId));
    return;
  }
  await db
    .insert(userSecrets)
    .values({ userId, name, value: encrypt(v) })
    .onConflictDoUpdate({ target: [userSecrets.userId, userSecrets.name], set: { value: encrypt(v), updatedAt: new Date() } });
}

/** The YouTube Data API accepts any Google Cloud key with the API enabled. */
export async function getYoutubeKey(userId: number) {
  return (await getSecret(userId, "youtube")) ?? (await getSecret(userId, "google"));
}
