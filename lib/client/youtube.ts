// Client-side entry points for lib/actions/youtube.ts: same functions, but
// errors come back as readable messages (see lib/action-result.ts).
import { unwrapped } from "@/lib/action-result";
import {
  saveYoutubeKeys, connectChannel, syncChannel, removeChannel, runChannelReport, updateVideo, improveVideo, createIdea, updateIdea, deleteIdea, writeScript,
  updateComment, draftReplies, runHookLab,
} from "@/lib/actions/youtube";
import {
  pitchLongform, writeLongScript, createEdit, planEdit, loadEdit, toggleCut, deleteEdit, saveGroqKey,
} from "@/lib/actions/youtube";

const saveYoutubeKeys_ = unwrapped(saveYoutubeKeys);
const connectChannel_ = unwrapped(connectChannel);
const syncChannel_ = unwrapped(syncChannel);
const removeChannel_ = unwrapped(removeChannel);
const runChannelReport_ = unwrapped(runChannelReport);
const updateVideo_ = unwrapped(updateVideo);
const improveVideo_ = unwrapped(improveVideo);
const createIdea_ = unwrapped(createIdea);
const updateIdea_ = unwrapped(updateIdea);
const deleteIdea_ = unwrapped(deleteIdea);
const writeScript_ = unwrapped(writeScript);
const updateComment_ = unwrapped(updateComment);
const draftReplies_ = unwrapped(draftReplies);
const runHookLab_ = unwrapped(runHookLab);
export { updateComment_ as updateComment, draftReplies_ as draftReplies, runHookLab_ as runHookLab, saveYoutubeKeys_ as saveYoutubeKeys, connectChannel_ as connectChannel, syncChannel_ as syncChannel, removeChannel_ as removeChannel, runChannelReport_ as runChannelReport, updateVideo_ as updateVideo, improveVideo_ as improveVideo, createIdea_ as createIdea, updateIdea_ as updateIdea, deleteIdea_ as deleteIdea, writeScript_ as writeScript };
export type { StudioState } from "@/lib/actions/youtube";

const pitchLongform_ = unwrapped(pitchLongform);
const writeLongScript_ = unwrapped(writeLongScript);
const createEdit_ = unwrapped(createEdit);
const planEdit_ = unwrapped(planEdit);
const loadEdit_ = unwrapped(loadEdit);
const toggleCut_ = unwrapped(toggleCut);
const deleteEdit_ = unwrapped(deleteEdit);
const saveGroqKey_ = unwrapped(saveGroqKey);
export { pitchLongform_ as pitchLongform, writeLongScript_ as writeLongScript, createEdit_ as createEdit, planEdit_ as planEdit, loadEdit_ as loadEdit, toggleCut_ as toggleCut, deleteEdit_ as deleteEdit, saveGroqKey_ as saveGroqKey };
