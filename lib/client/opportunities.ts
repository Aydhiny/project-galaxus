// Client entry points for lib/actions/opportunities.ts (readable errors, see lib/action-result.ts).
import { unwrapped } from "@/lib/action-result";
import { addOpportunityTask, scanOpportunitiesNow, setOpportunityStatus } from "@/lib/actions/opportunities";

export const scanOpportunitiesNowC = unwrapped(scanOpportunitiesNow);
export const addOpportunityTaskC = unwrapped(addOpportunityTask);
export const setOpportunityStatusC = unwrapped(setOpportunityStatus);
export type { OpportunityList } from "@/lib/actions/opportunities";
