// Client entry points for lib/actions/brief.ts (readable errors, see lib/action-result.ts).
import { unwrapped } from "@/lib/action-result";
import { buildBriefNow, setBriefNotifications } from "@/lib/actions/brief";

export const buildBriefNowC = unwrapped(buildBriefNow);
export const setBriefNotificationsC = unwrapped(setBriefNotifications);
export type { BriefState } from "@/lib/actions/brief";
