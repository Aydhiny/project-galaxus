"use server";

import { requireUserId } from "@/lib/auth-session";
import { toResult } from "@/lib/action-result";
import { prayerSettingsFor, savePrayerSettingsFor, vaktijaFor, vaktijaLocations } from "@/lib/services/prayer";

/** Settings + today's times for your city (used by the HUD, the azan player and the empire's mosque). */
export async function getPrayerState() {
  return toResult(async () => {
    const s = await prayerSettingsFor(await requireUserId());
    return { ...s, vaktija: await vaktijaFor(s.location) };
  });
}

export async function getVaktijaLocations() {
  return toResult(async () => { await requireUserId(); return vaktijaLocations(); });
}

export async function savePrayerSettings(input: { location?: number; azanEnabled?: boolean; azanFajr?: boolean }) {
  return toResult(async () => savePrayerSettingsFor(await requireUserId(), input));
}
