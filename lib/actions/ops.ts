"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";
import { toResult } from "@/lib/action-result";
import {
  acceptMissionFor, applyTemplateFor, cancelMissionFor, createAgentFor, createMissionFor, createSkillFor, deleteSkillFor, dispatchCloudFor,
  opsOverviewFor, removeAgentFor, reopenMissionFor, repeatLastDayFor, sendMessageFor, setDayFor, updateAgentFor,
} from "@/lib/services/ops";

export async function getOps() {
  return opsOverviewFor(await requireUserId());
}
export type { OpsOverview } from "@/lib/services/ops";

const done = () => revalidatePath("/ops");

/** Returns the new agent and its token (null for cloud agents). The token is shown once, then only its hash exists. */
export async function createAgent(input: { name: string; role: string; provider: string; cloud?: boolean; skills?: string[] }) {
  return toResult(async () => {
    const r = await createAgentFor(await requireUserId(), input);
    done();
    return { agentId: r.agent.id, token: r.token };
  });
}

export async function updateAgent(id: number, input: { skills?: string[]; role?: string }) {
  return toResult(async () => { await updateAgentFor(await requireUserId(), id, input); done(); });
}

export async function removeAgent(id: number) {
  return toResult(async () => { await removeAgentFor(await requireUserId(), id); done(); });
}

export async function createMission(raw: Record<string, unknown>) {
  return toResult(async () => {
    const m = await createMissionFor(await requireUserId(), raw);
    done();
    return { id: m.id };
  });
}

export async function cancelMission(id: number) {
  return toResult(async () => { await cancelMissionFor(await requireUserId(), id); done(); });
}
export async function acceptMission(id: number) {
  return toResult(async () => { await acceptMissionFor(await requireUserId(), id); done(); });
}
export async function reopenMission(id: number, note?: string) {
  return toResult(async () => { await reopenMissionFor(await requireUserId(), id, note); done(); });
}

export async function sendMessage(input: { toAgentId?: number | null; toTeam?: string | null; body: string }) {
  return toResult(async () => { await sendMessageFor(await requireUserId(), input); done(); });
}

export async function createSkill(raw: { name: string; blurb?: string; instructions: string }) {
  return toResult(async () => { const s = await createSkillFor(await requireUserId(), raw); done(); return { key: `c:${s.id}` }; });
}
export async function deleteSkill(id: number) {
  return toResult(async () => { await deleteSkillFor(await requireUserId(), id); done(); });
}

export async function setDay(raw: { startsAt: string; endsAt: string; focus?: string } | null) {
  return toResult(async () => { await setDayFor(await requireUserId(), raw); done(); });
}
export async function applyTemplate(key: string) {
  return toResult(async () => { const n = await applyTemplateFor(await requireUserId(), key); done(); return { missions: n }; });
}
export async function repeatLastDay() {
  return toResult(async () => { const n = await repeatLastDayFor(await requireUserId()); done(); return { missions: n }; });
}

/** "Start now": give idle cloud agents their next mission without waiting for the next beat. */
export async function dispatchNow() {
  return toResult(async () => { const r = await dispatchCloudFor(await requireUserId()); done(); return r; });
}
