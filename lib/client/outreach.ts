// Client-side entry points for lib/actions/outreach.ts: same functions, but
// errors come back as readable messages (see lib/action-result.ts).
import { unwrapped } from "@/lib/action-result";
import {
  saveOutreachSettings, addLeadSearch, updateLeadSearch, deleteLeadSearch, runOutreachPipeline, releaseBatchNow, updateLead, redraftLead, runMonthlyReview, savePushSubscription, removePushSubscription, sendTestPush, importLeads,
} from "@/lib/actions/outreach";

const saveOutreachSettings_ = unwrapped(saveOutreachSettings);
const addLeadSearch_ = unwrapped(addLeadSearch);
const updateLeadSearch_ = unwrapped(updateLeadSearch);
const deleteLeadSearch_ = unwrapped(deleteLeadSearch);
const runOutreachPipeline_ = unwrapped(runOutreachPipeline);
const releaseBatchNow_ = unwrapped(releaseBatchNow);
const updateLead_ = unwrapped(updateLead);
const redraftLead_ = unwrapped(redraftLead);
const runMonthlyReview_ = unwrapped(runMonthlyReview);
const savePushSubscription_ = unwrapped(savePushSubscription);
const removePushSubscription_ = unwrapped(removePushSubscription);
const sendTestPush_ = unwrapped(sendTestPush);
const importLeads_ = unwrapped(importLeads);
export { saveOutreachSettings_ as saveOutreachSettings, addLeadSearch_ as addLeadSearch, updateLeadSearch_ as updateLeadSearch, deleteLeadSearch_ as deleteLeadSearch, runOutreachPipeline_ as runOutreachPipeline, releaseBatchNow_ as releaseBatchNow, updateLead_ as updateLead, redraftLead_ as redraftLead, runMonthlyReview_ as runMonthlyReview, savePushSubscription_ as savePushSubscription, removePushSubscription_ as removePushSubscription, sendTestPush_ as sendTestPush, importLeads_ as importLeads };
export type { OutreachState } from "@/lib/actions/outreach";
