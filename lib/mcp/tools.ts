// Galaxus MCP tools — what an AI assistant (Claude, Cursor, …) can do with
// your tasks and monthly goals. Registered on the HTTP endpoint in
// app/api/mcp/route.ts; kept separate so tests can drive them in-process.
//
// Every tool resolves the user from the verified API token (ctx.http.authInfo)
// and calls the same services the web app uses — one set of rules for both.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import * as goalsSvc from "@/lib/services/goals";
import * as tasksSvc from "@/lib/services/tasks";
import * as routinesSvc from "@/lib/services/recurring";
import { AREAS } from "@/lib/areas";
import { describeDays, isPastRoutine } from "@/lib/tasks";
import { goalPace, goalProgress, groupByPhase, monthKey, monthLabel, PACE_LABEL } from "@/lib/goals";
import type { Task } from "@/lib/db/schema";

type Ctx = { http?: { authInfo?: { extra?: Record<string, unknown> } } };

/** Hook for the route to refresh the web UI after writes (revalidatePath). */
export interface McpHooks {
  onWrite?: () => void;
  /** "Today" as the server sees it (UTC). Tools accept the user's own date too. */
  today?: () => string;
}

function userIdOf(ctx: Ctx): number {
  const id = ctx.http?.authInfo?.extra?.userId;
  if (typeof id !== "number") throw new Error("Not authenticated.");
  return id;
}

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const fail = (e: unknown) => ({
  isError: true,
  content: [{ type: "text" as const, text: e instanceof Error ? e.message : "Something went wrong." }],
});

/** Compact task shape for AI consumption (no internal bookkeeping columns). */
function slimTask(t: Task) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    due_date: t.dueDate,
    due_time: t.dueTime,
    goal_id: t.goalId,
    phase: t.phase,
    area: t.area,
    notes: t.notes,
    attachments: t.attachments,
  };
}

const priority = z.enum(["none", "low", "medium", "high"]);
const area = z.enum(AREAS).describe("Area of life: training, faith, reading, youtube, mind, sleep, study");
const attachment = z.object({
  type: z.enum(["link", "image"]).default("link"),
  url: z.string().url().max(2000),
  title: z.string().max(120).optional().describe("Short label, e.g. 'Wall walk tutorial'"),
});
const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const days = z
  .union([z.enum(["daily", "weekdays", "weekends"]), z.array(z.enum(WEEKDAY_KEYS)).min(1).max(7)])
  .describe('"daily", "weekdays", "weekends", or a list like ["mon","wed","fri"]');

/** Friendly days → the 7-char Monday-first mask stored in the DB. */
function daysMask(d: z.infer<typeof days>): string {
  if (d === "daily") return "1111111";
  if (d === "weekdays") return "1111100";
  if (d === "weekends") return "0000011";
  return WEEKDAY_KEYS.map((k) => (d.includes(k) ? "1" : "0")).join("");
}

function slimRoutine(r: { id: number; title: string; days: string; time: string | null; priority: string; area: string | null; active: boolean }) {
  return { id: r.id, title: r.title, days: describeDays(r.days), time: r.time, priority: r.priority, area: r.area, active: r.active };
}
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).describe('Calendar month, "YYYY-MM"');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('"YYYY-MM-DD"');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).describe('24h "HH:MM"');

const planTask = z.object({
  title: z.string().min(1).max(60).describe("SHORT title (2–5 words) — e.g. 'Wall walk-ups'. Put details in notes."),
  day: z.number().int().min(1).max(31).optional().describe("Day of the goal's month. Omit to auto-spread tasks evenly."),
  date: date.optional().describe("Exact date (overrides day)."),
  notes: z.string().max(2000).optional().describe("How-to cues, form tips, success criteria."),
  priority: priority.optional(),
  time: time.optional(),
  area: area.optional().describe("Defaults to the goal's area"),
  attachments: z.array(attachment).max(12).optional().describe("Helpful links (videos, docs) or images"),
});

const goalShape = z.object({
  title: z.string().min(1).max(200),
  month,
  emoji: z.string().max(16).optional(),
  description: z.string().max(5000).optional().describe("Why it matters + what 'done' looks like."),
  area: area.optional(),
});

export function registerGalaxusTools(server: McpServer, hooks: McpHooks = {}) {
  const written = () => hooks.onWrite?.();
  const today = (given?: string) => given ?? hooks.today?.() ?? new Date().toISOString().slice(0, 10);

  server.registerTool(
    "get_overview",
    {
      title: "Overview",
      description:
        "Start here. Returns today's date context, this month's goals with progress/pace, and open tasks due today or overdue. Pass `today` (the user's local date) when you know it.",
      inputSchema: z.object({ today: date.optional() }),
      annotations: { readOnlyHint: true },
    },
    async ({ today: given }, ctx) => {
      try {
        const userId = userIdOf(ctx);
        const t = today(given);
        const m = t.slice(0, 7);
        const goals = await goalsSvc.goalsWithProgressFor(userId, { month: m });
        const open = await tasksSvc.listTasksFor(userId, { to: t, includeDone: false });
        return ok({
          today: t,
          month: m,
          month_label: monthLabel(m),
          goals: goals.map((g) => ({
            id: g.id, title: g.title, emoji: g.emoji, status: g.status,
            progress: g.progress, pace: PACE_LABEL[goalPace(g.month, t, g.progress, g.tasks)],
          })),
          // Missed routine copies aren't overdue — the routine comes back tomorrow.
          due_today_or_overdue: open.filter((x) => x.dueDate && !isPastRoutine(x, t)).map(slimTask),
        });
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "list_goals",
    {
      title: "List monthly goals",
      description: "List monthly goals with plan progress. Filter by month (YYYY-MM) and/or status.",
      inputSchema: z.object({ month: month.optional(), status: z.enum(["active", "achieved", "abandoned"]).optional() }),
      annotations: { readOnlyHint: true },
    },
    async ({ month: m, status }, ctx) => {
      try {
        const goals = await goalsSvc.goalsWithProgressFor(userIdOf(ctx), { month: m, status });
        return ok(goals.map((g) => ({ id: g.id, title: g.title, emoji: g.emoji, month: g.month, status: g.status, description: g.description, progress: g.progress })));
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "get_goal",
    {
      title: "Get a goal and its plan",
      description: "A goal with its tasks grouped by phase, progress, and pace versus the calendar.",
      inputSchema: z.object({ goal_id: z.number().int(), today: date.optional() }),
      annotations: { readOnlyHint: true },
    },
    async ({ goal_id, today: given }, ctx) => {
      try {
        const userId = userIdOf(ctx);
        const goal = await goalsSvc.getGoalFor(userId, goal_id);
        if (!goal) return fail(new Error("Goal not found."));
        const tasks = await tasksSvc.listTasksFor(userId, { goalId: goal_id });
        const progress = goalProgress(tasks);
        return ok({
          ...goal,
          progress,
          pace: PACE_LABEL[goalPace(goal.month, today(given), progress, tasks)],
          phases: groupByPhase(tasks).map((p) => ({ phase: p.phase ?? "Other", tasks: p.tasks.map(slimTask) })),
        });
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "create_goal_plan",
    {
      title: "Create a monthly goal with a full plan",
      description: [
        "Create a monthly goal AND its step-by-step task plan in one call (or extend an existing goal via goal_id).",
        "Design the plan as a progression from the user's current level to the goal: 3–5 phases (e.g. 'Week 1 · Foundations'),",
        "each with specific, measurable tasks (sets/reps/minutes, success criteria in notes). Include rest/deload days where",
        "relevant and a final test task. Give tasks a `day` for a deliberate schedule, or omit to spread them evenly over the month.",
        "Ask the user about their starting level and available time before calling if you don't know them.",
      ].join(" "),
      inputSchema: z.object({
        goal: goalShape.optional().describe("New goal to create. Provide this OR goal_id."),
        goal_id: z.number().int().optional().describe("Existing goal to add these phases/tasks to."),
        phases: z.array(z.object({ name: z.string().min(1).max(100), tasks: z.array(planTask).min(1).max(40) })).min(1).max(12),
      }),
    },
    async ({ goal, goal_id, phases }, ctx) => {
      try {
        const userId = userIdOf(ctx);
        if (!goal && !goal_id) return fail(new Error("Provide either `goal` or `goal_id`."));
        const result = goal_id
          ? await goalsSvc.createGoalPlanFor(userId, { goalId: goal_id, phases })
          : await goalsSvc.createGoalPlanFor(userId, { goal: goal!, phases });
        written();
        return ok({
          goal: { id: result.goal.id, title: result.goal.title, month: result.goal.month, emoji: result.goal.emoji },
          created_tasks: result.tasks.length,
          phases: groupByPhase(result.tasks).map((p) => ({
            phase: p.phase, tasks: p.tasks.map((t) => ({ id: t.id, title: t.title, due_date: t.dueDate })),
          })),
          view_in_app: "/tasks",
        });
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "update_goal",
    {
      title: "Update a goal",
      description: "Rename, re-describe, move to another month, or mark achieved/abandoned.",
      inputSchema: z.object({
        goal_id: z.number().int(),
        title: z.string().min(1).max(200).optional(),
        emoji: z.string().max(16).optional(),
        description: z.string().max(5000).optional(),
        month: month.optional(),
        status: z.enum(["active", "achieved", "abandoned"]).optional(),
      }),
      annotations: { idempotentHint: true },
    },
    async ({ goal_id, ...patch }, ctx) => {
      try {
        const row = await goalsSvc.updateGoalFor(userIdOf(ctx), goal_id, patch);
        if (!row) return fail(new Error("Goal not found."));
        written();
        return ok(row);
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "delete_goal",
    {
      title: "Delete a goal",
      description: "Delete a goal. Its tasks are kept (unlinked) unless delete_tasks is true. Confirm with the user first.",
      inputSchema: z.object({ goal_id: z.number().int(), delete_tasks: z.boolean().optional() }),
      annotations: { destructiveHint: true },
    },
    async ({ goal_id, delete_tasks }, ctx) => {
      try {
        const done = await goalsSvc.deleteGoalFor(userIdOf(ctx), goal_id, !!delete_tasks);
        if (!done) return fail(new Error("Goal not found."));
        written();
        return ok({ deleted: goal_id, tasks_deleted: !!delete_tasks });
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "list_tasks",
    {
      title: "List tasks",
      description: "List tasks, optionally filtered by goal, due-date range, and whether to include completed ones.",
      inputSchema: z.object({
        goal_id: z.number().int().optional(),
        from: date.optional(),
        to: date.optional(),
        include_done: z.boolean().optional().describe("Default true."),
        area: area.optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ goal_id, from, to, include_done, area: a }, ctx) => {
      try {
        const rows = await tasksSvc.listTasksFor(userIdOf(ctx), { goalId: goal_id, from, to, includeDone: include_done ?? true, area: a });
        return ok(rows.slice(0, 300).map(slimTask));
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "add_tasks",
    {
      title: "Add tasks",
      description: "Add one or more tasks (optionally linked to a goal and phase).",
      inputSchema: z.object({
        tasks: z.array(z.object({
          title: z.string().min(1).max(60).describe("SHORT title (2–5 words); details go in notes"),
          due_date: date.optional(),
          due_time: time.optional(),
          priority: priority.optional(),
          notes: z.string().max(2000).optional(),
          goal_id: z.number().int().optional(),
          phase: z.string().max(100).optional(),
          area: area.optional(),
          attachments: z.array(attachment).max(12).optional(),
        })).min(1).max(50),
      }),
    },
    async ({ tasks }, ctx) => {
      try {
        const rows = await tasksSvc.createTasksFor(userIdOf(ctx), tasks.map((t) => ({
          title: t.title, dueDate: t.due_date, dueTime: t.due_time, priority: t.priority,
          notes: t.notes, goalId: t.goal_id, phase: t.phase, area: t.area, attachments: t.attachments,
        })));
        written();
        return ok(rows.map(slimTask));
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "update_task",
    {
      title: "Update a task",
      description: "Edit a task: title, notes, due date/time, priority, status, goal or phase. Pass null to clear a field.",
      inputSchema: z.object({
        task_id: z.number().int(),
        title: z.string().min(1).max(500).optional(),
        notes: z.string().max(2000).nullable().optional(),
        due_date: date.nullable().optional(),
        due_time: time.nullable().optional(),
        priority: priority.optional(),
        status: z.enum(["todo", "doing", "done"]).optional(),
        goal_id: z.number().int().nullable().optional(),
        phase: z.string().max(100).nullable().optional(),
        area: area.nullable().optional(),
        attachments: z.array(attachment).max(12).optional().describe("REPLACES the task's attachments"),
      }),
      annotations: { idempotentHint: true },
    },
    async ({ task_id, due_date, due_time, goal_id, ...rest }, ctx) => {
      try {
        const row = await tasksSvc.updateTaskFor(userIdOf(ctx), task_id, {
          ...rest,
          ...(due_date !== undefined ? { dueDate: due_date } : {}),
          ...(due_time !== undefined ? { dueTime: due_time } : {}),
          ...(goal_id !== undefined ? { goalId: goal_id } : {}),
        });
        if (!row) return fail(new Error("Task not found."));
        written();
        return ok(slimTask(row));
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "complete_task",
    {
      title: "Complete a task",
      description: "Mark a task done (or not done with done=false).",
      inputSchema: z.object({ task_id: z.number().int(), done: z.boolean().optional() }),
      annotations: { idempotentHint: true },
    },
    async ({ task_id, done }, ctx) => {
      try {
        const row = await tasksSvc.updateTaskFor(userIdOf(ctx), task_id, { status: done === false ? "todo" : "done" });
        if (!row) return fail(new Error("Task not found."));
        written();
        return ok(slimTask(row));
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "delete_task",
    {
      title: "Remove a task",
      description: "Remove a task. It's kept in history and the user may be asked tomorrow whether to bring it back.",
      inputSchema: z.object({ task_id: z.number().int() }),
      annotations: { destructiveHint: true },
    },
    async ({ task_id }, ctx) => {
      try {
        const done = await tasksSvc.deleteTaskFor(userIdOf(ctx), task_id);
        if (!done) return fail(new Error("Task not found."));
        written();
        return ok({ removed: task_id });
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "list_routines",
    {
      title: "List routines",
      description: "Recurring daily/weekly tasks (workout, prayer, reading…). Each active routine creates a task on its days.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async (_args, ctx) => {
      try {
        return ok((await routinesSvc.listRoutinesFor(userIdOf(ctx))).map(slimRoutine));
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "create_routine",
    {
      title: "Create a routine",
      description: "Create a recurring task (e.g. 'Read 10 pages' daily at 21:00). Pass `today` (user's local date) to create today's instance right away.",
      inputSchema: z.object({
        title: z.string().min(1).max(60).describe("SHORT title, e.g. 'Read 10 pages'"),
        days,
        time: time.optional(),
        priority: priority.optional(),
        area: area.optional(),
        today: date.optional(),
      }),
    },
    async ({ days: d, today: t, ...rest }, ctx) => {
      try {
        const userId = userIdOf(ctx);
        const row = await routinesSvc.createRoutineFor(userId, { ...rest, days: daysMask(d) });
        if (t) await routinesSvc.ensureRoutineInstancesFor(userId, t);
        written();
        return ok(slimRoutine(row));
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "update_routine",
    {
      title: "Update a routine",
      description: "Change a routine's title, days, time, priority or area, or pause/resume it (active).",
      inputSchema: z.object({
        routine_id: z.number().int(),
        title: z.string().min(1).max(60).optional(),
        days: days.optional(),
        time: time.nullable().optional(),
        priority: priority.optional(),
        area: area.nullable().optional(),
        active: z.boolean().optional(),
      }),
      annotations: { idempotentHint: true },
    },
    async ({ routine_id, days: d, ...rest }, ctx) => {
      try {
        const row = await routinesSvc.updateRoutineFor(userIdOf(ctx), routine_id, { ...rest, ...(d ? { days: daysMask(d) } : {}) });
        if (!row) return fail(new Error("Routine not found (or nothing to change)."));
        written();
        return ok(slimRoutine(row));
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "delete_routine",
    {
      title: "Delete a routine",
      description: "Stop a routine. Tasks it already created are kept.",
      inputSchema: z.object({ routine_id: z.number().int() }),
      annotations: { destructiveHint: true },
    },
    async ({ routine_id }, ctx) => {
      try {
        const done = await routinesSvc.deleteRoutineFor(userIdOf(ctx), routine_id);
        if (!done) return fail(new Error("Routine not found."));
        written();
        return ok({ deleted: routine_id });
      } catch (e) { return fail(e); }
    }
  );

  server.registerPrompt(
    "plan_monthly_goal",
    {
      title: "Plan a monthly goal",
      description: "Turn a goal (e.g. 'learn a handstand') into a month-long beginner→pro task plan.",
      argsSchema: z.object({
        goal: z.string().describe("What you want to achieve"),
        month: z.string().optional().describe("YYYY-MM (defaults to this month)"),
        level: z.string().optional().describe("Your current level"),
        minutes_per_day: z.string().optional().describe("Time you can spend per day"),
      }),
    },
    ({ goal, month: m, level, minutes_per_day }) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: [
            `Help me reach this goal in ${m ? monthLabel(m) : `this month (${monthLabel(monthKey(new Date()))})`}: ${goal}.`,
            level ? `My current level: ${level}.` : "Ask me about my current level first.",
            minutes_per_day ? `I can spend about ${minutes_per_day} minutes a day.` : "Ask how much time I have per day.",
            "Then design a progressive plan from where I am to the goal — 3–5 phases, specific measurable tasks with form cues in notes,",
            "rest days where needed, and a final test. Show me the plan, and once I approve, save it with the create_goal_plan tool.",
          ].join(" "),
        },
      }],
    })
  );
}
