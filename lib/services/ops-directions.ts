// Talk to the Chief: your directions ("focus on lawyers in Mostar tomorrow,
// skip dentists with good sites") become the Chief's standing orders.
// Each one is
//   • a pinned memory of type "direction" (so every agent's brief carries it),
//   • a radio message to the Chief (you see it fly across the floor), and
//   • an explicit "DIRECTIONS FROM THE USER" block in the project planner's and
//     the stand-up planner's prompts (directionsBlock), not left to memory search.
// The Chief acknowledges on the radio: one line from a free model when one is
// usable (never Claude: this is chatter, not work), else a plain "Noted: …".

import { and, desc, eq, sql } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/lib/db";
import { opsAgents, opsMemories, opsMessages, opsProjects } from "@/lib/db/schema";
import { redact } from "@/lib/ops";

export const MAX_DIRECTIONS = 20; // standing orders at once: remove old ones to add more
const IN_PROMPT = 12; // newest first, into each plan prompt

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The Chief who takes your directions: your cloud Chief of staff if you have one, else any Chief. */
export async function chiefFor(userId: number) {
  const chiefs = await db.select().from(opsAgents).where(and(eq(opsAgents.userId, userId), eq(opsAgents.role, "chief"))).orderBy(opsAgents.id);
  return chiefs.find((c) => c.cloud) ?? chiefs[0] ?? null;
}

/** Your standing orders, newest first. */
export async function directionsFor(userId: number) {
  const rows = await db.select({ id: opsMemories.id, body: opsMemories.body, at: opsMemories.createdAt }).from(opsMemories)
    .where(and(eq(opsMemories.userId, userId), eq(opsMemories.type, "direction"))).orderBy(desc(opsMemories.createdAt), desc(opsMemories.id)).limit(MAX_DIRECTIONS);
  return rows.map((r) => ({ id: r.id, text: r.body, at: r.at.toISOString() }));
}

/** What the planners read: your active directions as one block, or "" when there are none. */
export async function directionsBlock(userId: number) {
  const rows = (await directionsFor(userId)).slice(0, IN_PROMPT);
  if (!rows.length) return "";
  return `DIRECTIONS FROM THE USER (follow these; newest first, a newer one wins over an older one):\n${rows.map((r) => `- (${r.at.slice(0, 10)}) ${r.text.replace(/\s+/g, " ").slice(0, 400)}`).join("\n")}`;
}

/** You give the Chief a direction. Saved, radioed to the Chief, and acknowledged (after the response). */
export async function addDirectionFor(userId: number, raw: string) {
  const text = redact(String(raw ?? "")).replace(/\r/g, "").trim().slice(0, 600);
  if (text.length < 3) throw new Error("Write the direction (a few words at least).");
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(opsMemories).where(and(eq(opsMemories.userId, userId), eq(opsMemories.type, "direction")));
  if (n >= MAX_DIRECTIONS) throw new Error(`That's ${MAX_DIRECTIONS} standing orders. Remove one the Chief no longer needs first.`);
  const { remember } = await import("@/lib/services/ops-memory");
  const memory = await remember(userId, { type: "direction", title: `Direction: ${clip(text.replace(/\s+/g, " "), 120)}`, body: text, source: `direction:${Date.now()}${Math.random().toString(36).slice(2, 6)}`, pinned: true });
  if (!memory) throw new Error("Write the direction (a few words at least).");
  const chief = await chiefFor(userId);
  // To the Chief by name; with no Chief yet, to the command team (whoever joins it hears it).
  await db.insert(opsMessages).values({ userId, fromAgentId: null, toAgentId: chief?.id ?? null, toTeam: chief ? null : "command", body: `Direction: ${text}` });
  // An order should change what happens now, not just be noted: re-plan idle projects with it, then reply.
  const work = async () => {
    const replanned = await replanIdleProjects(userId);
    if (chief) await acknowledge(userId, chief.id, text, replanned);
  };
  try { after(work); } catch { await work(); } // outside a request (scripts/tests) there's no after()
  return { id: memory.id, chief: chief?.name ?? null };
}

export async function removeDirectionFor(userId: number, id: number) {
  await db.delete(opsMemories).where(and(eq(opsMemories.id, id), eq(opsMemories.userId, userId), eq(opsMemories.type, "direction")));
}

/** "Noted: …" for when no free model can answer. */
export const notedLine = (text: string) => `Noted: ${clip(text.replace(/\s+/g, " "), 180)}. I'll plan around it.`;

/** The Chief's one-line reply on the radio, to everyone (so the crew hears the new order too). Never throws. */
async function acknowledge(userId: number, chiefId: number, text: string, replanned: string[] = []) {
  let line = replanned.length ? `${notedLine(text).replace(/ I'll plan around it\.$/, "")} Re-planning now: ${replanned.join(", ")}.` : notedLine(text);
  try {
    const { freeStatusFor, askFree } = await import("@/lib/services/free-llm");
    if ((await freeStatusFor(userId)).usableCount > 0) {
      // Grounded: what the facility is actually doing, so the reply can't invent work ("integration and testing"…).
      const { projectsFor } = await import("@/lib/services/ops-projects");
      const [projects, crew] = await Promise.all([
        projectsFor(userId).catch(() => []),
        db.select({ name: opsAgents.name, role: opsAgents.role }).from(opsAgents).where(eq(opsAgents.userId, userId)),
      ]);
      const facts = [
        projects.filter((p) => p.status === "active").map((p) => `Project "${p.title.slice(0, 120)}": ${p.done} done, ${p.active} in progress${p.sheetRows ? `, ${p.sheetRows} rows found` : ""}.`).join(" ") || "No active project.",
        `Crew: ${crew.map((c) => `${c.name} (${c.role})`).join(", ")}.`,
        replanned.length ? `You are re-planning these projects right now: ${replanned.join(", ")}.` : "",
      ].filter(Boolean).join("\n");
      const r = await askFree(userId, {
        system: "You are the Chief of staff of a small AI agent crew. The user just gave you a standing order. Reply in ONE short sentence (max 30 words): what you will do next, using ONLY the facts given (real project and crew names). Never mention work that isn't in the facts. No greeting, no questions, no quotes.",
        prompt: `FACTS:\n${facts}\n\nThe user's order: ${text}`,
        maxTokens: 300,
      });
      const one = r.text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/\s+/g, " ").replace(/^["'“]|["'”]$/g, "").trim();
      if (one.length >= 4) line = clip(one, 240);
    }
  } catch { /* the plain line will do */ }
  await db.insert(opsMessages).values({ userId, fromAgentId: chiefId, toAgentId: null, toTeam: null, body: redact(line) }).catch(() => {});
}

/**
 * After a new order: every active project with nothing in progress gets planned again right now
 * (the order is in the lead's prompt). Returns the project titles it re-planned. Never throws.
 */
async function replanIdleProjects(userId: number) {
  try {
    const { projectsFor, planProjectDayFor } = await import("@/lib/services/ops-projects");
    const out: string[] = [];
    for (const p of await projectsFor(userId)) {
      if (p.status !== "active" || p.active > 0 || p.finishing) continue;
      await db.update(opsProjects).set({ lastPlannedDay: null, planStartedAt: null }).where(and(eq(opsProjects.id, p.id), eq(opsProjects.userId, userId)));
      const [fresh] = await db.select().from(opsProjects).where(eq(opsProjects.id, p.id)).limit(1);
      if (fresh && (await planProjectDayFor(userId, fresh))) out.push(`"${p.title.length > 60 ? `${p.title.slice(0, 58)}…` : p.title}"`);
    }
    return out;
  } catch { return []; }
}
