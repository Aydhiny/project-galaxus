// Client entry points for lib/actions/ops.ts (readable errors, see lib/action-result.ts).
import { unwrapped } from "@/lib/action-result";
import {
  acceptMission, applyTemplate, cancelMission, createAgent, createMission, createSkill, deleteSkill, dispatchNow, removeAgent, reopenMission,
  repeatLastDay, sendMessage, setDay, updateAgent,
  debriefNow, inviteLink, missionToLead, missionToPage, missionToReddit, missionToTasks, redditSubs, removeLink, removeRecurring, respondLink,
  setLinkShare, standupNow,
  answerQuestion, createProject, markInboxRead, respondRequest, resumeCloud, saveOpsSettings, setProjectStatus,
  addMemory, extendProject, forgetMemory, moveFreeKey, pinMemory, reachDoctorNow, refreshAboutMemory, removeFreeKey, saveFreeKey, testFreeKey,
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
export const answerQuestionC = unwrapped(answerQuestion);
export const markInboxReadC = unwrapped(markInboxRead);
export const saveOpsSettingsC = unwrapped(saveOpsSettings);
export const resumeCloudC = unwrapped(resumeCloud);
export const createProjectC = unwrapped(createProject);
export const setProjectStatusC = unwrapped(setProjectStatus);
export const respondRequestC = unwrapped(respondRequest);
export const saveFreeKeyC = unwrapped(saveFreeKey);
export const extendProjectC = unwrapped(extendProject);
export const removeFreeKeyC = unwrapped(removeFreeKey);
export const moveFreeKeyC = unwrapped(moveFreeKey);
export const testFreeKeyC = unwrapped(testFreeKey);
export const addMemoryC = unwrapped(addMemory);
export const pinMemoryC = unwrapped(pinMemory);
export const forgetMemoryC = unwrapped(forgetMemory);
export const refreshAboutMemoryC = unwrapped(refreshAboutMemory);
export const reachDoctorNowC = unwrapped(reachDoctorNow);
export { getFreeStatus, getMemories } from "@/lib/actions/ops";
export type { OpsOverview } from "@/lib/actions/ops";

// Outreach bridge
import { sendToOutreach } from "@/lib/actions/ops";
export const sendToOutreachC = unwrapped(sendToOutreach);
// ─── See & steer: replay of the day, the Chief's standing orders ─────────────
import { addDirection, getDirections, getReplayDay, removeDirection } from "@/lib/actions/ops";
export const getReplayDayC = unwrapped(getReplayDay);
export const getDirectionsC = unwrapped(getDirections);
export const addDirectionC = unwrapped(addDirection);
export const removeDirectionC = unwrapped(removeDirection);
// ─── Replies & friends ────────────────────────────────────────────────────────
import { setLinkLeads } from "@/lib/actions/ops";
export const setLinkLeadsC = unwrapped(setLinkLeads);
