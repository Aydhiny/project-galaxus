// Shared lead pool — pure parts. Two linked facilities that both opt in to
// "share leads" never contact the same business twice. Only the business's
// identity (name key, phone, city) and the date cross over: never the
// partner's notes, messages or anything else they wrote.

import { bizKey } from "@/lib/outreach";

export type PoolLead = { name: string; phone: string | null; city: string | null };
export type PartnerContact = PoolLead & { who: string; sentAt: Date | null; queuedFor: string | null };
export type PoolHit = { who: string; note: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10-12" or a Date → "12 Oct". */
export function shortDay(d: Date | string): string {
  const s = typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
  return `${Number(s.slice(8, 10))} ${MONTHS[Number(s.slice(5, 7)) - 1] ?? ""}`.trim();
}

/** What you see on the lead: who and when, nothing else. */
export function partnerNote(c: Pick<PartnerContact, "who" | "sentAt" | "queuedFor">): string {
  if (c.sentAt) return `${c.who} contacted this on ${shortDay(c.sentAt)}`.slice(0, 160);
  return `${c.who} has this in their send list${c.queuedFor ? ` for ${shortDay(c.queuedFor)}` : ""}`.slice(0, 160);
}

const cityKey = (c: string | null) => (c ?? "").trim().toLowerCase();

/**
 * An index of what partners already contacted (or are about to). A lead
 * matches on the same phone, or on the same business key in the same city
 * (or where either side has no city). Keys under 4 letters are too generic
 * to compare at all.
 */
export function buildPoolIndex(contacts: PartnerContact[]) {
  const byPhone = new Map<string, PartnerContact>();
  const byKey = new Map<string, PartnerContact[]>();
  // Earliest contact wins: that's the one that happened first.
  const when = (c: PartnerContact) => (c.sentAt ? c.sentAt.getTime() : Number.MAX_SAFE_INTEGER);
  for (const c of [...contacts].sort((a, b) => when(a) - when(b))) {
    if (c.phone && !byPhone.has(c.phone)) byPhone.set(c.phone, c);
    const k = bizKey(c.name);
    if (k.length >= 4) byKey.set(k, [...(byKey.get(k) ?? []), c]);
  }
  return {
    size: contacts.length,
    match(lead: PoolLead): PoolHit | null {
      const p = lead.phone ? byPhone.get(lead.phone) : undefined;
      const k = bizKey(lead.name);
      const n = k.length >= 4 ? byKey.get(k)?.find((c) => !c.city || !lead.city || cityKey(c.city) === cityKey(lead.city)) : undefined;
      const hit = [p, n].filter((x): x is PartnerContact => !!x).sort((a, b) => when(a) - when(b))[0];
      return hit ? { who: hit.who, note: partnerNote(hit) } : null;
    },
  };
}
export type PoolIndex = ReturnType<typeof buildPoolIndex>;
