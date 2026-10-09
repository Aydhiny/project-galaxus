# Galaxus MCP server

Lets any MCP-compatible AI (Claude Code, Claude Desktop, Cursor, VS Code, …) work with your
tasks and **monthly goals** — e.g. *"Make me a handstand plan for October, beginner to pro."*

- **Endpoint:** `https://project-galaxus.vercel.app/api/mcp` (Streamable HTTP)
- **Auth:** `Authorization: Bearer glx_…` — create/revoke tokens in **Settings → AI assistants**
  (copy-paste setup for each client is shown there). Tokens are stored as SHA-256 hashes.

## Tools
| Tool | What it does |
|---|---|
| `get_overview` | Today, this month's goals (progress + pace), tasks due today/overdue — call first |
| `list_goals` / `get_goal` | Goals with progress; one goal's plan grouped by phase |
| `create_goal_plan` | Create a goal **and** its phased, dated task plan in one call (or extend one via `goal_id`) |
| `update_goal` / `delete_goal` | Edit, move month, mark achieved/abandoned; delete (optionally with tasks) |
| `list_tasks` / `add_tasks` / `update_task` / `complete_task` / `delete_task` | Task CRUD (removal is soft — history kept) |

Prompt: `plan_monthly_goal` (goal, month?, level?, minutes_per_day?) — guides the AI to design a plan,
show it to you, and save it with `create_goal_plan` once you approve.

## Design notes
- Tools call the same `lib/services/*` functions as the web app (one set of validation rules).
  The user always comes from the verified token, never from tool arguments.
- Undated plan tasks are spread evenly across the month; `day` or `date` pins them.
- Rate limit: 120 calls/minute per token. Writes revalidate `/tasks`, `/productivity`, `/review`.
- Test: `lib/mcp/route.test.ts` drives the real route with a real MCP client in-process.
