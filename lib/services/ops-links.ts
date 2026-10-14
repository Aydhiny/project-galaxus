// Linked facilities: your agents can radio another person's agents (and theirs
// yours), e.g. your Claude Code talks with Faruk's. The boundary is strict:
//   • messages only — no missions, board, data or budget cross over;
//   • both people opt in (invite → accept) and either can cut the link;
//   • each side decides whether the other may see its crew list;
//   • partner messages are labelled external, and agents are told they are
//     requests from someone else's agent, never orders (prompt injection);
//   • a daily cap per link and direction, so two agents can't loop forever.

import { and, eq, gte, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { opsAgents, opsLinks, opsMessages, opsMissions, userSettings, users, type OpsAgent } from "@/lib/db/schema";
import { MAX_LINKS, MAX_LINK_MESSAGES_PER_DAY, ROLES, facilityLabel, parseMessage, presence, roleOf } from "@/lib/ops";

async function labelOf(userId: number) {
  const [u] = await db.select({ name: users.name, cityName: userSettings.cityName }).from(users)
    .leftJoin(userSettings, eq(userSettings.userId, users.id)).where(eq(users.id, userId)).limit(1);
  return facilityLabel({ name: u?.name ?? null, cityName: u?.cityName ?? null });
}

/** Your links, from your side: who the partner is, whether it's live, and who shares their crew. */
export async function linksFor(userId: number) {
  const rows = await db.select().from(opsLinks).where(or(eq(opsLinks.fromUserId, userId), eq(opsLinks.toUserId, userId)));
  return Promise.all(rows.map(async (l) => {
    const mine = l.fromUserId === userId;
    const partnerId = mine ? l.toUserId : l.fromUserId;
    return {
      id: l.id, status: l.status as "pending" | "active", direction: mine ? ("out" as const) : ("in" as const),
      partner: await labelOf(partnerId),
      youShare: mine ? l.shareFrom : l.shareTo,
      theyShare: mine ? l.shareTo : l.shareFrom,
      // Shared lead pool (lib/services/lead-pool.ts): on only when both are true.
      youShareLeads: mine ? l.shareLeadsFrom : l.shareLeadsTo,
      theyShareLeads: mine ? l.shareLeadsTo : l.shareLeadsFrom,
    };
  }));
}
export type OpsLinkView = Awaited<ReturnType<typeof linksFor>>[number];

/** Invite someone by the email of their Galaxus account. */
export async function inviteLinkFor(userId: number, emailRaw: string, shareCrew = true) {
  const email = String(emailRaw ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That doesn't look like an email.");
  const [u] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  if (!u) throw new Error("No Galaxus account uses that email.");
  if (u.id === userId) throw new Error("That's your own facility.");
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(opsLinks).where(or(eq(opsLinks.fromUserId, userId), eq(opsLinks.toUserId, userId)));
  if (n >= MAX_LINKS) throw new Error(`Up to ${MAX_LINKS} linked facilities.`);
  const [existing] = await db.select().from(opsLinks)
    .where(or(and(eq(opsLinks.fromUserId, userId), eq(opsLinks.toUserId, u.id)), and(eq(opsLinks.fromUserId, u.id), eq(opsLinks.toUserId, userId)))).limit(1);
  if (existing) {
    // They already invited you: inviting back accepts.
    if (existing.toUserId === userId && existing.status === "pending") return respondLinkFor(userId, existing.id, true, shareCrew);
    throw new Error(existing.status === "active" ? "You're already linked." : "Your invite is already waiting for them.");
  }
  const [row] = await db.insert(opsLinks).values({ fromUserId: userId, toUserId: u.id, shareFrom: shareCrew }).returning();
  try {
    const { notifyUser } = await import("@/lib/services/outreach/push");
    await notifyUser(u.id, { title: `${await labelOf(userId)} wants to link facilities`, body: "Their agents could radio yours. Accept or decline in Ops → Connectors.", url: "/ops", tag: `ops-link-${row.id}` });
  } catch { /* best effort */ }
  return row;
}

/** The invitee accepts (choosing whether to share their crew) or declines. */
export async function respondLinkFor(userId: number, id: number, accept: boolean, shareCrew = false) {
  const [l] = await db.select().from(opsLinks).where(and(eq(opsLinks.id, id), eq(opsLinks.toUserId, userId), eq(opsLinks.status, "pending"))).limit(1);
  if (!l) throw new Error("That invite isn't waiting for you.");
  if (!accept) { await db.delete(opsLinks).where(eq(opsLinks.id, id)); return null; }
  const [row] = await db.update(opsLinks).set({ status: "active", shareTo: shareCrew }).where(eq(opsLinks.id, id)).returning();
  return row;
}

export async function setLinkShareFor(userId: number, id: number, share: boolean) {
  const [l] = await db.select().from(opsLinks).where(and(eq(opsLinks.id, id), or(eq(opsLinks.fromUserId, userId), eq(opsLinks.toUserId, userId)))).limit(1);
  if (!l) throw new Error("Link not found.");
  await db.update(opsLinks).set(l.fromUserId === userId ? { shareFrom: share } : { shareTo: share }).where(eq(opsLinks.id, id));
}

/** Either side can cut the link at any time. Past messages stay in both radios. */
export async function removeLinkFor(userId: number, id: number) {
  await db.delete(opsLinks).where(and(eq(opsLinks.id, id), or(eq(opsLinks.fromUserId, userId), eq(opsLinks.toUserId, userId))));
}

async function activeLinks(userId: number) {
  const rows = await db.select().from(opsLinks)
    .where(and(eq(opsLinks.status, "active"), or(eq(opsLinks.fromUserId, userId), eq(opsLinks.toUserId, userId))));
  return Promise.all(rows.map(async (l) => {
    const mine = l.fromUserId === userId;
    const partnerId = mine ? l.toUserId : l.fromUserId;
    return { link: l, partnerId, label: await labelOf(partnerId), theyShare: mine ? l.shareTo : l.shareFrom };
  }));
}

/** Partner facilities for ops_list_crew: always their name; their crew only if they share it. */
export async function partnerCrewsFor(userId: number) {
  const links = await activeLinks(userId);
  return Promise.all(links.map(async (p) => ({
    facility: p.label,
    crew: p.theyShare
      ? (await db.select().from(opsAgents).where(eq(opsAgents.userId, p.partnerId)).orderBy(opsAgents.id)).map((a) => ({
        name: a.name, role: ROLES[roleOf(a.role)].label, runs_on: a.cloud ? "cloud" : a.provider, presence: presence(a),
      }))
      : "not shared — message the facility without a name and their whole crew hears it",
  })));
}

/** One of your agents radios a partner facility (an agent there by name, or everyone there). */
export async function sendExternalForAgent(agent: OpsAgent, input: { facility: string; to?: string; body: string }) {
  const body = parseMessage(input.body);
  const want = input.facility.trim().toLowerCase();
  const links = await activeLinks(agent.userId);
  const p = links.find((x) => x.label.toLowerCase() === want);
  if (!p) throw new Error(`No linked facility called "${input.facility}". Linked: ${links.map((x) => x.label).join(", ") || "none"}.`);

  const startOfDay = new Date(new Date().toISOString().slice(0, 10));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(opsMessages)
    .where(and(eq(opsMessages.userId, p.partnerId), eq(opsMessages.linkId, p.link.id), isNotNull(opsMessages.extFrom), gte(opsMessages.at, startOfDay)));
  if (n >= MAX_LINK_MESSAGES_PER_DAY) throw new Error(`That's ${MAX_LINK_MESSAGES_PER_DAY} messages to ${p.label} today. Wrap up and continue tomorrow.`);

  let toAgentId: number | null = null, toName: string | null = null;
  if (input.to?.trim()) {
    if (!p.theyShare) throw new Error(`${p.label} doesn't share their crew. Send without "to" and their whole crew hears it.`);
    const [a] = await db.select().from(opsAgents).where(and(eq(opsAgents.userId, p.partnerId), sql`lower(${opsAgents.name}) = lower(${input.to.trim()})`)).limit(1);
    if (!a) throw new Error(`${p.label} has no agent called "${input.to}".`);
    toAgentId = a.id; toName = a.name;
  }
  const me = await labelOf(agent.userId);
  // Their copy (in their facility, labelled as external) and ours (for our radio log; nobody's inbox).
  await db.insert(opsMessages).values({ userId: p.partnerId, fromAgentId: null, toAgentId, linkId: p.link.id, extFrom: `${me} / ${agent.name}`.slice(0, 90), body });
  await db.insert(opsMessages).values({ userId: agent.userId, fromAgentId: agent.id, toAgentId: null, linkId: p.link.id, extTo: `${p.label}${toName ? ` / ${toName}` : ""}`.slice(0, 90), body });
  const { recordEventForAgent } = await import("@/lib/services/ops");
  await recordEventForAgent(agent, { kind: "message", label: `Radioed ${p.label}${toName ? ` / ${toName}` : ""}: ${body.replace(/\s+/g, " ").slice(0, 100)}`.slice(0, 200), url: null, status: "working" });
  return { sent: true, to: `${p.label}${toName ? ` / ${toName}` : " (everyone)"}` };
}

// ─── Work requests: pool two facilities' capacity ─────────────────────────────
// You (or your agent) ask a linked facility to do a mission. It runs ONLY if
// its owner accepts, on their plan and quota; the result comes back to your
// board as a delivered mission you review like any other.

const MAX_REQUESTS_PER_LINK_DAY = 5;

export async function requestWorkFor(userId: number, input: { linkId: number; title: string; brief?: string | null; budgetCents?: number | null; dueDay?: string | null; fromAgent?: string | null }) {
  const links = await activeLinks(userId);
  const p = links.find((x) => x.link.id === input.linkId);
  if (!p) throw new Error("That facility isn't linked (or the link isn't accepted yet).");
  const startOfDay = new Date(new Date().toISOString().slice(0, 10));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(opsMissions)
    .where(and(eq(opsMissions.userId, p.partnerId), eq(opsMissions.requestLinkId, p.link.id), gte(opsMissions.createdAt, startOfDay)));
  if (n >= MAX_REQUESTS_PER_LINK_DAY) throw new Error(`That's ${MAX_REQUESTS_PER_LINK_DAY} requests to ${p.label} today.`);
  const me = await labelOf(userId);
  const day = new Date().toISOString().slice(0, 10);
  const title = String(input.title ?? "").trim().slice(0, 200);
  if (title.length < 3) throw new Error("Give the request a title.");
  const brief = String(input.brief ?? "").slice(0, 4000) || null;
  // Ours: "at Faruk's", held until it comes back. Theirs: waiting for Faruk to accept.
  const [ours] = await db.insert(opsMissions).values({
    userId, day, title: `At ${p.label}'s: ${title}`.slice(0, 200), brief, kind: "other", status: "claimed", claimedAt: new Date(),
    requestLinkId: p.link.id, requestFromLabel: null, dueDay: input.dueDay ?? null,
  }).returning();
  const [theirs] = await db.insert(opsMissions).values({
    userId: p.partnerId, day, title, brief, kind: "research", status: "requested", requestLinkId: p.link.id,
    requestFromLabel: `${me}${input.fromAgent ? ` / ${input.fromAgent}` : ""}`.slice(0, 90), echoMissionId: ours.id,
    budgetCents: input.budgetCents ?? null, dueDay: input.dueDay ?? null,
  }).returning();
  await db.update(opsMissions).set({ echoMissionId: theirs.id }).where(eq(opsMissions.id, ours.id));
  try {
    const { pushFor } = await import("@/lib/services/ops-inbox");
    await pushFor(p.partnerId, "question", false, `${me} asks your facility for help`, title, `ops-req-${theirs.id}`);
  } catch { /* best effort */ }
  return { id: ours.id, requested: true };
}

/** The partner (you, on your side) accepts a request onto your board, or declines it. */
export async function respondRequestFor(userId: number, missionId: number, accept: boolean) {
  const [m] = await db.select().from(opsMissions).where(and(eq(opsMissions.id, missionId), eq(opsMissions.userId, userId), eq(opsMissions.status, "requested"))).limit(1);
  if (!m) throw new Error("That request isn't waiting for you.");
  if (accept) {
    await db.update(opsMissions).set({ status: "open", role: "researcher" }).where(eq(opsMissions.id, m.id));
    const { dispatchCloudFor } = await import("@/lib/services/ops");
    await dispatchCloudFor(userId).catch(() => {});
    return;
  }
  await db.update(opsMissions).set({ status: "cancelled" }).where(eq(opsMissions.id, m.id));
  if (!m.echoMissionId) return;
  const [ours] = await db.update(opsMissions).set({ status: "cancelled" })
    .where(and(eq(opsMissions.id, m.echoMissionId), eq(opsMissions.requestLinkId, m.requestLinkId ?? -1))).returning();
  if (ours) {
    try {
      const { pushFor } = await import("@/lib/services/ops-inbox");
      await pushFor(ours.userId, "report", false, "Request declined", ours.title, `ops-req-${ours.id}`);
    } catch { /* best effort */ }
  }
}

/** Their agent delivered your request: it lands on your board, ready for your review. */
export async function returnRequestResult(m: { id: number; userId: number; title: string; requestLinkId: number | null; echoMissionId: number | null }, agent: OpsAgent, markdown: string) {
  if (!m.echoMissionId || !m.requestLinkId) return;
  const [link] = await db.select().from(opsLinks).where(and(eq(opsLinks.id, m.requestLinkId), eq(opsLinks.status, "active"))).limit(1);
  if (!link) return; // unlinked since: nothing crosses any more
  const them = await labelOf(m.userId);
  const [ours] = await db.update(opsMissions).set({
    status: "submitted", submittedAt: new Date(), deliverableTitle: `From ${them} / ${agent.name}`.slice(0, 200), deliverable: markdown.slice(0, 20_000),
  }).where(and(eq(opsMissions.id, m.echoMissionId), eq(opsMissions.requestLinkId, m.requestLinkId), eq(opsMissions.status, "claimed"))).returning();
  if (ours) {
    try {
      const { pushFor } = await import("@/lib/services/ops-inbox");
      await pushFor(ours.userId, "delivered", false, `${them} delivered`, m.title, `ops-req-${ours.id}`);
    } catch { /* best effort */ }
  }
}

/** For an agent's ops_request_partner: by facility name. */
export async function requestWorkForAgent(agent: OpsAgent, input: { facility: string; title: string; brief?: string }) {
  const links = await activeLinks(agent.userId);
  const p = links.find((x) => x.label.toLowerCase() === input.facility.trim().toLowerCase());
  if (!p) throw new Error(`No linked facility called "${input.facility}".`);
  return requestWorkFor(agent.userId, { linkId: p.link.id, title: input.title, brief: input.brief, fromAgent: agent.name });
}
