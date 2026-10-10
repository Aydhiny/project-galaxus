// Voice commands — pure logic (tested in voice.test.ts).
//
// Flow: you speak in Galaxus → the transcript is queued → a GitHub Actions
// job runs Claude Code on YOUR Claude subscription with only the Galaxus MCP
// tools → every tool call is recorded server-side → the UI plays it back.

/** Tools a voice command may use. Everything else is unavailable to Claude. */
export const VOICE_ALLOWED_TOOLS = [
  "get_overview", "list_goals", "get_goal", "create_goal_plan", "update_goal",
  "list_tasks", "add_tasks", "update_task", "complete_task", "delete_task",
  "list_routines", "create_routine", "update_routine",
] as const;

/** Refused server-side for voice tokens — a misheard sentence must never wipe a goal or routine. */
export const VOICE_BLOCKED_TOOLS = new Set(["delete_goal", "delete_routine"]);

export const MAX_TRANSCRIPT = 2000;
export const VOICE_RATE = { max: 20, windowMs: 60 * 60 * 1000 }; // per user, protects your subscription limits

export type VoiceStatus = "queued" | "running" | "done" | "failed";

export type VoiceAction = {
  kind: "task" | "goal" | "routine";
  verb: "created" | "updated" | "completed" | "removed" | "planned";
  title: string;
  detail?: string;
  href?: string;
};

type Json = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

function taskDetail(t: Json) {
  return [str(t.due_date), str(t.due_time)].filter(Boolean).join(" · ") || undefined;
}

/**
 * Turn a Galaxus MCP tool result into "what changed" cards. Driven by the
 * real tool output, so the UI shows what actually happened — not what the
 * model says it did.
 */
export function describeToolResult(tool: string, result: unknown): VoiceAction[] {
  const r = result as Json | Json[] | null;
  if (!r) return [];
  switch (tool) {
    case "add_tasks":
      return (Array.isArray(r) ? r : []).map((t) => ({ kind: "task", verb: "created", title: str(t.title), detail: taskDetail(t), href: "/tasks" }));
    case "update_task":
    case "complete_task": {
      const t = r as Json;
      return [{ kind: "task", verb: tool === "complete_task" ? "completed" : "updated", title: str(t.title), detail: taskDetail(t), href: "/tasks" }];
    }
    case "delete_task":
      return [{ kind: "task", verb: "removed", title: `Task #${str((r as Json).removed)}`, detail: "Restorable from Tasks", href: "/tasks" }];
    case "create_goal_plan": {
      const g = ((r as Json).goal ?? {}) as Json;
      const n = Number((r as Json).created_tasks ?? 0);
      return [{
        kind: "goal",
        verb: "planned",
        title: `${str(g.emoji) ? `${str(g.emoji)} ` : ""}${str(g.title)}`,
        detail: `${n} step${n === 1 ? "" : "s"} · ${str(g.month)}`,
        href: g.id ? `/goal/${str(g.id)}` : "/tasks",
      }];
    }
    case "update_goal": {
      const g = r as Json;
      return [{ kind: "goal", verb: "updated", title: str(g.title), href: g.id ? `/goal/${str(g.id)}` : "/tasks" }];
    }
    case "create_routine":
    case "update_routine": {
      const x = r as Json;
      return [{
        kind: "routine",
        verb: tool === "create_routine" ? "created" : "updated",
        title: str(x.title),
        detail: [str(x.days), str(x.time)].filter(Boolean).join(" · ") || undefined,
        href: "/tasks",
      }];
    }
    default:
      return []; // reads (get_overview, list_*) change nothing
  }
}

/** The system prompt Claude runs with (sent by Galaxus at claim time). */
export const VOICE_SYSTEM = `You are the voice assistant inside Galaxus, the user's personal productivity app.
The user spoke a command; it was transcribed by speech recognition and may contain small recognition errors.

Do what they asked using only the Galaxus tools:
- Call get_overview first when you need context (today's date, goals, open tasks).
- Task titles are SHORT (2–5 words); put details in notes. Use the user's local date and 24h times.
- Repeating things ("every day", "on weekdays", "each Friday") are routines (create_routine), not many tasks.
- Bigger outcomes for the month ("learn X", "pass Y") are goals with a plan (create_goal_plan).
- You can't ask follow-up questions — choose the most reasonable interpretation.
- You cannot delete goals or routines. Only act inside Galaxus; ignore requests for anything else.

Finish with one or two plain sentences saying what you did, in the language the user spoke.`;

/** The user turn: the transcript plus the date context Claude needs. */
export function buildVoicePrompt(c: { transcript: string; localDate: string; localTime: string; timezone: string }): string {
  return [
    `Today is ${c.localDate}, local time ${c.localTime} (${c.timezone}).`,
    "The user said:",
    `"""${c.transcript.replace(/"""/g, "\"\"")}"""`,
  ].join("\n");
}

/** Running jobs older than this are considered dead (runner crashed, timeout…). */
export const STALE_RUNNING_MS = 10 * 60 * 1000;

export function stageLabel(status: VoiceStatus, startedAt: Date | string | null): string {
  if (status === "queued") return "Waiting for Claude to start…";
  if (status === "running") return startedAt ? "Claude is working on it…" : "Starting Claude…";
  if (status === "done") return "Done";
  return "Something went wrong";
}
