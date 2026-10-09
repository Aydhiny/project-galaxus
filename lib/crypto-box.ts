// Symmetric encryption for secrets we must store (provider API keys, VAPID
// private key). AES-256-GCM: authenticated, so a tampered value fails to
// decrypt instead of silently decrypting to garbage.
//
// The key is derived from AUTH_SECRET, which already exists in every
// environment — no new env var to manage. ⚠ Rotating AUTH_SECRET makes stored
// values undecryptable; you'd have to paste the API keys in again.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set.");
  // Domain-separated so this key is never the same bytes NextAuth uses.
  return createHash("sha256").update(`galaxus-crypto-box:v1:${secret}`).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(":");
}

export function decrypt(box: string): string {
  const [v, iv, tag, ct] = box.split(":");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unrecognised secret format.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

/** decrypt(), but null instead of throwing (missing or undecryptable value). */
export function tryDecrypt(box: string | null | undefined): string | null {
  if (!box) return null;
  try {
    return decrypt(box);
  } catch {
    return null;
  }
}
