// Prayer settings, vaktija.ba times (cached on the server) and your azan file.

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userFiles, userSettings } from "@/lib/db/schema";
import { parseVaktija, type Vaktija } from "@/lib/vaktija";

export async function prayerSettingsFor(userId: number) {
  const [s] = await db.select({ loc: userSettings.vaktijaLocation, on: userSettings.azanEnabled, fajr: userSettings.azanFajr })
    .from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  const [file] = await db.select({ name: userFiles.name, bytes: userFiles.bytes }).from(userFiles)
    .where(and(eq(userFiles.userId, userId), eq(userFiles.kind, "azan"))).limit(1);
  return { location: s?.loc ?? 77, azanEnabled: s?.on ?? false, azanFajr: s?.fajr ?? false, azanFile: file ? { name: file.name, bytes: file.bytes } : null };
}

export async function savePrayerSettingsFor(userId: number, input: { location?: number; azanEnabled?: boolean; azanFajr?: boolean }) {
  const set: Partial<typeof userSettings.$inferInsert> = { updatedAt: new Date() };
  if (input.location !== undefined) {
    const loc = Math.round(Number(input.location));
    if (!(loc >= 0 && loc < 200)) throw new Error("Pick a city from the list.");
    set.vaktijaLocation = loc;
  }
  if (input.azanEnabled !== undefined) set.azanEnabled = !!input.azanEnabled;
  if (input.azanFajr !== undefined) set.azanFajr = !!input.azanFajr;
  await db.insert(userSettings).values({ userId, ...set }).onConflictDoUpdate({ target: userSettings.userId, set });
}

/** Today's times for a vaktija.ba location — cached by Next for 3 hours (one call per city, not per user). */
export async function vaktijaFor(location: number): Promise<Vaktija | null> {
  try {
    const res = await fetch(`https://api.vaktija.ba/vaktija/v1/${location}`, { next: { revalidate: 3 * 3600 } });
    return res.ok ? parseVaktija(await res.json()) : null;
  } catch {
    return null;
  }
}

/** All vaktija.ba cities (index = location id). */
export async function vaktijaLocations(): Promise<string[]> {
  try {
    const res = await fetch("https://api.vaktija.ba/vaktija/v1/lokacije", { next: { revalidate: 7 * 86400 } });
    const j = await res.json();
    return Array.isArray(j) ? j.map(String) : [];
  } catch {
    return [];
  }
}

const AUDIO = /^audio\/(mpeg|mp3|mp4|aac|ogg|wav|x-wav|webm|x-m4a)$/;
const MAX_AZAN = 4_000_000;

export async function saveAzanFor(userId: number, file: { name: string; type: string; bytes: Buffer }) {
  if (!AUDIO.test(file.type)) throw new Error("Use an audio file (MP3, M4A, OGG or WAV).");
  if (file.bytes.length > MAX_AZAN) throw new Error("Azan file is too large (max 4 MB — an MP3 at 128 kbps is plenty).");
  const values = { userId, kind: "azan", name: file.name.slice(0, 200), mime: file.type, data: file.bytes.toString("base64"), bytes: file.bytes.length };
  await db.insert(userFiles).values(values).onConflictDoUpdate({ target: [userFiles.userId, userFiles.kind], set: { ...values, createdAt: new Date() } });
}

export async function azanFor(userId: number) {
  const [f] = await db.select({ mime: userFiles.mime, data: userFiles.data }).from(userFiles)
    .where(and(eq(userFiles.userId, userId), eq(userFiles.kind, "azan"))).limit(1);
  return f ?? null;
}

export async function deleteAzanFor(userId: number) {
  await db.delete(userFiles).where(and(eq(userFiles.userId, userId), eq(userFiles.kind, "azan")));
}
