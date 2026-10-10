// Client entry points for lib/actions/gigs.ts (readable errors, see lib/action-result.ts).
import { unwrapped } from "@/lib/action-result";
import { deleteGigProfile, saveGigProfile, saveRedditKey, scanGigsNow, setGigNotifications, updateGig } from "@/lib/actions/gigs";

export const scanGigsNowC = unwrapped(scanGigsNow);
export const updateGigC = unwrapped(updateGig);
export const saveGigProfileC = unwrapped(saveGigProfile);
export const deleteGigProfileC = unwrapped(deleteGigProfile);
export const saveRedditKeyC = unwrapped(saveRedditKey);
export const setGigNotificationsC = unwrapped(setGigNotifications);
export type { RadarState } from "@/lib/actions/gigs";
