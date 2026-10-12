// Client entry points for lib/actions/wellbeing.ts (readable errors, see lib/action-result.ts).
import { unwrapped } from "@/lib/action-result";
import { addMemory, deleteMemory, getGuardianState, logFocus, logUrge, saveHoldQuote, saveSleepSettings, updateMemory } from "@/lib/actions/wellbeing";

export const getGuardianStateC = unwrapped(getGuardianState);
export const addMemoryC = unwrapped(addMemory);
export const updateMemoryC = unwrapped(updateMemory);
export const deleteMemoryC = unwrapped(deleteMemory);
export const logUrgeC = unwrapped(logUrge);
export const saveSleepSettingsC = unwrapped(saveSleepSettings);
export const logFocusC = unwrapped(logFocus);
export const saveHoldQuoteC = unwrapped(saveHoldQuote);
export type { HoldState } from "@/lib/actions/wellbeing";
