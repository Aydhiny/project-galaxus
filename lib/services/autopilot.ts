// Gig autopilot: send applications → watch replies → answer routine ones →
// follow up. Every automatic send passes: invited-by-email, Claude-written,
// score ≥ min, one per company, 2–72 h post age, website ≥ your minimum,
// quality gate, own-links-only, daily cap. "shadow" mode drafts only.

import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { autopilotSettings, gigEmails, gigProfiles, gigs, userSettings, users, type GigEmail } from "@/lib/db/schema";
import {
  classifyReplyRules, companyKey, eligibility, extractContactEmail, followUpBody, parseReplyDecision, passesQualityGate, replyPrompt,
  ruleReply, sanitizeLinks, templateApplication, type AutopilotMode,
} from "@/lib/autopilot";
import { parseJsonReply } from "@/lib/claude-jobs";
import { fetchRepliesFor, gmailCredsFor, sendMailFor } from "@/lib/services/mail";
import { notifyUser } from "@/lib/services/outreach/push";

const MAX_AUTO_REPLIES = 3; // per conversation, then it's yours

export async function autopilotSettingsFor(userId: number) {
  const find = () => db.select().from(autopilotSettings).where(eq(autopilotSettings.userId, userId)).limit(1);
  let [row] = await find();
  if (!row) {
    const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
    await db.insert(autopilotSettings).values({ userId, senderName: u?.name ?? null }).onConflictDoNothing();
    [row] = await find();
  }
  return row;
}

export async function saveAutopilotSettingsFor(userId: number, patch: Partial<{ mode: AutopilotMode; dailyCap: number; minScore: number; websiteMinKm: number; portfolioUrl: string; bookingUrl: string; senderName: string; followUps: boolean }>) {
  await autopilotSettingsFor(userId);
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.mode && ["off", "shadow", "on"].includes(patch.mode)) {
    if (patch.mode === "on" && !(await gmailCredsFor(userId))) throw new Error("Connect Gmail before turning the autopilot on.");
    set.mode = patch.mode;
  }
  if (patch.dailyCap !== undefined) set.dailyCap = Math.min(25, Math.max(1, Math.round(patch.dailyCap)));
  if (patch.minScore !== undefined) set.minScore = Math.min(95, Math.max(50, Math.round(patch.minScore)));
  if (patch.websiteMinKm !== undefined) set.websiteMinKm = Math.max(0, Math.round(patch.websiteMinKm));
  for (const k of ["portfolioUrl", "bookingUrl"] as const) {
    if (patch[k] !== undefined) {
      const v = String(patch[k]).trim();
      if (v && !/^https:\/\/\S+\.\S+/.test(v)) throw new Error("Links must start with https://");
      set[k] = v || null;
    }
  }
  if (patch.senderName !== undefined) set.senderName = String(patch.senderName).trim().slice(0, 100) || null;
  if (patch.followUps !== undefined) set.followUps = !!patch.followUps;
  await db.update(autopilotSettings).set(set).where(eq(autopilotSettings.userId, userId));
}

async function usdRate(userId: number) {
  const [s] = await db.select({ usd: userSettings.usdToKm }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  return s?.usd ?? 1.8;
}

const startOfToday = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; };

// ─── Applications ─────────────────────────────────────────────────────────────

export async function runAutopilotSendFor(userId: number) {
  const s = await autopilotSettingsFor(userId);
  if (s.mode === "off") return { mode: "off" };
  const live = s.mode === "on" && !!(await gmailCredsFor(userId));
  const status = live ? "sent" : "shadow";
  const [{ n: doneToday }] = await db.select({ n: sql<number>`count(*)::int` }).from(gigEmails)
    .where(and(eq(gigEmails.userId, userId), eq(gigEmails.status, status), gte(gigEmails.createdAt, startOfToday())));
  let room = s.dailyCap - doneToday;
  if (room <= 0) return { mode: s.mode, sent: 0, reason: "daily cap reached" };

  const sentRows = await db.select({ to: gigEmails.toEmail, gigId: gigEmails.gigId }).from(gigEmails)
    .where(and(eq(gigEmails.userId, userId), inArray(gigEmails.status, live ? ["sent"] : ["sent", "shadow"])));
  const contacted = new Set(sentRows.map((r) => companyKey(r.to)));
  const handledGigs = new Set(sentRows.map((r) => r.gigId));
  const candidates = await db.select({ g: gigs, profileName: gigProfiles.name }).from(gigs)
    .leftJoin(gigProfiles, eq(gigs.profileId, gigProfiles.id))
    .where(and(eq(gigs.userId, userId), eq(gigs.status, "new")))
    .orderBy(desc(gigs.score)).limit(80);
  const ctx = { now: new Date(), usdToKm: await usdRate(userId), contacted };
  const done: string[] = [];
  const skipped: Record<string, number> = {};

  for (const { g, profileName } of candidates) {
    if (room <= 0) break;
    if (handledGigs.has(g.id)) continue;
    const contactEmail = g.contactEmail ?? extractContactEmail(`${g.title}\n${g.body ?? ""}`);
    const verdict = eligibility({ ...g, contactEmail, profileName: profileName ?? "" }, s, ctx);
    if (!verdict.ok) { skipped[verdict.reason] = (skipped[verdict.reason] ?? 0) + 1; continue; }
    // Claude's email when it wrote one; otherwise the built-in writer (works without Claude).
    const content = g.scoredBy === "claude" && g.subject && g.draft
      ? { subject: g.subject, body: g.draft }
      : templateApplication({ title: g.title, body: g.body ?? "", budget: g.budget, contactEmail, profileName: profileName ?? "", senderName: s.senderName ?? "", portfolioUrl: s.portfolioUrl });
    const body = sanitizeLinks(content.body, [s.portfolioUrl, s.bookingUrl]);
    const gate = passesQualityGate(content.subject, body);
    if (!gate.ok) { skipped[gate.reason!] = (skipped[gate.reason!] ?? 0) + 1; continue; }
    const subject = content.subject;
    const text = `${body}\n\n— ${s.senderName ?? ""}${s.portfolioUrl && !body.includes(s.portfolioUrl) ? `\n${s.portfolioUrl}` : ""}`.trim();
    try {
      const messageId = live ? await sendMailFor(userId, { to: contactEmail!, subject, text }) : null;
      await db.insert(gigEmails).values({ userId, gigId: g.id, toEmail: contactEmail!, subject, body: text, status, messageId, sentAt: live ? new Date() : null });
      if (live) await db.update(gigs).set({ status: "applied" }).where(eq(gigs.id, g.id));
      contacted.add(companyKey(contactEmail!));
      done.push(g.title);
      room--;
    } catch (e) {
      await db.insert(gigEmails).values({ userId, gigId: g.id, toEmail: contactEmail!, subject, body: text, status: "failed", error: e instanceof Error ? e.message.slice(0, 300) : "send failed" });
      break; // a Gmail error usually affects every send — stop and retry next beat
    }
  }
  if (done.length) {
    await notifyUser(userId, {
      title: live ? `📨 Autopilot applied to ${done.length} gig${done.length === 1 ? "" : "s"}` : `👀 Shadow mode: would apply to ${done.length} gig${done.length === 1 ? "" : "s"}`,
      body: done.slice(0, 2).map((t) => t.replace(/\[[^\]]*\]\s*/g, "").slice(0, 60)).join(" · "),
      url: "/gigs",
      tag: "autopilot-send",
    }).catch(() => {});
  }
  return { mode: s.mode, [live ? "sent" : "shadowed"]: done.length, skipped };
}

// ─── Inbox robot ──────────────────────────────────────────────────────────────

export async function runAutopilotInboxFor(userId: number) {
  const s = await autopilotSettingsFor(userId);
  if (s.mode === "off" || !(await gmailCredsFor(userId))) return { skipped: "off or no Gmail" };
  const rows = await db.select().from(gigEmails)
    .where(and(eq(gigEmails.userId, userId), eq(gigEmails.status, "sent"), isNotNull(gigEmails.messageId), gte(gigEmails.sentAt, new Date(Date.now() - 21 * 86_400_000))));
  if (rows.length === 0) return { checked: 0 };
  const byMsgId = new Map(rows.map((r) => [r.messageId!, r]));
  const byAddr = new Map(rows.map((r) => [r.toEmail.toLowerCase(), r]));
  const replies = await fetchRepliesFor(userId, { messageIds: new Set(byMsgId.keys()), addresses: new Set(byAddr.keys()) });
  const { enqueueJobFor } = await import("@/lib/services/claude-jobs");
  let fresh = 0;
  for (const r of replies.sort((a, b) => a.date.getTime() - b.date.getTime())) {
    const row = [r.inReplyTo, ...r.references].map((id) => (id ? byMsgId.get(id) : undefined)).find(Boolean) ?? byAddr.get(r.from);
    if (!row || row.lastReplyMessageId === r.messageId || (row.lastReplyAt && r.date <= row.lastReplyAt)) continue;
    await db.update(gigEmails).set({
      replyCount: row.replyCount + 1, lastReplyAt: r.date, lastReplyText: r.text, lastReplyMessageId: r.messageId, needsYou: false, category: null, suggestedReply: null,
    }).where(eq(gigEmails.id, row.id));
    fresh++;
    // Reply watch: a reply from a lead's own domain means that lead answered.
    const { onEmailReply } = await import("@/lib/services/reply-watch");
    await onEmailReply(userId, r.from, r.text);
    await handleReplyWithRules(userId, s, { ...row, lastReplyText: r.text, lastReplyMessageId: r.messageId, replyCount: row.replyCount + 1 }, r.from, enqueueJobFor);
  }
  return { checked: replies.length, fresh };
}

/**
 * Rules first — instant and free: clear "send portfolio / rates? / let's talk"
 * replies are answered right away; rejections and out-of-office stay quiet;
 * negotiation and scams come to you. Only unclear replies go to Claude, and
 * only while Claude is healthy.
 */
async function handleReplyWithRules(
  userId: number,
  s: Awaited<ReturnType<typeof autopilotSettingsFor>>,
  row: GigEmail,
  from: string,
  enqueue: (userId: number, kind: "email_reply", label: string, payload: Record<string, unknown>) => Promise<unknown>
) {
  const text = row.lastReplyText ?? "";
  const { category, confident } = classifyReplyRules(text);
  const [g] = row.gigId ? await db.select({ profileId: gigs.profileId }).from(gigs).where(eq(gigs.id, row.gigId)).limit(1) : [];
  const [prof] = g?.profileId ? await db.select({ name: gigProfiles.name }).from(gigProfiles).where(eq(gigProfiles.id, g.profileId)).limit(1) : [];
  const video = /video|edit|short/i.test(prof?.name ?? row.subject);

  if (confident && (category === "rejection" || category === "out_of_office")) {
    await db.update(gigEmails).set({ category, needsYou: false }).where(eq(gigEmails.id, row.id));
    return;
  }
  // They said yes: from here price, deadline and payment are yours. No auto-reply.
  const { detectAgreement } = await import("@/lib/deals");
  if (detectAgreement(text)) {
    await db.update(gigEmails).set({ category: "interested", needsYou: true }).where(eq(gigEmails.id, row.id));
    await notifyUser(userId, { title: `🎯 Deal ready — ${from} said yes`, body: text.slice(0, 140), url: "/deals", tag: `deal-email:${row.id}` }).catch(() => {});
    return;
  }
  const answer = confident ? ruleReply(text, { senderName: s.senderName ?? "", portfolioUrl: s.portfolioUrl, bookingUrl: s.bookingUrl, websiteMinKm: s.websiteMinKm, video }) : null;
  if (answer && s.mode === "on" && row.autoReplied < MAX_AUTO_REPLIES) {
    const clean = sanitizeLinks(answer, [s.portfolioUrl, s.bookingUrl]);
    await sendThreadedReply(userId, row, clean);
    await db.update(gigEmails).set({ category, suggestedReply: clean, needsYou: false, autoReplied: row.autoReplied + 1 }).where(eq(gigEmails.id, row.id));
    await notifyUser(userId, { title: `🤖 ${from} replied — answered in seconds`, body: `${text.slice(0, 80)} → ${clean.slice(0, 60)}`, url: "/gigs", tag: `reply-${row.id}` }).catch(() => {});
    return;
  }
  // Yours: notify now (speed matters), with a suggested answer when the rules have one.
  await db.update(gigEmails).set({ category, suggestedReply: answer, needsYou: true }).where(eq(gigEmails.id, row.id));
  await notifyUser(userId, { title: `💬 ${from} replied${category !== "other" ? ` (${category})` : ""}`, body: text.slice(0, 140), url: "/gigs", tag: `reply-${row.id}` }).catch(() => {});
  const { claudeHealthy } = await import("@/lib/services/claude-jobs");
  if (category === "other" && (await claudeHealthy(userId))) {
    await enqueue(userId, "email_reply", `Reply from ${from}`, { gigEmailId: row.id }).catch(() => {});
  }
}

export async function buildEmailReplyPrompt(userId: number, gigEmailId: number) {
  const s = await autopilotSettingsFor(userId);
  const [row] = await db.select().from(gigEmails).where(and(eq(gigEmails.id, gigEmailId), eq(gigEmails.userId, userId))).limit(1);
  if (!row?.lastReplyText) throw new Error("Nothing to answer.");
  const [g] = row.gigId ? await db.select({ title: gigs.title }).from(gigs).where(eq(gigs.id, row.gigId)).limit(1) : [];
  return replyPrompt({
    senderName: s.senderName ?? "", portfolioUrl: s.portfolioUrl, bookingUrl: s.bookingUrl, websiteMinKm: s.websiteMinKm,
    gigTitle: g?.title ?? row.subject, myEmail: row.body, theirReply: row.lastReplyText,
  });
}

async function sendThreadedReply(userId: number, row: GigEmail, text: string) {
  return sendMailFor(userId, {
    to: row.toEmail,
    subject: row.subject.startsWith("Re:") ? row.subject : `Re: ${row.subject}`,
    text,
    inReplyTo: row.lastReplyMessageId ?? row.messageId,
    references: row.messageId ? [row.messageId] : [],
  });
}

export async function applyEmailReplyResult(userId: number, gigEmailId: number, resultText: string): Promise<string> {
  const s = await autopilotSettingsFor(userId);
  const [row] = await db.select().from(gigEmails).where(and(eq(gigEmails.id, gigEmailId), eq(gigEmails.userId, userId))).limit(1);
  if (!row) throw new Error("Conversation not found.");
  const d = parseReplyDecision(parseJsonReply(resultText));
  if (!d) throw new Error("Claude's decision couldn't be read.");
  const reply = sanitizeLinks(d.reply, [s.portfolioUrl, s.bookingUrl]);
  const canAuto = s.mode === "on" && !d.needsHuman && row.autoReplied < MAX_AUTO_REPLIES && reply.split(/\s+/).length >= 8 && passesQualityGate("Re", `${reply} x x x x x x x x x x x x x x x x x x x x`).ok;
  if (canAuto) {
    await sendThreadedReply(userId, row, reply);
    await db.update(gigEmails).set({ category: d.category, suggestedReply: reply, needsYou: false, autoReplied: row.autoReplied + 1 }).where(eq(gigEmails.id, row.id));
    await notifyUser(userId, { title: `🤖 Answered ${row.toEmail}`, body: `${d.category}: ${reply.slice(0, 120)}`, url: "/gigs", tag: `reply-${row.id}` }).catch(() => {});
    return `Auto-replied (${d.category})`;
  }
  const quiet = d.category === "out_of_office" || d.category === "rejection";
  await db.update(gigEmails).set({ category: d.category, suggestedReply: reply, needsYou: !quiet }).where(eq(gigEmails.id, row.id));
  if (!quiet) {
    await notifyUser(userId, { title: `👋 ${row.toEmail} needs you (${d.category})`, body: d.reason || reply.slice(0, 120), url: "/gigs", tag: `reply-${row.id}` }).catch(() => {});
  }
  return `Needs you (${d.category})`;
}

/** You approve / edit Claude's suggestion and send it. */
export async function sendManualReplyFor(userId: number, gigEmailId: number, text: string) {
  const [row] = await db.select().from(gigEmails).where(and(eq(gigEmails.id, gigEmailId), eq(gigEmails.userId, userId))).limit(1);
  if (!row) throw new Error("Conversation not found.");
  if (text.trim().length < 2) throw new Error("Write something first.");
  await sendThreadedReply(userId, row, text.trim().slice(0, 4000));
  await db.update(gigEmails).set({ needsYou: false, suggestedReply: null }).where(eq(gigEmails.id, row.id));
}

export async function dismissConversationFor(userId: number, gigEmailId: number) {
  await db.update(gigEmails).set({ needsYou: false }).where(and(eq(gigEmails.id, gigEmailId), eq(gigEmails.userId, userId)));
}

// ─── Follow-ups ───────────────────────────────────────────────────────────────

export async function runAutopilotFollowUpsFor(userId: number) {
  const s = await autopilotSettingsFor(userId);
  if (s.mode !== "on" || !s.followUps || !(await gmailCredsFor(userId))) return { skipped: "off" };
  const due = await db.select().from(gigEmails)
    .where(and(eq(gigEmails.userId, userId), eq(gigEmails.status, "sent"), eq(gigEmails.replyCount, 0), isNull(gigEmails.followUpAt), lt(gigEmails.sentAt, new Date(Date.now() - 4 * 86_400_000))))
    .limit(10);
  let sent = 0;
  for (const row of due) {
    try {
      await sendThreadedReply(userId, { ...row, lastReplyMessageId: null }, followUpBody({ senderName: s.senderName ?? "", portfolioUrl: s.portfolioUrl }));
      await db.update(gigEmails).set({ followUpAt: new Date() }).where(eq(gigEmails.id, row.id));
      sent++;
    } catch {
      break;
    }
  }
  return { sent };
}

// ─── State for the UI ─────────────────────────────────────────────────────────

export async function autopilotStateFor(userId: number) {
  const [settings, creds, recent] = await Promise.all([
    autopilotSettingsFor(userId),
    gmailCredsFor(userId),
    db.select({ e: gigEmails, title: gigs.title, url: gigs.url }).from(gigEmails).leftJoin(gigs, eq(gigEmails.gigId, gigs.id))
      .where(eq(gigEmails.userId, userId)).orderBy(desc(gigEmails.createdAt)).limit(60),
  ]);
  const today = startOfToday().getTime();
  const rows = recent.map((r) => ({ ...r.e, gigTitle: r.title, gigUrl: r.url }));
  return {
    settings,
    gmail: creds ? creds.email : null,
    today: {
      sent: rows.filter((r) => r.status === "sent" && r.createdAt && r.createdAt.getTime() >= today).length,
      shadow: rows.filter((r) => r.status === "shadow" && r.createdAt && r.createdAt.getTime() >= today).length,
    },
    totals: { sent: rows.filter((r) => r.status === "sent").length, replies: rows.filter((r) => r.replyCount > 0).length },
    needsYou: rows.filter((r) => r.needsYou),
    activity: rows.slice(0, 30),
  };
}
