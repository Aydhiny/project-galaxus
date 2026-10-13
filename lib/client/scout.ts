// Client entry points for lib/actions/scout.ts (readable errors, see lib/action-result.ts).
import { unwrapped } from "@/lib/action-result";
import { saveScoutSettings, scanScoutNow, setScoutMark } from "@/lib/actions/scout";

export const scanScoutNowC = unwrapped(scanScoutNow);
export const setScoutMarkC = unwrapped(setScoutMark);
export const saveScoutSettingsC = unwrapped(saveScoutSettings);
export type { ScoutOverview } from "@/lib/actions/scout";
