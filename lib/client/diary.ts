// Client entry points for lib/actions/diary.ts (readable errors, see lib/action-result.ts).
import { unwrapped } from "@/lib/action-result";
import { deleteDiaryEntry, finishDiaryImport, importDiaryChunk, lockDiaryNow, saveDiaryEntry, setDiaryPin, unlockDiary } from "@/lib/actions/diary";

export const saveDiaryEntryC = unwrapped(saveDiaryEntry);
export const deleteDiaryEntryC = unwrapped(deleteDiaryEntry);
export const importDiaryChunkC = unwrapped(importDiaryChunk);
export const setDiaryPinC = unwrapped(setDiaryPin);
export const unlockDiaryC = unwrapped(unlockDiary);
export const lockDiaryNowC = unwrapped(lockDiaryNow);
export { finishDiaryImport };
export type { DiaryEntry } from "@/lib/services/diary";
