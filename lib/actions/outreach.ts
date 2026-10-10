"use server";

import { toResult } from "@/lib/action-result";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireUserId } from "@/lib/auth-session";
import { localNow, uptimeReport, uptimeSummary, whatsappLink } from "@/lib/outreach";
import {
  addSearchFor, deleteSearchFor, importLeadsFor, getPublicConfigFor, getTodayFor, listLeadsFor, listSearchesFor,
  pipelineCountsFor, redraftLeadFor, releaseBatchFor, runMonthlyReviewFor, runPipelineFor,
  saveSettingsFor, statsFor, updateLeadFor, updateSearchFor, getConfigFor,
  type LeadPatch, type SettingsPatch,
} from "@/lib/services/outreach/engine";
import { batchSizes } from "@/lib/outreach";
import { countSubscriptionsFor, getVapidKeys, notifyUser, removeSubscriptionFor, saveSubscriptionFor } from "@/lib/services/outreach/push";

const refresh = () => revalidatePath("/outreach");

/** Everything the Outreach page needs, in one round trip. */
export async function getOutreachState() {
  const userId = await requireUserId();
  const [config, searches, leads, today, counts, devices, vapid] = await Promise.all([
    getPublicConfigFor(userId),
    listSearchesFor(userId),
    listLeadsFor(userId),
    getTodayFor(userId),
    pipelineCountsFor(userId),
    countSubscriptionsFor(userId),
    getVapidKeys(),
  ]);
  const { stats } = await statsFor(userId, today.local.day.slice(0, 7));
  return { config, searches, leads, today, counts, stats, pushDevices: devices, vapidPublicKey: vapid.publicKey };
}
export type OutreachState = Awaited<ReturnType<typeof getOutreachState>>;

export async function saveOutreachSettings(patch: SettingsPatch) {
  return toResult(async () => {
    await saveSettingsFor(await requireUserId(), patch);
    refresh();
  });
}

export async function addLeadSearch(input: { query: string; city: string; category?: string; source?: "google" | "osm" }) {
  return toResult(async () => {
    const row = await addSearchFor(await requireUserId(), input);
    refresh();
    return row;
  });
}

export async function updateLeadSearch(id: number, patch: { active?: boolean; restart?: boolean }) {
  return toResult(async () => {
    await updateSearchFor(await requireUserId(), id, patch);
    refresh();
  });
}

export async function deleteLeadSearch(id: number) {
  return toResult(async () => {
    await deleteSearchFor(await requireUserId(), id);
    refresh();
  });
}

/** "Find leads now" — the same work a scheduler tick does, on demand. */
export async function runOutreachPipeline() {
  return toResult(async () => {
    const result = await runPipelineFor(await requireUserId());
    refresh();
    return result;
  });
}

/** Pull one batch into "To send" right now, outside the random schedule. */
export async function releaseBatchNow() {
  return toResult(async () => {
    const userId = await requireUserId();
    const { settings } = await getConfigFor(userId);
    const n = await releaseBatchFor(userId, batchSizes(settings.dailyVolume, settings.batches)[0], localNow(settings.timezone).day, null);
    refresh();
    return n;
  });
}

export async function updateLead(id: number, patch: LeadPatch) {
  return toResult(async () => {
    const row = await updateLeadFor(await requireUserId(), id, patch);
    refresh();
    return row;
  });
}

export async function redraftLead(id: number) {
  return toResult(async () => {
    const row = await redraftLeadFor(await requireUserId(), id);
    refresh();
    return row;
  });
}

export async function runMonthlyReview() {
  return toResult(async () => {
    const review = await runMonthlyReviewFor(await requireUserId());
    refresh();
    return review;
  });
}

export async function savePushSubscription(sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  return toResult(async () => {
    const ua = (await headers()).get("user-agent");
    await saveSubscriptionFor(await requireUserId(), sub, ua);
  });
}

export async function removePushSubscription(endpoint: string) {
  return toResult(async () => {
    await removeSubscriptionFor(await requireUserId(), endpoint);
  });
}

export async function sendTestPush() {
  return toResult(async () => {
    return notifyUser(await requireUserId(), {
      title: "Galaxus notifications work",
      body: "This is how you'll hear about each outreach batch.",
      url: "/outreach",
      tag: "outreach-test",
    });
  });
}

/** Paste businesses found by hand (one per line) — they go through the same audit. */
export async function importLeads(text: string, opts: { city?: string; category?: string }) {
  return toResult(async () => {
    const r = await importLeadsFor(await requireUserId(), text, opts);
    refresh();
    return r;
  });
}

/** Uptime for a client's site (last 31 days) + the ready-to-send monthly report. */
export async function getClientUptime(leadId: number) {
  return toResult(async () => {
    const userId = await requireUserId();
    const [{ clientChecksFor }, { getConfigFor: cfgFor }, { leads }, { db }, { and, eq }] = await Promise.all([
      import("@/lib/services/leads-auto"), import("@/lib/services/outreach/engine"), import("@/lib/db/schema"), import("@/lib/db"), import("drizzle-orm"),
    ]);
    const [lead] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.userId, userId))).limit(1);
    if (!lead) throw new Error("Lead not found.");
    const summary = uptimeSummary(await clientChecksFor(userId, leadId));
    if (!summary || !lead.clientSiteUrl) return { summary: null, report: null, whatsapp: null };
    const prev = new Date();
    prev.setDate(0); // last day of previous month → its label
    const report = uptimeReport({
      client: lead.name, monthLabel: prev.toLocaleString("bs-BA", { month: "long", year: "numeric" }), site: lead.clientSiteUrl,
      uptimePct: summary.uptimePct, avgMs: summary.avgMs, checks: summary.checks, senderName: (await cfgFor(userId)).senderName,
    });
    return { summary, report, whatsapp: lead.phone ? whatsappLink(lead.phone, report) : null };
  });
}
