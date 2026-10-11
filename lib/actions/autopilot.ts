"use server";

import { revalidatePath } from "next/cache";
import { toResult } from "@/lib/action-result";
import { requireUserId } from "@/lib/auth-session";
import type { AutopilotMode } from "@/lib/autopilot";
import { connectGmailFor } from "@/lib/services/mail";
import {
  autopilotStateFor, dismissConversationFor, runAutopilotSendFor, saveAutopilotSettingsFor, sendManualReplyFor,
} from "@/lib/services/autopilot";

const refresh = () => { revalidatePath("/gigs"); revalidatePath("/connections"); };

export async function getAutopilot() {
  return autopilotStateFor(await requireUserId());
}
export type AutopilotState = Awaited<ReturnType<typeof getAutopilot>>;

export async function connectGmail(input: { email: string; appPassword: string; name?: string } | null) {
  return toResult(async () => { await connectGmailFor(await requireUserId(), input); refresh(); });
}

export async function saveAutopilot(patch: Partial<{ mode: AutopilotMode; dailyCap: number; minScore: number; websiteMinKm: number; portfolioUrl: string; bookingUrl: string; senderName: string; followUps: boolean }>) {
  return toResult(async () => { await saveAutopilotSettingsFor(await requireUserId(), patch); refresh(); });
}

/** Run one autopilot pass now (respects every rule and the daily cap). */
export async function runAutopilotNow() {
  return toResult(async () => { const r = await runAutopilotSendFor(await requireUserId()); refresh(); return r; });
}

export async function sendReply(gigEmailId: number, text: string) {
  return toResult(async () => { await sendManualReplyFor(await requireUserId(), gigEmailId, text); refresh(); });
}

export async function dismissConversation(gigEmailId: number) {
  return toResult(async () => { await dismissConversationFor(await requireUserId(), gigEmailId); refresh(); });
}
