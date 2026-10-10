// Client-side entry points for lib/actions/youtube.ts: same functions, but
// errors come back as readable messages (see lib/action-result.ts).
import { unwrapped } from "@/lib/action-result";
import {
  saveYoutubeKeys, connectChannel, syncChannel, removeChannel, runChannelReport, updateVideo, improveVideo, createIdea, updateIdea, deleteIdea, writeScript,
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
export { saveYoutubeKeys_ as saveYoutubeKeys, connectChannel_ as connectChannel, syncChannel_ as syncChannel, removeChannel_ as removeChannel, runChannelReport_ as runChannelReport, updateVideo_ as updateVideo, improveVideo_ as improveVideo, createIdea_ as createIdea, updateIdea_ as updateIdea, deleteIdea_ as deleteIdea, writeScript_ as writeScript };
export type { StudioState } from "@/lib/actions/youtube";
