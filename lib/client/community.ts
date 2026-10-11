// Client entry points for lib/actions/community.ts (readable errors, see lib/action-result.ts).
import { unwrapped } from "@/lib/action-result";
import { scanCommunitiesNow, setCommunityStatus } from "@/lib/actions/community";

export const scanCommunitiesNowC = unwrapped(scanCommunitiesNow);
export const setCommunityStatusC = unwrapped(setCommunityStatus);
export type { CommunityList } from "@/lib/actions/community";
