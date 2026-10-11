// Client entry points for lib/actions/reddit.ts (readable errors, see lib/action-result.ts).
import { unwrapped } from "@/lib/action-result";
import {
  addRedditCommunity, discoverCommunities, draftRedditPost, markRedditPosted, redraftRedditPost, refreshCommunities, saveRedditConnection,
  saveRedditSettings, setRedditCommunityStatus, skipRedditPost, testRedditConnection, updateRedditPost,
} from "@/lib/actions/reddit";

export const saveRedditConnectionC = unwrapped(saveRedditConnection);
export const testRedditConnectionC = unwrapped(testRedditConnection);
export const saveRedditSettingsC = unwrapped(saveRedditSettings);
export const refreshCommunitiesC = unwrapped(refreshCommunities);
export const discoverCommunitiesC = unwrapped(discoverCommunities);
export const addRedditCommunityC = unwrapped(addRedditCommunity);
export const setRedditCommunityStatusC = unwrapped(setRedditCommunityStatus);
export const draftRedditPostC = unwrapped(draftRedditPost);
export const redraftRedditPostC = unwrapped(redraftRedditPost);
export const updateRedditPostC = unwrapped(updateRedditPost);
export const markRedditPostedC = unwrapped(markRedditPosted);
export const skipRedditPostC = unwrapped(skipRedditPost);
export type { RedditConnection, RedditState } from "@/lib/actions/reddit";
