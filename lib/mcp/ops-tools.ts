// MCP tools for Ops agents. Registered through the same wrapper as the rest
// (lib/mcp/tools.ts), which refuses any other tool to an "agent" token.
//
// Who is calling is decided by the API token (ctx.http.authInfo.extra.tokenId),
// never by anything the agent types, so agents can't impersonate each other.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { EFFORTS, LOGGABLE_KINDS, MISSION_KINDS, ROLE_KEYS, TEAM_KEYS, redact, safeUrl, type EventKind } from "@/lib/ops";
import {
  agentForToken, checkinForAgent, claimMissionForAgent, createMissionForAgent, crewForAgent, messagesForAgent, missionsForAgent,
  partnersForAgent, recordEventForAgent, searchLibraryFor, sendMessageForAgent, submitDeliverableForAgent,
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
      description: "Finish a mission you claimed. `markdown` is the result the user will read: lead with the answer, keep it scannable, link sources. If you opened a GitHub pull request, pass pr_url so its status shows on the mission.",
      inputSchema: z.object({
        mission_id: z.number().int(),
        title: z.string().max(200).optional(),
        markdown: z.string().min(10).max(20000),
        cost_usd: z.number().min(0).max(10000).optional().describe("Money spent since your last log"),
        pr_url: z.string().max(300).optional().describe("https://github.com/owner/repo/pull/123"),
      }),
    },
    async (a: { mission_id: number; title?: string; markdown: string; cost_usd?: number; pr_url?: string }, ctx: Ctx) => {
      try {
        return ok(await submitDeliverableForAgent(await me(ctx), { missionId: a.mission_id, title: a.title, markdown: a.markdown, costCents: toCents(a.cost_usd), prUrl: a.pr_url }));
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "ops_list_crew",
    {
      title: "See your crew",
      description: "The other agents in your facility (name, role, team, what they're doing, which mission) and linked facilities — other people's agents you may radio with ops_send_message(facility=...). Use it before delegating or messaging.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async (_args: unknown, ctx: Ctx) => {
      try {
        const agent = await me(ctx);
        const [crew, partners] = await Promise.all([crewForAgent(agent), partnersForAgent(agent)]);
        return ok({ crew, linked_facilities: partners });
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "ops_send_message",
    {
      title: "Radio a teammate",
      description:
        "Send a short message to another agent (by name), a whole team, or everyone. Use it to ask for help, hand over context or report a blocker. " +
        "Pass `facility` to radio a LINKED facility (another person's agents, see ops_list_crew); never send them secrets or your user's private data. The user can read every message.",
      inputSchema: z.object({
        to: z.string().max(40).optional().describe("Agent name (from ops_list_crew)"),
        team: z.enum(TEAM_KEYS).optional().describe("Or a whole team"),
        facility: z.string().max(40).optional().describe("A linked facility's name, to message another person's agents"),
        body: z.string().min(1).max(2000),
        mission_id: z.number().int().optional().describe("The mission this is about"),
      }),
    },
    async (a: { to?: string; team?: string; facility?: string; body: string; mission_id?: number }, ctx: Ctx) => {
      try { return ok(await sendMessageForAgent(await me(ctx), { to: a.to, team: a.team, facility: a.facility, body: a.body, missionId: a.mission_id })); } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "ops_search_library",
    {
      title: "Search past work",
      description: "Search deliverables the user already accepted (research, docs, lists). Call it before starting research so you reuse what exists instead of redoing it.",
      inputSchema: z.object({ query: z.string().min(2).max(200) }),
      annotations: { readOnlyHint: true },
    },
    async ({ query }: { query: string }, ctx: Ctx) => {
      try { const agent = await me(ctx); return ok(await searchLibraryFor(agent.userId, query)); } catch (e) { return fail(e); }
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
        project_id: z.number().int().optional().describe("A project (ops_get_project) this mission belongs to"),
        due_in_days: z.number().int().min(0).max(60).optional().describe("Deadline: 0 = today"),
        effort: z.enum(EFFORTS).optional().describe("quick (cheapest) | normal | deep — how much a cloud agent may spend"),
      }),
    },
    async (a: { title: string; brief?: string; kind?: string; role?: string; to?: string; budget_usd?: number; parent_mission_id?: number; project_id?: number; due_in_days?: number; effort?: string }, ctx: Ctx) => {
      try {
        return ok(await createMissionForAgent(await me(ctx), {
          title: a.title, brief: a.brief, kind: a.kind, role: a.role, to: a.to, budgetUsd: a.budget_usd, parentMissionId: a.parent_mission_id,
          projectId: a.project_id, dueInDays: a.due_in_days, effort: a.effort,
        }));
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "ops_ask_user",
    {
      title: "Ask the user",
      description:
        "Only when you are truly blocked: decide yourself wherever a reasonable choice exists (note the assumption in your deliverable). " +
        "Usually the Chief answers for the user within moments; spending, contacting real people, legal or account matters go to the user. " +
        "Give 2-4 short options (the first = your recommendation). blocking=true pauses that mission until answered. The answer arrives in ops_get_messages.",
      inputSchema: z.object({
        question: z.string().min(5).max(600),
        options: z.array(z.string().max(60)).max(4).optional(),
        mission_id: z.number().int().optional(),
        blocking: z.boolean().optional(),
        urgent: z.boolean().optional().describe("Only if it can't wait: it may wake their phone"),
      }),
    },
    async (a: { question: string; options?: string[]; mission_id?: number; blocking?: boolean; urgent?: boolean }, ctx: Ctx) => {
      try {
        const { askUserForAgent } = await import("@/lib/services/ops-inbox");
        return ok(await askUserForAgent(await me(ctx), { question: a.question, options: a.options, missionId: a.mission_id, blocking: a.blocking, urgent: a.urgent }));
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "ops_notify_user",
    {
      title: "Tell the user something",
      description: "A short heads-up to your user (a finding, progress, a risk). It lands in their inbox; their notification settings decide if it buzzes their phone. Don't repeat what your deliverable will say.",
      inputSchema: z.object({ text: z.string().min(3).max(600), mission_id: z.number().int().optional(), urgent: z.boolean().optional() }),
    },
    async (a: { text: string; mission_id?: number; urgent?: boolean }, ctx: Ctx) => {
      try {
        const { notifyUserForAgent } = await import("@/lib/services/ops-inbox");
        return ok(await notifyUserForAgent(await me(ctx), { text: a.text, missionId: a.mission_id, urgent: a.urgent }));
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "ops_get_project",
    {
      title: "See the projects",
      description: "Active projects: goal, deadline, day N of M, the lead's plan, results so far, what's late, and the user's answers. Call it before planning or working on a project mission.",
      inputSchema: z.object({ project_id: z.number().int().optional() }),
      annotations: { readOnlyHint: true },
    },
    async (a: { project_id?: number }, ctx: Ctx) => {
      try {
        const agent = await me(ctx);
        const { projectBriefsFor } = await import("@/lib/services/ops-projects");
        return ok(await projectBriefsFor(agent.userId, a.project_id));
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "ops_request_partner",
    {
      title: "Ask a linked facility to do a mission",
      description: "Ask a linked facility (another person's crew, see ops_list_crew) to take a mission. It only runs if its owner accepts, on their own plan; the result comes back to your board. Use it to share work, never to pass on private data.",
      inputSchema: z.object({ facility: z.string().max(40), title: z.string().min(3).max(200), brief: z.string().max(4000).optional() }),
    },
    async (a: { facility: string; title: string; brief?: string }, ctx: Ctx) => {
      try {
        const { requestWorkForAgent } = await import("@/lib/services/ops-links");
        return ok(await requestWorkForAgent(await me(ctx), a));
      } catch (e) { return fail(e); }
    }
  );

  // Outreach bridge: a lead sheet → Outreach leads (nothing is sent; the user presses send in Outreach).
  server.registerTool(
    "ops_send_to_outreach",
    {
      title: "Add a lead sheet to Outreach",
      description:
        "Add the businesses in a mission's result table (or a whole project's merged sheet) to the user's Outreach leads, deduplicated against the ones already there. " +
        "The table needs a Name column plus Phone, Website or Address (the reach_businesses table works as is). Nothing is sent: Outreach only prepares messages. Returns {added, skipped}.",
      inputSchema: z.object({
        mission_id: z.number().int().optional().describe("A mission whose result has the table"),
        project_id: z.number().int().optional().describe("Or a project: every table its missions delivered"),
      }),
    },
    async (a: { mission_id?: number; project_id?: number }, ctx: Ctx) => {
      try {
        if (!a.mission_id && !a.project_id) throw new Error("Pass mission_id or project_id.");
        const agent = await me(ctx);
        const { sendToOutreachFor } = await import("@/lib/services/outreach-bridge");
        return ok(await sendToOutreachFor(agent.userId, a.project_id ? { projectId: a.project_id } : { missionId: a.mission_id }));
      } catch (e) { return fail(e); }
    }
  );
}
