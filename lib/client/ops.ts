// Client entry points for lib/actions/ops.ts (readable errors, see lib/action-result.ts).
import { unwrapped } from "@/lib/action-result";
import {
  acceptMission, applyTemplate, cancelMission, createAgent, createMission, createSkill, deleteSkill, dispatchNow, removeAgent, reopenMission,
  repeatLastDay, sendMessage, setDay, updateAgent,
  debriefNow, inviteLink, missionToLead, missionToPage, missionToReddit, missionToTasks, redditSubs, removeLink, removeRecurring, respondLink,
  setLinkShare, standupNow,
} from "@/lib/actions/ops";

export const createAgentC = unwrapped(createAgent);
export const updateAgentC = unwrapped(updateAgent);
export const removeAgentC = unwrapped(removeAgent);
export const createMissionC = unwrapped(createMission);
export const cancelMissionC = unwrapped(cancelMission);
export const acceptMissionC = unwrapped(acceptMission);
export const reopenMissionC = unwrapped(reopenMission);
export const sendMessageC = unwrapped(sendMessage);
export const createSkillC = unwrapped(createSkill);
export const deleteSkillC = unwrapped(deleteSkill);
export const setDayC = unwrapped(setDay);
export const applyTemplateC = unwrapped(applyTemplate);
export const repeatLastDayC = unwrapped(repeatLastDay);
export const dispatchNowC = unwrapped(dispatchNow);
export const missionToTasksC = unwrapped(missionToTasks);
export const missionToPageC = unwrapped(missionToPage);
export const missionToLeadC = unwrapped(missionToLead);
export const missionToRedditC = unwrapped(missionToReddit);
export const redditSubsC = unwrapped(redditSubs);
export const removeRecurringC = unwrapped(removeRecurring);
export const standupNowC = unwrapped(standupNow);
export const debriefNowC = unwrapped(debriefNow);
export const inviteLinkC = unwrapped(inviteLink);
export const respondLinkC = unwrapped(respondLink);
export const setLinkShareC = unwrapped(setLinkShare);
export const removeLinkC = unwrapped(removeLink);
export type { OpsOverview } from "@/lib/actions/ops";
