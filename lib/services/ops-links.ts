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
import { opsAgents, opsLinks, opsMessages, userSettings, users, type OpsAgent } from "@/lib/db/schema";
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
