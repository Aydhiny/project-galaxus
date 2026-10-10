// @vitest-environment node
//
// End-to-end MCP test: a real MCP client talks to the real /api/mcp route
// handler (auth wrapper + protocol + tools) through an in-process fetch.
// Only the database-backed services are mocked.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/services/api-tokens", () => ({
  verifyApiToken: vi.fn(async (raw?: string) =>
    raw === "glx_valid" ? { userId: 42, tokenId: 7, scope: "full" }
      : raw === "glx_voice" ? { userId: 42, tokenId: 8, scope: "voice" }
      : null),
}));

const recordToolResultFor = vi.fn(async () => {});
vi.mock("@/lib/services/voice", () => ({ recordToolResultFor: (...a: unknown[]) => recordToolResultFor(...(a as [])) }));

const createGoalPlanFor = vi.fn();
const listTasksFor = vi.fn();
const deleteGoalFor = vi.fn(async () => true);
vi.mock("@/lib/services/goals", () => ({
  createGoalPlanFor: (...a: unknown[]) => createGoalPlanFor(...a),
  goalsWithProgressFor: vi.fn(async () => []),
  getGoalFor: vi.fn(async () => null),
  updateGoalFor: vi.fn(),
  deleteGoalFor: (...a: unknown[]) => deleteGoalFor(...(a as [])),
}));
const createRoutineFor = vi.fn();
const ensureRoutineInstancesFor = vi.fn(async (...args: unknown[]) => ({ created: 1, archived: 0, args }));
vi.mock("@/lib/services/recurring", () => ({
  listRoutinesFor: vi.fn(async () => []),
  createRoutineFor: (...a: unknown[]) => createRoutineFor(...a),
  updateRoutineFor: vi.fn(),
  deleteRoutineFor: vi.fn(),
  ensureRoutineInstancesFor: (...a: unknown[]) => ensureRoutineInstancesFor(...a),
}));
vi.mock("@/lib/services/tasks", () => ({
  listTasksFor: (...a: unknown[]) => listTasksFor(...a),
  createTasksFor: vi.fn(async () => []),
  updateTaskFor: vi.fn(),
  deleteTaskFor: vi.fn(),
}));

const route = await import("@/app/api/mcp/route");
const handler = route.POST as (req: Request) => Promise<Response>;

/** fetch that routes every request into the route handler (GET/POST/DELETE). */
const inProcessFetch = (async (url: string | URL, init?: RequestInit) => {
  const req = new Request(url, init);
  const fn = (route as unknown as Record<string, (r: Request) => Promise<Response>>)[req.method] ?? handler;
  return fn(req);
}) as typeof fetch;

async function connect(token?: string) {
  const transport = new StreamableHTTPClientTransport(new URL("http://localhost/api/mcp"), {
    fetch: inProcessFetch,
    requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(transport);
  return client;
}

describe("MCP endpoint", () => {
  beforeEach(() => {
    createGoalPlanFor.mockReset();
    listTasksFor.mockReset();
  });

  it("rejects requests without a valid token (401)", async () => {
    const res = await handler(new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toMatch(/Bearer/i);

    await expect(connect("glx_wrong")).rejects.toThrow();
  });

  it("lists the Galaxus tools and the planning prompt", async () => {
    const client = await connect("glx_valid");
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "add_tasks", "complete_task", "create_goal_plan", "create_routine", "delete_goal", "delete_routine", "delete_task",
      "get_goal", "get_overview", "list_goals", "list_routines", "list_tasks", "update_goal", "update_routine", "update_task",
    ]);
    const plan = tools.find((t) => t.name === "create_goal_plan")!;
    expect(JSON.stringify(plan.inputSchema)).toContain("phases");
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toContain("plan_monthly_goal");
    await client.close();
  });

  it("creates a goal plan for the token's user", async () => {
    createGoalPlanFor.mockResolvedValue({
      goal: { id: 5, title: "Learn a handstand", month: "2026-10", emoji: "🤸" },
      tasks: [
        { id: 1, title: "Wrist prep + 3×20s plank", dueDate: "2026-10-01", phase: "Week 1 · Foundations", status: "todo", orderIndex: 1 },
        { id: 2, title: "Wall walk 3×", dueDate: "2026-10-08", phase: "Week 2 · Wall", status: "todo", orderIndex: 2 },
      ],
    });
    const client = await connect("glx_valid");
    const result = await client.callTool({
      name: "create_goal_plan",
      arguments: {
        goal: { title: "Learn a handstand", month: "2026-10", emoji: "🤸" },
        phases: [
          { name: "Week 1 · Foundations", tasks: [{ title: "Wrist prep + 3×20s plank", day: 1 }] },
          { name: "Week 2 · Wall", tasks: [{ title: "Wall walk 3×", day: 8 }] },
        ],
      },
    });
    expect(result.isError).toBeFalsy();
    // The user comes from the verified token, never from tool arguments.
    expect(createGoalPlanFor).toHaveBeenCalledWith(42, expect.objectContaining({ goal: expect.objectContaining({ title: "Learn a handstand" }) }));
    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(JSON.parse(text)).toMatchObject({ goal: { id: 5 }, created_tasks: 2 });
    await client.close();
  });

  it("validates tool input before touching services", async () => {
    const client = await connect("glx_valid");
    const result = await client.callTool({ name: "list_tasks", arguments: { from: "not-a-date" } });
    expect(result.isError).toBe(true);
    expect(listTasksFor).not.toHaveBeenCalled();
    await client.close();
  });

  it("creates routines from friendly day names and materialises today", async () => {
    createRoutineFor.mockResolvedValue({ id: 3, title: "Workout", days: "1101011", time: "18:00", priority: "none", area: "training", active: true });
    const client = await connect("glx_valid");
    const result = await client.callTool({
      name: "create_routine",
      arguments: { title: "Workout", days: ["mon", "tue", "thu", "sat", "sun"], time: "18:00", area: "training", today: "2026-10-09" },
    });
    expect(result.isError).toBeFalsy();
    expect(createRoutineFor).toHaveBeenCalledWith(42, expect.objectContaining({ title: "Workout", days: "1101011", area: "training" }));
    expect(ensureRoutineInstancesFor).toHaveBeenCalledWith(42, "2026-10-09");
    await client.close();
  });
});

describe("voice-scoped tokens", () => {
  it("can't delete goals — refused by the server, not just by the client", async () => {
    deleteGoalFor.mockClear();
    const client = await connect("glx_voice");
    const res = await client.callTool({ name: "delete_goal", arguments: { goal_id: 1 } });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toMatch(/isn't available to voice commands/);
    expect(deleteGoalFor).not.toHaveBeenCalled();
  });

  it("records what a voice call changed; full tokens aren't recorded", async () => {
    recordToolResultFor.mockClear();
    createRoutineFor.mockResolvedValue({ id: 5, title: "Read", days: "1111111", time: "22:00", priority: "none", area: null, active: true });
    const voice = await connect("glx_voice");
    await voice.callTool({ name: "create_routine", arguments: { title: "Read", days: "daily", time: "22:00" } });
    expect(recordToolResultFor).toHaveBeenCalledWith(42, "create_routine", expect.stringContaining('"title": "Read"'));

    recordToolResultFor.mockClear();
    const full = await connect("glx_valid");
    await full.callTool({ name: "create_routine", arguments: { title: "Read", days: "daily", time: "22:00" } });
    expect(recordToolResultFor).not.toHaveBeenCalled();
  });
});
