// Deal Desk: every live conversation with a potential client, in one board.
// Deals aren't a separate copy of your data — they're read from where the
// conversations already live (autopilot emails, gigs you applied to, outreach
// leads). Only what you change by hand (stage, value, a pasted reply) is
// stored, in deal_overrides.

import { and, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { dealOverrides, gigEmails, gigs, leads, userSettings } from "@/lib/db/schema";
import { DEAL_STAGES, detectAgreement, priceToKm, stageFromEmail, stageFromLead, type DealStage } from "@/lib/deals";
import { classifyReplyRules, ruleReply } from "@/lib/autopilot";
import { autopilotSettingsFor } from "@/lib/services/autopilot";
import { addIncomeFor } from "@/lib/services/money";
import { notifyUser } from "@/lib/services/outreach/push";

export type Deal = {
  key: string; // email:12 | gig:5 | lead:3
  channel: string; // email | reddit | remotive | … | whatsapp | call
  title: string;
  who: string | null;
  url: string | null;
  stage: DealStage;
  valueKm: number | null;
  lastText: string | null;
  lastAt: string | null;
  suggestion: string | null;
  needsYou: boolean;
  note: string | null;
};

async function usdRate(userId: number) {
  const [s] = await db.select({ r: userSettings.usdToKm }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  return s?.r ?? 1.8;
}

export async function dealsFor(userId: number): Promise<Deal[]> {
  const rate = await usdRate(userId);
  const [emails, overrides] = await Promise.all([
    db.select({ e: gigEmails, title: gigs.title, budget: gigs.budget, url: gigs.url }).from(gigEmails).leftJoin(gigs, eq(gigEmails.gigId, gigs.id))
      .where(and(eq(gigEmails.userId, userId), eq(gigEmails.status, "sent"))),
    db.select().from(dealOverrides).where(eq(dealOverrides.userId, userId)),
  ]);
  const emailGigIds = emails.map((r) => r.e.gigId).filter((x): x is number => x != null);
  const [applied, contacted] = await Promise.all([
    db.select().from(gigs).where(and(eq(gigs.userId, userId), eq(gigs.status, "applied"), ...(emailGigIds.length ? [notInArray(gigs.id, emailGigIds)] : []))),
    db.select().from(leads).where(and(eq(leads.userId, userId), isNotNull(leads.sentAt), inArray(leads.status, ["sent", "replied", "meeting", "client", "not_interested", "do_not_contact"]))),
  ]);
  const ov = new Map(overrides.map((o) => [o.key, o]));

  const deals: Deal[] = [
    ...emails.map(({ e, title, budget, url }) => ({
      key: `email:${e.id}`, channel: "email", title: title ?? e.subject, who: e.toEmail, url,
      stage: stageFromEmail(e), valueKm: priceToKm(e.lastReplyText ?? "", rate) ?? priceToKm(budget ?? "", rate),
      lastText: e.lastReplyText ?? e.body.slice(0, 300), lastAt: (e.lastReplyAt ?? e.sentAt)?.toISOString() ?? null,
      suggestion: e.suggestedReply, needsYou: e.needsYou, note: null,
    })),
    ...applied.map((g) => ({
      key: `gig:${g.id}`, channel: g.source, title: g.title, who: g.author ? (g.source === "reddit" ? `u/${g.author}` : g.author) : null, url: g.url,
      stage: "contacted" as DealStage, valueKm: priceToKm(g.budget ?? "", rate),
      lastText: g.draft, lastAt: (g.actedAt ?? g.createdAt)?.toISOString() ?? null, suggestion: null, needsYou: false, note: null,
    })),
    ...contacted.flatMap((l) => {
      const stage = stageFromLead(l);
      if (!stage) return [];
      return [{
        key: `lead:${l.id}`, channel: l.channel === "whatsapp" ? "whatsapp" : "call", title: l.name, who: l.phone, url: "/outreach",
        stage, valueKm: l.retainerKm ? l.retainerKm * 12 : l.gaps.includes("no_website") ? 1500 : null,
        lastText: l.message, lastAt: (l.repliedAt ?? l.sentAt)?.toISOString() ?? null, suggestion: null, needsYou: l.status === "replied", note: l.notes,
      }];
    }),
  ];

  // Your manual changes win over what's derived.
  for (const d of deals) {
    const o = ov.get(d.key);
    if (!o) continue;
    if (o.stage) d.stage = o.stage as DealStage;
    if (o.valueKm != null) d.valueKm = o.valueKm;
    if (o.theirReply) { d.lastText = o.theirReply; d.lastAt = o.theirReplyAt?.toISOString() ?? d.lastAt; }
    if (o.suggestion) d.suggestion = o.suggestion;
    if (o.note) d.note = o.note;
    if (o.stage === "ready") d.needsYou = true;
  }
  const order = new Map(DEAL_STAGES.map((s, i) => [s.key, i]));
  return deals.sort((a, b) => (order.get(a.stage)! - order.get(b.stage)!) || (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
}

async function upsertOverride(userId: number, key: string, set: Partial<typeof dealOverrides.$inferInsert>) {
  await db.insert(dealOverrides).values({ userId, key, ...set }).onConflictDoUpdate({ target: [dealOverrides.userId, dealOverrides.key], set: { ...set, updatedAt: new Date() } });
}

const parseKey = (key: string) => {
  const m = key.match(/^(email|gig|lead):(\d+)$/);
  if (!m) throw new Error("Unknown deal.");
  return { kind: m[1] as "email" | "gig" | "lead", id: Number(m[2]) };
};

/** Move a deal. Winning one can log the income straight into Money. */
export async function setDealStageFor(userId: number, key: string, stage: DealStage, opts: { amountKm?: number | null } = {}) {
  const { kind, id } = parseKey(key);
  await upsertOverride(userId, key, { stage, ...(opts.amountKm ? { valueKm: Math.round(opts.amountKm) } : {}) });
  // Keep the source in sync, so Outreach and the reply-rate stats agree.
  if (kind === "lead" && (stage === "won" || stage === "lost")) {
    await db.update(leads).set({ status: stage === "won" ? "client" : "not_interested", updatedAt: new Date() }).where(and(eq(leads.id, id), eq(leads.userId, userId)));
  }
  if (stage === "won" && opts.amountKm && opts.amountKm > 0) {
    await addIncomeFor(userId, { amount: opts.amountKm, currency: "KM", source: kind === "lead" ? "client" : "gig", description: `Deal won (${key})`, leadId: kind === "lead" ? id : null });
  }
}

export async function setDealValueFor(userId: number, key: string, valueKm: number | null) {
  parseKey(key);
  await upsertOverride(userId, key, { valueKm: valueKm == null ? null : Math.max(0, Math.round(valueKm)) });
}

/**
 * For conversations outside email (Reddit, Instagram, WhatsApp): paste their
 * message, get the next move. Agreement → handed to you; otherwise a
 * suggested reply you can copy and send in one tap.
 */
export async function logTheirReplyFor(userId: number, key: string, text: string) {
  parseKey(key);
  const clean = String(text ?? "").trim().slice(0, 4000);
  if (!clean) throw new Error("Paste their message first.");
  const s = await autopilotSettingsFor(userId);
  const agreed = detectAgreement(clean);
  const { category } = classifyReplyRules(clean);
  const stage: DealStage = agreed ? "ready" : category === "rejection" ? "lost" : category === "negotiation" ? "negotiating" : "talking";
  const suggestion = agreed
    ? null // price, deadline and payment are yours to close
    : ruleReply(clean, { senderName: s.senderName ?? "", portfolioUrl: s.portfolioUrl, bookingUrl: s.bookingUrl, websiteMinKm: s.websiteMinKm, video: /video|edit|short|reel/i.test(clean) });
  const rate = await usdRate(userId);
  await upsertOverride(userId, key, { stage, theirReply: clean, theirReplyAt: new Date(), suggestion, ...(priceToKm(clean, rate) ? { valueKm: priceToKm(clean, rate) } : {}) });
  if (agreed) await notifyUser(userId, { title: "🎯 Deal ready — your turn", body: clean.slice(0, 140), url: "/deals", tag: `deal-${key}` }).catch(() => {});
  return { stage, suggestion, category };
}
