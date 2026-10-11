// Client entry points for lib/actions/diary.ts (readable errors, see lib/action-result.ts).
import { unwrapped } from "@/lib/action-result";
import { deleteDiaryEntry, finishDiaryImport, importDiaryChunk, saveDiaryEntry } from "@/lib/actions/diary";

export const saveDiaryEntryC = unwrapped(saveDiaryEntry);
export const deleteDiaryEntryC = unwrapped(deleteDiaryEntry);
export const importDiaryChunkC = unwrapped(importDiaryChunk);
export { finishDiaryImport };
export type { DiaryEntry } from "@/lib/services/diary";
