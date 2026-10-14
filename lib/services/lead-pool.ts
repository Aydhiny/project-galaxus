// Shared lead pool between linked facilities (e.g. Ajdin and Faruk both doing
// outreach in Sarajevo). When BOTH sides of an active link opt in, neither
// contacts a business the other already contacted (or has in today's list):
// the lead is skipped with a note like "Faruk contacted this on 12 Oct".
//
// Only name, phone, city and dates are read from the partner's leads. Their
// notes and messages are never selected, so they can't leak.

import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { leads, opsLinks, userSettings, users } from "@/lib/db/schema";
import { facilityLabel } from "@/lib/ops";
import { buildPoolIndex, type PartnerContact, type PoolIndex, type PoolLead } from "@/lib/lead-pool";

const MAX_PARTNER_LEADS = 5000;

/** Partners you pool leads with: active links where both of you said yes. */
export async function poolPartnersFor(userId: number) {
  const rows = await db.select().from(opsLinks)
    .where(and(eq(opsLinks.status, "active"), eq(opsLinks.shareLeadsFrom, true), eq(opsLinks.shareLeadsTo, true), or(eq(opsLinks.fromUserId, userId), eq(opsLinks.toUserId, userId))));
  return rows.map((l) => (l.fromUserId === userId ? l.toUserId : l.fromUserId));
}

/** Their first name is how you know them ("Faruk"); the facility label if they have none. */
async function whoIs(partnerId: number) {
  const [u] = await db.select({ name: users.name, cityName: userSettings.cityName }).from(users)
    .leftJoin(userSettings, eq(userSettings.userId, users.id)).where(eq(users.id, partnerId)).limit(1);
  return (u?.name ?? "").trim().split(/\s+/)[0]?.slice(0, 40) || facilityLabel({ name: u?.name ?? null, cityName: u?.cityName ?? null });
}

/** What your partners contacted or queued, as a matcher. null when you pool with nobody (the common case: no extra queries). */
export async function poolIndexFor(userId: number): Promise<PoolIndex | null> {
  const partners = await poolPartnersFor(userId);
  if (!partners.length) return null;
  const contacts: PartnerContact[] = [];
  for (const pid of partners) {
    const who = await whoIs(pid);
    // Deliberately narrow: never notes, message or anything they wrote.
    const rows = await db.select({ name: leads.name, phone: leads.phone, city: leads.city, sentAt: leads.sentAt, queuedFor: leads.queuedFor, status: leads.status })
      .from(leads).where(and(eq(leads.userId, pid), or(isNotNull(leads.sentAt), eq(leads.status, "queued")))).limit(MAX_PARTNER_LEADS);
    for (const r of rows) contacts.push({ name: r.name, phone: r.phone, city: r.city, sentAt: r.sentAt, queuedFor: r.queuedFor ? String(r.queuedFor) : null, who });
  }
  return buildPoolIndex(contacts);
}

/** For rows about to be inserted: partner-contacted ones go in as skipped, with the note. Mutates and returns the rows. */
export async function tagPartnerContacted<T extends PoolLead & { status?: string; skipReason?: string | null; partnerNote?: string | null }>(userId: number, rows: T[]) {
  if (!rows.length) return rows;
  const idx = await poolIndexFor(userId);
  if (!idx) return rows;
  for (const r of rows) {
    const hit = idx.match(r);
    if (hit) Object.assign(r, { status: "skipped", skipReason: "partner_contacted", partnerNote: hit.note });
  }
  return rows;
}

/** Skip any of these lead ids a partner already has. Returns the ids that are still yours to contact. */
export async function skipPartnerContacted(userId: number, ids: number[]) {
  if (!ids.length) return ids;
  const idx = await poolIndexFor(userId);
  if (!idx) return ids;
  const rows = await db.select({ id: leads.id, name: leads.name, phone: leads.phone, city: leads.city }).from(leads).where(and(eq(leads.userId, userId), inArray(leads.id, ids)));
  const keep = new Set(ids);
  for (const r of rows) {
    const hit = idx.match(r);
    if (!hit) continue;
    keep.delete(r.id);
    await db.update(leads).set({ status: "skipped", skipReason: "partner_contacted", partnerNote: hit.note, queuedFor: null, batch: null, updatedAt: new Date() }).where(eq(leads.id, r.id));
  }
  return ids.filter((id) => keep.has(id));
}

/** One lead: the partner note if a partner has it, else null. */
export async function partnerHitFor(userId: number, lead: PoolLead) {
  const idx = await poolIndexFor(userId);
  return idx?.match(lead) ?? null;
}

/** Your side of a link's "share leads" switch. The pool is on only when both sides have it on. */
export async function setLinkLeadsFor(userId: number, id: number, share: boolean) {
  const [l] = await db.select().from(opsLinks).where(and(eq(opsLinks.id, id), or(eq(opsLinks.fromUserId, userId), eq(opsLinks.toUserId, userId)))).limit(1);
  if (!l) throw new Error("Link not found.");
  await db.update(opsLinks).set(l.fromUserId === userId ? { shareLeadsFrom: !!share } : { shareLeadsTo: !!share }).where(eq(opsLinks.id, id));
}
