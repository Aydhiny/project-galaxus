// Client entry points for lib/actions/autopilot.ts (readable errors, see lib/action-result.ts).
import { unwrapped } from "@/lib/action-result";
import { connectGmail, dismissConversation, runAutopilotNow, saveAutopilot, sendReply } from "@/lib/actions/autopilot";

export const connectGmailC = unwrapped(connectGmail);
export const saveAutopilotC = unwrapped(saveAutopilot);
export const runAutopilotNowC = unwrapped(runAutopilotNow);
export const sendReplyC = unwrapped(sendReply);
export const dismissConversationC = unwrapped(dismissConversation);
export type { AutopilotState } from "@/lib/actions/autopilot";
