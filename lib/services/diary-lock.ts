// Diary PIN lock — enforced on the server. Entries are only decrypted when a
// valid, signed, short-lived unlock cookie is present (15 minutes). The PIN
// itself is stored as a salted scrypt hash, never in plain text.

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { userSettings } from "@/lib/db/schema";

const COOKIE = "diary_unlock";
const TTL_MS = 15 * 60_000;
const attempts = new Map<number, { n: number; until: number }>();

function key() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set.");
  return createHmac("sha256", "galaxus-diary-lock:v1").update(s).digest();
}
const sign = (payload: string) => createHmac("sha256", key()).update(payload).digest("base64url");

async function pinHash(userId: number) {
  const [s] = await db.select({ h: userSettings.diaryPinHash }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  return s?.h ?? null;
}

export async function hasDiaryPin(userId: number) { return !!(await pinHash(userId)); }

export async function setDiaryPinFor(userId: number, pin: string, currentPin?: string) {
  if (!/^\d{4,8}$/.test(pin)) throw new Error("Use a 4–8 digit PIN.");
  const existing = await pinHash(userId);
  if (existing && !(await checkPin(existing, currentPin ?? ""))) throw new Error("Current PIN is wrong.");
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(pin, salt, 32).toString("base64url");
  const value = `${salt}:${hash}`;
  await db.insert(userSettings).values({ userId, diaryPinHash: value }).onConflictDoUpdate({ target: userSettings.userId, set: { diaryPinHash: value, updatedAt: new Date() } });
  await grantUnlock(userId);
}

async function checkPin(stored: string, pin: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, "base64url");
  const b = scryptSync(pin, salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Wrong PINs slow down: 5 tries, then a 5-minute pause. */
export async function unlockDiaryFor(userId: number, pin: string) {
  const a = attempts.get(userId);
  if (a && a.until > Date.now()) throw new Error("Too many tries — wait a few minutes.");
  const stored = await pinHash(userId);
  if (!stored) throw new Error("Set a PIN first.");
  if (!(await checkPin(stored, pin))) {
    const n = (a?.n ?? 0) + 1;
    attempts.set(userId, { n, until: n >= 5 ? Date.now() + 5 * 60_000 : 0 });
    throw new Error("Wrong PIN.");
  }
  attempts.delete(userId);
  await grantUnlock(userId);
}

async function grantUnlock(userId: number) {
  const exp = Date.now() + TTL_MS;
  const payload = `${userId}.${exp}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", maxAge: TTL_MS / 1000, path: "/" });
}

export async function lockDiary() {
  (await cookies()).delete(COOKIE);
}

/** True only with a valid, unexpired unlock cookie for this exact user. */
export async function diaryUnlocked(userId: number) {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return false;
  const [uid, exp, sig] = raw.split(".");
  if (Number(uid) !== userId || !(Number(exp) > Date.now()) || !sig) return false;
  const good = sign(`${uid}.${exp}`);
  return good.length === sig.length && timingSafeEqual(Buffer.from(good), Buffer.from(sig));
}

/** Throws unless the diary is unlocked (or the user hasn't set a PIN yet — then setup is required). */
export async function requireDiaryUnlocked(userId: number) {
  if (!(await hasDiaryPin(userId))) throw new Error("Set a diary PIN first.");
  if (!(await diaryUnlocked(userId))) throw new Error("Your diary is locked.");
}
