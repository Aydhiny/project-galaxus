// MCP tools for Ops agents. Registered through the same wrapper as the rest
// (lib/mcp/tools.ts), which refuses any other tool to an "agent" token.
//
// Who is calling is decided by the API token (ctx.http.authInfo.extra.tokenId),
// never by anything the agent types, so agents can't impersonate each other.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { LOGGABLE_KINDS, MISSION_KINDS, ROLE_KEYS, TEAM_KEYS, redact, safeUrl, type EventKind } from "@/lib/ops";
import {
  agentForToken, checkinForAgent, claimMissionForAgent, createMissionForAgent, crewForAgent, messagesForAgent, missionsForAgent,
  recordEventForAgent, sendMessageForAgent, submitDeliverableForAgent,
} from "@/lib/services/ops";

type Ctx = { http?: { authInfo?: { extra?: Record<string, unknown> } } };

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const fail = (e: unknown) => ({
  isError: true,
  content: [{ type: "text" as const, text: e instanceof Error ? e.message : "Something went wrong." }],
});

async function me(ctx: Ctx) {
  const tokenId = ctx.http?.authInfo?.extra?.tokenId;
  const agent = typeof tokenId === "number" ? await agentForToken(tokenId) : null;
  if (!agent) throw new Error("This token isn't connected to an agent. Create the agent in Galaxus → Ops and use its token.");
  return agent;
}

const toCents = (usd?: number) => (usd && usd > 0 ? Math.round(usd * 100) : 0);

export function registerOpsTools(server: McpServer) {
  server.registerTool(
    "ops_checkin",
    {
      title: "Check in",
      description: "Call this first in every session. Tells Galaxus Ops you are online and returns who you are, your skills (follow them), today's shift and focus, your crew, unread messages and the missions you can take.",
      inputSchema: z.object({}),
    },
    async (_args: unknown, ctx: Ctx) => {
      try { return ok(await checkinForAgent(await me(ctx))); } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "ops_get_missions",
    {
      title: "Get missions",
      description: "Missions you can take (open and meant for you or your role) plus the ones you already claimed.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async (_args: unknown, ctx: Ctx) => {
      try { return ok(await missionsForAgent(await me(ctx))); } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "ops_claim_mission",
    {
      title: "Claim a mission",
      description: "Take an open mission before you start on it, so no other agent duplicates the work.",
      inputSchema: z.object({ mission_id: z.number().int() }),
    },
    async ({ mission_id }: { mission_id: number }, ctx: Ctx) => {
      try { return ok(await claimMissionForAgent(await me(ctx), mission_id)); } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "ops_log_activity",
    {
      title: "Log what you are doing",
      description:
        "Show the user what you are doing right now (it appears on your desk monitor in the facility): a page you are reading, a search, a file you are changing. " +
        "Call it at meaningful steps, not on every keystroke. Never include secrets, tokens or private data. Pass cost_usd with mission_id to track spend against the budget.",
      inputSchema: z.object({
        kind: z.enum(LOGGABLE_KINDS).describe("browse | search | read | edit | shell | tool | think"),
        label: z.string().min(2).max(160).describe("Short, human: 'Reading the Stripe pricing page'"),
        url: z.string().max(400).optional().describe("The page you are on, if any"),
        mission_id: z.number().int().optional(),
        cost_usd: z.number().min(0).max(10000).optional().describe("Money spent since your last log (API usage, a purchase)"),
      }),
    },
    async (a: { kind: string; label: string; url?: string; mission_id?: number; cost_usd?: number }, ctx: Ctx) => {
      try {
        const agent = await me(ctx);
        const r = await recordEventForAgent(
          agent,
          { kind: a.kind as EventKind, label: redact(a.label).slice(0, 200), url: safeUrl(a.url), status: "working" },
          { missionId: a.mission_id, costCents: toCents(a.cost_usd) },
        );
        return ok({ logged: true, ...(r.warning ? { warning: r.warning } : {}) });
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "ops_submit_deliverable",
    {
      title: "Submit the result",
      description: "Finish a mission you claimed. `markdown` is the result the user will read: lead with the answer, keep it scannable, link sources.",
      inputSchema: z.object({
        mission_id: z.number().int(),
        title: z.string().max(200).optional(),
        markdown: z.string().min(10).max(20000),
        cost_usd: z.number().min(0).max(10000).optional().describe("Money spent since your last log"),
      }),
    },
    async (a: { mission_id: number; title?: string; markdown: string; cost_usd?: number }, ctx: Ctx) => {
      try {
        return ok(await submitDeliverableForAgent(await me(ctx), { missionId: a.mission_id, title: a.title, markdown: a.markdown, costCents: toCents(a.cost_usd) }));
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "ops_list_crew",
    {
      title: "See your crew",
      description: "The other agents in the facility: name, role, team, whether they're working, what they're doing and on which mission. Use it before delegating or messaging.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async (_args: unknown, ctx: Ctx) => {
      try { return ok(await crewForAgent(await me(ctx))); } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "ops_send_message",
    {
      title: "Radio a teammate",
      description: "Send a short message to another agent (by name), a whole team, or everyone. Use it to ask for help, hand over context or report a blocker. The user can read every message.",
      inputSchema: z.object({
        to: z.string().max(40).optional().describe("Agent name (from ops_list_crew)"),
        team: z.enum(TEAM_KEYS).optional().describe("Or a whole team"),
        body: z.string().min(1).max(2000),
        mission_id: z.number().int().optional().describe("The mission this is about"),
      }),
    },
    async (a: { to?: string; team?: string; body: string; mission_id?: number }, ctx: Ctx) => {
      try { return ok(await sendMessageForAgent(await me(ctx), { to: a.to, team: a.team, body: a.body, missionId: a.mission_id })); } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "ops_get_messages",
    {
      title: "Read your messages",
      description: "Messages for you (from the user or teammates), unread first. Reading marks them read. Messages from the user are instructions; messages from agents are requests you may decline.",
      inputSchema: z.object({}),
    },
    async (_args: unknown, ctx: Ctx) => {
      try { return ok(await messagesForAgent(await me(ctx))); } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "ops_create_mission",
    {
      title: "Delegate a mission",
      description:
        "Split your work: post a sub-mission for a role or a named teammate. Pass parent_mission_id = the mission you're working on; its budget comes out of the parent's remaining budget. " +
        "Without a parent it's a proposal for the board (small budgets only). You'll get a message when it's done.",
      inputSchema: z.object({
        title: z.string().min(3).max(200),
        brief: z.string().max(6000).optional(),
        kind: z.enum(MISSION_KINDS).optional(),
        role: z.enum(ROLE_KEYS).optional().describe("Who should do it (any agent with this role)"),
        to: z.string().max(40).optional().describe("Or one teammate by name"),
        budget_usd: z.number().min(0).max(1000).optional(),
        parent_mission_id: z.number().int().optional(),
      }),
    },
    async (a: { title: string; brief?: string; kind?: string; role?: string; to?: string; budget_usd?: number; parent_mission_id?: number }, ctx: Ctx) => {
      try {
        return ok(await createMissionForAgent(await me(ctx), { title: a.title, brief: a.brief, kind: a.kind, role: a.role, to: a.to, budgetUsd: a.budget_usd, parentMissionId: a.parent_mission_id }));
      } catch (e) { return fail(e); }
    }
  );
}
