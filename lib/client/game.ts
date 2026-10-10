// Client-side entry points for lib/actions/game.ts (readable errors, see lib/action-result.ts).
import { unwrapped } from "@/lib/action-result";
import { addFeedback, deleteFeedback, draftDevlog, groupFeedback, saveGameRepo, themeToTask } from "@/lib/actions/game";

export const saveGameRepoC = unwrapped(saveGameRepo);
export const draftDevlogC = unwrapped(draftDevlog);
export const addFeedbackC = unwrapped(addFeedback);
export const deleteFeedbackC = unwrapped(deleteFeedback);
export const groupFeedbackC = unwrapped(groupFeedback);
export const themeToTaskC = unwrapped(themeToTask);
export type { GameState } from "@/lib/actions/game";
