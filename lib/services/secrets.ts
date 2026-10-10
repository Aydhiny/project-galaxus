// Per-user provider keys, encrypted at rest. One place for every feature, so
// an Anthropic key pasted in Outreach also powers the YouTube studio.

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { outreachSettings, userSecrets } from "@/lib/db/schema";
import { encrypt, tryDecrypt } from "@/lib/crypto-box";

export type SecretName = "anthropic" | "google" | "youtube" | "github" | "calendar";

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

/** "" or null removes the key. */
export async function setSecret(userId: number, name: SecretName, value: string | null) {
  const v = value?.trim();
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
