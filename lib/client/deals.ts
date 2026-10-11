// Client entry points for lib/actions/deals.ts (readable errors, see lib/action-result.ts).
import { unwrapped } from "@/lib/action-result";
import { logTheirReply, setDealStage, setDealValue } from "@/lib/actions/deals";

export const setDealStageC = unwrapped(setDealStage);
export const setDealValueC = unwrapped(setDealValue);
export const logTheirReplyC = unwrapped(logTheirReply);
export type { Deal } from "@/lib/services/deals";
