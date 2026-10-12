// Client entry points for lib/actions/activity.ts (readable errors, see lib/action-result.ts).
import { unwrapped } from "@/lib/action-result";
import { addBeatsFromFiles, getActivityStatus, logActivity, logPrayer, logPresence } from "@/lib/actions/activity";

export const logActivityC = unwrapped(logActivity);
export const logPresenceC = unwrapped(logPresence);
export const getActivityStatusC = unwrapped(getActivityStatus);
export const addBeatsFromFilesC = unwrapped(addBeatsFromFiles);
export const logPrayerC = unwrapped(logPrayer);
