"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";
import {
  createCommandFor, getCommandFor, listCommandsFor, retryCommandFor, saveGithubKeyFor, voiceSetupFor,
} from "@/lib/services/voice";

export async function submitVoiceCommand(input: { transcript: string; localDate: string; localTime: string; timezone: string }) {
  const { row, dispatched } = await createCommandFor(await requireUserId(), input);
  return { id: row.id, dispatched };
}

/** Polled by the voice panel while a command is in flight. */
export async function getVoiceCommand(id: number) {
  return getCommandFor(await requireUserId(), id);
}

export async function listVoiceCommands() {
  return listCommandsFor(await requireUserId());
}

export async function retryVoiceCommand(id: number) {
  const { row, dispatched } = await retryCommandFor(await requireUserId(), id);
  return { id: row.id, dispatched };
}

export async function getVoiceSetup() {
  return voiceSetupFor(await requireUserId());
}

export async function saveVoiceGithubKey(key: string) {
  await saveGithubKeyFor(await requireUserId(), key);
  revalidatePath("/voice");
}
