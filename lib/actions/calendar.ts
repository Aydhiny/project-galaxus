"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";
import { addCalendarFor, calendarStatusFor, removeCalendarFor, upcomingMeetingsFor } from "@/lib/services/calendar";

/** Polled by the top bar every few minutes. */
export async function getUpcomingMeetings(fresh = false) {
  try {
    return await upcomingMeetingsFor(await requireUserId(), { fresh });
  } catch {
    return { connected: false, meetings: [], errors: [] };
  }
}

export async function getCalendarStatus() {
  return calendarStatusFor(await requireUserId());
}

export async function addCalendar(input: { url: string; label?: string }) {
  await addCalendarFor(await requireUserId(), input);
  revalidatePath("/connections");
}

export async function removeCalendar(index: number) {
  await removeCalendarFor(await requireUserId(), index);
  revalidatePath("/connections");
}
