// Cost per lead for the scoreboard (the math is in lib/ops-costs.ts). Same
// window as the scorecards: missions delivered in the last 30 days.

import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { leads, opsMissions } from "@/lib/db/schema";
import { REPLIED_STATUSES } from "@/lib/outreach";
import { leadCosts } from "@/lib/ops-costs";

export async function leadCostsFor(userId: number, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const [missions, replied] = await Promise.all([
    db.select({
      id: opsMissions.id, submittedBy: opsMissions.submittedBy, kind: opsMissions.kind, status: opsMissions.status,
      spentCents: opsMissions.spentCents, freeCalls: opsMissions.freeCalls,
      // Only results that hold a table are worth reading in full (keeps the payload small).
      deliverable: sql<string | null>`case when ${opsMissions.deliverable} like '%|%' then ${opsMissions.deliverable} else null end`,
    }).from(opsMissions)
      .where(and(eq(opsMissions.userId, userId), sql`${opsMissions.submittedBy} is not null`, gte(opsMissions.createdAt, since)))
      .limit(500),
    // Leads that came from Ops ("Send to Outreach" tags them "ops") and got an answer. None yet → no reply column.
    db.select({ name: leads.name }).from(leads)
      .where(and(eq(leads.userId, userId), sql`${leads.tags} @> '["ops"]'::jsonb`, inArray(leads.status, REPLIED_STATUSES)))
      .limit(2000),
  ]);
  return leadCosts(missions, replied.map((r) => r.name));
}
