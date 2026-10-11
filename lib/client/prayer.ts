// Client entry points for lib/actions/prayer.ts (readable errors, see lib/action-result.ts).
import { unwrapped } from "@/lib/action-result";
import { getPrayerState, getVaktijaLocations, savePrayerSettings } from "@/lib/actions/prayer";

export const getPrayerStateC = unwrapped(getPrayerState);
export const getVaktijaLocationsC = unwrapped(getVaktijaLocations);
export const savePrayerSettingsC = unwrapped(savePrayerSettings);
