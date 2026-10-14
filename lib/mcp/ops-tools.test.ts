// @vitest-environment node
//
// Ops agents over the real MCP route: a real client, the real auth wrapper and
// tool wrapper. Only database-backed services are mocked. The point of these
// tests is the security boundary: an "agent" token can run ops_* tools and
// NOTHING else, and an agent is whoever owns the token, never who it claims to be.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/services/api-tokens", () => ({
  verifyApiToken: vi.fn(async (raw?: string) =>
    raw === "glx_full" ? { userId: 42, tokenId: 7, scope: "full" }
      : raw === "glx_nova" ? { userId: 42, tokenId: 9, scope: "agent" }
      : null),
}));
vi.mock("@/lib/services/voice", () => ({ recordToolResultFor: vi.fn(async () => {}) }));

const deleteGoalFor = vi.fn(async () => true);
const listTasksFor = vi.fn(async () => []);
vi.mock("@/lib/services/goals", () => ({
  createGoalPlanFor: vi.fn(), goalsWithProgressFor: vi.fn(async () => []), getGoalFor: vi.fn(async () => null),
  updateGoalFor: vi.fn(), deleteGoalFor: (...a: unknown[]) => deleteGoalFor(...(a as [])), rescheduleMissedStepsFor: vi.fn(),
}));
vi.mock("@/lib/services/recurring", () => ({
  listRoutinesFor: vi.fn(async () => []), createRoutineFor: vi.fn(), updateRoutineFor: vi.fn(), deleteRoutineFor: vi.fn(), ensureRoutineInstancesFor: vi.fn(),
}));
vi.mock("@/lib/services/tasks", () => ({
  listTasksFor: (...a: unknown[]) => listTasksFor(...(a as [])), createTasksFor: vi.fn(async () => []), updateTaskFor: vi.fn(), deleteTaskFor: vi.fn(),
}));
vi.mock("@/lib/services/reddit", () => ({ redditStateFor: vi.fn(), draftTodayFor: vi.fn() }));

const NOVA = { id: 3, userId: 42, tokenId: 9, name: "Nova", role: "scout", provider: "claude" };
const agentForToken = vi.fn(async (tokenId: number) => (tokenId === 9 ? NOVA : null));
const checkinForAgent = vi.fn(async () => ({ name: "Nova", role: "scout", missions: [] }));
const recordEventForAgent = vi.fn(async () => ({ warning: null as string | null }));
const claimMissionForAgent = vi.fn();
const submitDeliverableForAgent = vi.fn(async () => ({ submitted: true }));
const sendMessageForAgent = vi.fn(async () => ({ sent: true, id: 1 }));
const createMissionForAgent = vi.fn(async () => ({ id: 77, title: "Sub", for: "Scribe", budget_usd: 1 }));
const crewForAgent = vi.fn(async () => [{ name: "Quill", role: "Scribe" }]);
const partnersForAgent = vi.fn(async () => []);
const messagesForAgent = vi.fn(async () => []);
vi.mock("@/lib/services/ops", () => ({
  sendMessageForAgent: (...a: unknown[]) => sendMessageForAgent(...(a as [])),
  createMissionForAgent: (...a: unknown[]) => createMissionForAgent(...(a as [])),
  crewForAgent: (...a: unknown[]) => crewForAgent(...(a as [])),
  partnersForAgent: (...a: unknown[]) => partnersForAgent(...(a as [])),
  searchLibraryFor: vi.fn(async () => []),
  messagesForAgent: (...a: unknown[]) => messagesForAgent(...(a as [])),
  agentForToken: (...a: unknown[]) => agentForToken(...(a as [number])),
  checkinForAgent: (...a: unknown[]) => checkinForAgent(...(a as [])),
  missionsForAgent: vi.fn(async () => []),
  recordEventForAgent: (...a: unknown[]) => recordEventForAgent(...(a as [])),
  claimMissionForAgent: (...a: unknown[]) => claimMissionForAgent(...a),
  submitDeliverableForAgent: (...a: unknown[]) => submitDeliverableForAgent(...(a as [])),
}));

const route = await import("@/app/api/mcp/route");
const inProcessFetch = (async (url: string | URL, init?: RequestInit) => {
  const req = new Request(url, init);
  const fn = (route as unknown as Record<string, (r: Request) => Promise<Response>>)[req.method] ?? route.POST;
  return fn(req);
}) as typeof fetch;

async function connect(token: string) {
  const transport = new StreamableHTTPClientTransport(new URL("http://localhost/api/mcp"), {
    fetch: inProcessFetch,
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(transport);
  return client;
}

const text = (r: unknown) => ((r as { content: { text: string }[] }).content[0]?.text ?? "");
const isError = (r: unknown) => !!(r as { isError?: boolean }).isError;

describe("agent tokens", () => {
  beforeEach(() => { vi.clearAllMocks(); agentForToken.mockImplementation(async (id: number) => (id === 9 ? NOVA : null)); });

  it("can run the ops tools, identified by their token", async () => {
    const c = await connect("glx_nova");
    const r = await c.callTool({ name: "ops_checkin", arguments: {} });
    expect(isError(r)).toBe(false);
    expect(agentForToken).toHaveBeenCalledWith(9);
    expect(checkinForAgent).toHaveBeenCalledWith(NOVA);
  });

  it("are refused every other tool, and nothing underneath runs", async () => {
    const c = await connect("glx_nova");
    for (const [name, args] of [
      ["delete_goal", { goal_id: 1 }], ["get_overview", {}], ["list_tasks", {}], ["delete_task", { task_id: 1 }], ["create_routine", { title: "x", days: "daily" }],
    ] as const) {
      const r = await c.callTool({ name, arguments: args as Record<string, unknown> });
      expect(isError(r), name).toBe(true);
      expect(text(r), name).toContain("isn't available to agents");
    }
    expect(deleteGoalFor).not.toHaveBeenCalled();
    expect(listTasksFor).not.toHaveBeenCalled();
  });

  it("sanitise what they log: secrets redacted, unsafe URLs dropped", async () => {
    const c = await connect("glx_nova");
    await c.callTool({ name: "ops_log_activity", arguments: { kind: "browse", label: "Using token=abc123secret here", url: "javascript:alert(1)" } });
    const [, ev] = recordEventForAgent.mock.calls[0] as unknown as [unknown, { label: string; url: string | null }];
    expect(ev.label).not.toContain("abc123secret");
    expect(ev.url).toBeNull();
  });

  it("cannot log a fake 'status' event (that kind is for the system)", async () => {
    const c = await connect("glx_nova");
    const r = await c.callTool({ name: "ops_log_activity", arguments: { kind: "status", label: "I am the boss" } });
    expect(isError(r)).toBe(true);
    expect(recordEventForAgent).not.toHaveBeenCalled();
  });

  it("see a budget warning from the service", async () => {
    recordEventForAgent.mockResolvedValueOnce({ warning: "Over budget" });
    const c = await connect("glx_nova");
    const r = await c.callTool({ name: "ops_log_activity", arguments: { kind: "search", label: "Searching", mission_id: 5, cost_usd: 2.5 } });
    expect(text(r)).toContain("Over budget");
    expect(recordEventForAgent).toHaveBeenCalledWith(NOVA, expect.anything(), { missionId: 5, costCents: 250 });
  });

  it("get a readable error when a claim fails", async () => {
    claimMissionForAgent.mockRejectedValueOnce(new Error("That mission isn't open to you."));
    const c = await connect("glx_nova");
    const r = await c.callTool({ name: "ops_claim_mission", arguments: { mission_id: 99 } });
    expect(isError(r)).toBe(true);
    expect(text(r)).toContain("isn't open to you");
  });
});

describe("teamwork tools", () => {
  beforeEach(() => { vi.clearAllMocks(); agentForToken.mockImplementation(async (id: number) => (id === 9 ? NOVA : null)); });

  it("lists the crew and reads messages as the token's agent", async () => {
    const c = await connect("glx_nova");
    expect(text(await c.callTool({ name: "ops_list_crew", arguments: {} }))).toContain("Quill");
    await c.callTool({ name: "ops_get_messages", arguments: {} });
    expect(crewForAgent).toHaveBeenCalledWith(NOVA);
    expect(messagesForAgent).toHaveBeenCalledWith(NOVA);
  });

  it("sends messages and delegates with snake_case args mapped to the service", async () => {
    const c = await connect("glx_nova");
    await c.callTool({ name: "ops_send_message", arguments: { to: "Quill", body: "Need the brief", mission_id: 4 } });
    expect(sendMessageForAgent).toHaveBeenCalledWith(NOVA, { to: "Quill", team: undefined, body: "Need the brief", missionId: 4 });
    await c.callTool({ name: "ops_create_mission", arguments: { title: "Write the brief", role: "scribe", budget_usd: 1, parent_mission_id: 4 } });
    expect(createMissionForAgent).toHaveBeenCalledWith(NOVA, expect.objectContaining({ title: "Write the brief", role: "scribe", budgetUsd: 1, parentMissionId: 4 }));
  });

  it("rejects an unknown team or role before anything runs", async () => {
    const c = await connect("glx_nova");
    expect(isError(await c.callTool({ name: "ops_send_message", arguments: { team: "hackers", body: "x" } }))).toBe(true);
    expect(isError(await c.callTool({ name: "ops_create_mission", arguments: { title: "Do it", role: "god" } }))).toBe(true);
    expect(sendMessageForAgent).not.toHaveBeenCalled();
    expect(createMissionForAgent).not.toHaveBeenCalled();
  });

  it("a full token can't use teamwork tools either (it isn't an agent)", async () => {
    const c = await connect("glx_full");
    expect(isError(await c.callTool({ name: "ops_send_message", arguments: { to: "Quill", body: "hi" } }))).toBe(true);
    expect(sendMessageForAgent).not.toHaveBeenCalled();
  });
});

describe("non-agent tokens", () => {
  it("a full token isn't an agent, so the ops tools refuse it (no agent row for its token)", async () => {
    const c = await connect("glx_full");
    const r = await c.callTool({ name: "ops_checkin", arguments: {} });
    expect(isError(r)).toBe(true);
    expect(text(r)).toContain("isn't connected to an agent");
    expect(checkinForAgent).not.toHaveBeenCalled();
  });
});
