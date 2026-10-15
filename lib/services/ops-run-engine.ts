// Records what a run actually ran on (rules in lib/ops-run-engine.ts): on the
// agent (the badge, monitor and card read it) and on the mission (its card says
// "ran on Groq · gpt-oss-120b"). Called when a run starts and when it gets its
// model (a free run only knows its provider once askFree answers). Never throws:
// a label must never break a run.

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { opsAgents, opsMissions } from "@/lib/db/schema";
import { packRanOn, runEngineOf } from "@/lib/ops-run-engine";

export async function noteRunFor(agentId: number | null | undefined, missionId: number | null | undefined, engine: string, model: string | null) {
  const e = runEngineOf(engine);
  if (!e) return;
  const m = model ? model.slice(0, 120) : null;
  try {
    if (agentId) await db.update(opsAgents).set({ runEngine: e, runModel: m }).where(eq(opsAgents.id, agentId));
    if (missionId) await db.update(opsMissions).set({ ranOn: packRanOn(e, m) }).where(eq(opsMissions.id, missionId));
  } catch { /* a label, not the work */ }
}
