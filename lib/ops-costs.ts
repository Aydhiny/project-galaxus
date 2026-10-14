// Cost per lead: what the crew spent (Claude dollars, and free-model runs)
// divided by what it produced that you can use — qualified leads (sheet rows
// with a phone or an email) and, once they're in Outreach, the replies they got.
// Per agent, per mission kind, and in total. Pure, so it's unit-tested
// (ops-costs.test.ts); lib/services/ops-costs.ts feeds it from the database.

import { mergeTables } from "@/lib/ops";
import { colIndex } from "@/lib/ops-progress";

export type CostMission = {
  id: number; submittedBy: number | null; kind: string; status: string;
  spentCents: number; freeCalls: number | null; deliverable: string | null;
};
export type CostBucket = {
  spentCents: number; freeCalls: number; qualified: number; replies: number;
  perQualifiedCents: number | null; perReplyCents: number | null;
};
export type LeadCosts = { total: CostBucket; byAgent: Record<number, CostBucket>; byKind: Record<string, CostBucket> };

/** Same business, however it's written: "Dental Studio Smile d.o.o." ≈ "dental studio smile". */
export const bizName = (s: string) => s.toLowerCase().replace(/\b(d\.?o\.?o\.?|s\.?p\.?|obrt|szr)\b/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Names of the qualified rows (a phone or an email) in one deliverable's tables. */
export function qualifiedNames(md: string | null | undefined): string[] {
  const sheet = mergeTables([String(md ?? "")]);
  if (sheet.length < 2) return [];
  const [h, ...rows] = sheet;
  const phone = colIndex(h, ["Phone", "Telephone", "Tel", "Phone number", "Telefon"]);
  const email = colIndex(h, ["Email", "E-mail", "Mail", "Email address"]);
  if (phone < 0 && email < 0) return []; // not a contacts table
  const name = Math.max(0, colIndex(h, ["Name", "Business", "Business name", "Company"]));
  const has = (r: string[], i: number) => i >= 0 && /[\p{L}\p{N}]/u.test(r[i] ?? "") && !/^(n\/?a|none|unknown)$/i.test((r[i] ?? "").trim());
  return rows.filter((r) => has(r, phone) || has(r, email)).map((r) => bizName(r[name] ?? "")).filter(Boolean);
}

const bucket = (): CostBucket => ({ spentCents: 0, freeCalls: 0, qualified: 0, replies: 0, perQualifiedCents: null, perReplyCents: null });
const finish = (b: CostBucket): CostBucket => ({
  ...b,
  perQualifiedCents: b.qualified ? Math.round(b.spentCents / b.qualified) : null,
  perReplyCents: b.replies ? Math.round(b.spentCents / b.replies) : null,
});

/**
 * Spend and results per agent / kind / total. A business counts once, for the first
 * mission that delivered it (oldest id first). `repliedNames` are Outreach leads tagged
 * "ops" that replied or went further: a reply is credited to the mission that found it.
 */
export function leadCosts(missions: CostMission[], repliedNames: string[] = []): LeadCosts {
  const replied = new Set(repliedNames.map(bizName).filter(Boolean));
  const seen = new Set<string>();
  const total = bucket(), byAgent: Record<number, CostBucket> = {}, byKind: Record<string, CostBucket> = {};
  const delivered = (s: string) => s === "submitted" || s === "done";
  for (const m of [...missions].sort((a, b) => a.id - b.id)) {
    const fresh = delivered(m.status) ? qualifiedNames(m.deliverable).filter((n) => !seen.has(n) && seen.add(n)) : [];
    const add = (b: CostBucket) => {
      b.spentCents += m.spentCents; b.freeCalls += m.freeCalls ?? 0;
      b.qualified += fresh.length; b.replies += fresh.filter((n) => replied.has(n)).length;
    };
    add(total);
    if (m.submittedBy != null) add((byAgent[m.submittedBy] ??= bucket()));
    add((byKind[m.kind] ??= bucket()));
  }
  return {
    total: finish(total),
    byAgent: Object.fromEntries(Object.entries(byAgent).map(([k, v]) => [k, finish(v)])),
    byKind: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, finish(v)])),
  };
}
