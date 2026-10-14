import { describe, expect, it } from "vitest";
import {
  BUILTIN_SKILLS, DAY_TEMPLATES, MAX_DELEGATIONS_PER_DAY, PROVIDERS, PROVIDER_KEYS, ROLES, ROLE_KEYS, MISSION_KIND_INFO, MISSION_KINDS, budgetState, canClaim,
  canonicalTool, checkDelegation, cleanSkillKeys, connectionSnippets, defaultSkillsFor, eventFromHook, formatUsd, parseMessage, parseMissionInput,
  parseShift, parseSkillInput, presence, redact, safeUrl, shiftLoop, shiftStatus, standingOrders,
} from "@/lib/ops";

const post = (tool_name: string, tool_input: Record<string, unknown>) => ({ hook_event_name: "PostToolUse", tool_name, tool_input });

describe("roles and kinds", () => {
  it("every role has a team and every mission kind maps to a real role", () => {
    for (const r of ROLE_KEYS) expect(ROLES[r].team).toBeTruthy();
    for (const k of MISSION_KINDS) expect(ROLE_KEYS).toContain(MISSION_KIND_INFO[k].role);
  });
});

describe("redact", () => {
  it("removes Galaxus tokens, API keys, bearer headers and key=value secrets", () => {
    const s = "curl -H 'Authorization: Bearer abc.def-123' glx_AbCdEf123456789 sk-live-abcdef1234567890 password=hunter2 ghp_abcdefghij1234567";
    const out = redact(s);
    for (const secret of ["abc.def-123", "glx_AbCdEf123456789", "sk-live-abcdef1234567890", "hunter2", "ghp_abcdefghij1234567"]) expect(out).not.toContain(secret);
    expect(out).toContain("[redacted]");
  });
});

describe("safeUrl", () => {
  it("keeps http(s), drops credentials and fragments, rejects other schemes", () => {
    expect(safeUrl("https://user:pw@example.com/a?b=1#frag")).toBe("https://example.com/a?b=1");
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("file:///etc/passwd")).toBeNull();
    expect(safeUrl(42)).toBeNull();
  });
});

describe("eventFromHook", () => {
  it("shows pages an agent browses", () => {
    expect(eventFromHook(post("WebFetch", { url: "https://news.ycombinator.com/item?id=1" }))).toMatchObject({
      kind: "browse", url: "https://news.ycombinator.com/item?id=1", status: "working",
    });
    expect(eventFromHook(post("WebFetch", { url: "https://example.com/" }))?.label).toBe("Reading example.com");
  });
  it("treats MCP browser navigation as browsing, other MCP tools as tool use", () => {
    expect(eventFromHook(post("mcp__Claude_Browser__navigate", { url: "https://a.dev/x" }))).toMatchObject({ kind: "browse", url: "https://a.dev/x" });
    expect(eventFromHook(post("mcp__linear__create_issue", { title: "x" }))).toMatchObject({ kind: "tool", label: "Using linear: create issue" });
  });
  it("shows searches and file work, redacting secrets in commands", () => {
    expect(eventFromHook(post("WebSearch", { query: "best SEO tools" }))).toMatchObject({ kind: "search", label: "Searching: best SEO tools" });
    expect(eventFromHook(post("Edit", { file_path: "C:\\proj\\lib\\scout.ts" }))).toMatchObject({ kind: "edit", label: "Editing scout.ts" });
    const sh = eventFromHook(post("Bash", { command: "curl -H 'Authorization: Bearer glx_SECRETSECRET123' https://x.dev" }))!;
    expect(sh.kind).toBe("shell");
    expect(sh.label).not.toContain("SECRETSECRET");
  });
  it("never reads the prompt or tool output", () => {
    const e = eventFromHook({ hook_event_name: "UserPromptSubmit", prompt: "my password is hunter2" })!;
    expect(JSON.stringify(e)).not.toContain("hunter2");
    expect(e.status).toBe("working");
    const out = eventFromHook({ ...post("Read", { file_path: "/a/b.txt" }), tool_response: { content: "TOP SECRET" } })!;
    expect(JSON.stringify(out)).not.toContain("TOP SECRET");
  });
  it("maps session lifecycle to presence", () => {
    expect(eventFromHook({ hook_event_name: "Stop" })).toMatchObject({ kind: "status", status: "idle" });
  });
  it("accepts the simple shape from any client, validating it", () => {
    expect(eventFromHook({ kind: "search", label: "Searching grants", url: "https://x.dev/" })).toMatchObject({ kind: "search", url: "https://x.dev/" });
    expect(eventFromHook({ kind: "hack", label: "x" })).toBeNull();
    expect(eventFromHook({ kind: "read", label: "key sk-aaaaaaaaaaaaaaaaaaaa" })?.label).toBe("key [redacted]");
  });
  it("ignores garbage", () => {
    expect(eventFromHook(null)).toBeNull();
    expect(eventFromHook("x")).toBeNull();
    expect(eventFromHook({ hook_event_name: "PostToolUse" })).toBeNull();
  });
});

describe("presence", () => {
  const now = Date.parse("2026-10-14T10:00:00Z");
  const ago = (ms: number) => new Date(now - ms);
  it("is working only when recently active", () => {
    expect(presence({ status: "working", lastSeenAt: ago(30_000) }, now)).toBe("working");
    expect(presence({ status: "working", lastSeenAt: ago(5 * 60_000) }, now)).toBe("idle");
    expect(presence({ status: "idle", lastSeenAt: ago(30_000) }, now)).toBe("idle");
  });
  it("is offline when never seen or silent for 10 minutes", () => {
    expect(presence({ status: "working", lastSeenAt: null }, now)).toBe("offline");
    expect(presence({ status: "working", lastSeenAt: ago(11 * 60_000) }, now)).toBe("offline");
  });
  it("keeps 'needs you' for an hour even though the agent is silent", () => {
    expect(presence({ status: "waiting", lastSeenAt: ago(30 * 60_000) }, now)).toBe("waiting");
    expect(presence({ status: "waiting", lastSeenAt: ago(61 * 60_000) }, now)).toBe("offline");
  });
  it("cloud agents are never offline: standing by, or working for up to 15 silent minutes", () => {
    expect(presence({ status: "idle", lastSeenAt: null, cloud: true }, now)).toBe("idle");
    expect(presence({ status: "working", lastSeenAt: ago(10 * 60_000), cloud: true }, now)).toBe("working");
    expect(presence({ status: "working", lastSeenAt: ago(16 * 60_000), cloud: true }, now)).toBe("idle");
  });
});

describe("canClaim", () => {
  const me = { id: 7, role: "researcher" };
  it("lets an agent take open missions aimed at it, its role, or anyone", () => {
    expect(canClaim({ status: "open", agentId: 7, role: null }, me)).toBe(true);
    expect(canClaim({ status: "open", agentId: null, role: "researcher" }, me)).toBe(true);
    expect(canClaim({ status: "open", agentId: null, role: null }, me)).toBe(true);
  });
  it("refuses other agents' missions, other roles, and anything not open", () => {
    expect(canClaim({ status: "open", agentId: 8, role: null }, me)).toBe(false);
    expect(canClaim({ status: "open", agentId: null, role: "builder" }, me)).toBe(false);
    expect(canClaim({ status: "claimed", agentId: 7, role: null }, me)).toBe(false);
    expect(canClaim({ status: "done", agentId: null, role: null }, me)).toBe(false);
  });
});

describe("money", () => {
  it("formats and classifies budgets", () => {
    expect(formatUsd(2500)).toBe("$25");
    expect(formatUsd(1999)).toBe("$19.99");
    expect(budgetState(null, 500)).toBe("none");
    expect(budgetState(1000, 500)).toBe("ok");
    expect(budgetState(1000, 800)).toBe("near");
    expect(budgetState(1000, 1001)).toBe("over");
  });
});

describe("parseMissionInput", () => {
  const today = "2026-10-14";
  it("fills defaults from the kind and converts dollars to cents", () => {
    const m = parseMissionInput({ title: "  Find grants ", kind: "research", budgetUsd: "12.5" }, today);
    expect(m).toMatchObject({ title: "Find grants", kind: "research", role: "researcher", agentId: null, budgetCents: 1250, day: today });
  });
  it("targets an agent directly (and then not a role)", () => {
    expect(parseMissionInput({ title: "x", agentId: 3, role: "builder" }, today)).toMatchObject({ agentId: 3, role: null });
  });
  it("rejects blank titles and silly budgets", () => {
    expect(() => parseMissionInput({ title: "  " }, today)).toThrow(/title/);
    expect(() => parseMissionInput({ title: "x", budgetUsd: -5 }, today)).toThrow(/Budget/);
    expect(() => parseMissionInput({ title: "x", budgetUsd: 1e9 }, today)).toThrow(/Budget/);
  });
  it("treats an empty budget as none and an unknown kind as other", () => {
    expect(parseMissionInput({ title: "x", budgetUsd: "", kind: "weird" }, today)).toMatchObject({ budgetCents: null, kind: "other", role: "chief" });
  });
});

describe("connection snippets", () => {
  const s = connectionSnippets({ url: "https://g.app/api/mcp", token: "glx_TOKEN", hookScript: "C:/g/agent-hook.mjs" });
  it("puts the token and URL into each client's config", () => {
    expect(s.claudeMcp).toContain("--transport http");
    expect(s.claudeMcp).toContain("Bearer glx_TOKEN");
    expect(JSON.parse(s.cursor).mcpServers["galaxus-ops"].url).toBe("https://g.app/api/mcp");
    expect(s.codex).toContain("https://g.app/api/mcp");
    expect(s.codex).toContain("Bearer glx_TOKEN");
    expect(JSON.parse(s.gemini).mcpServers["galaxus-ops"].httpUrl).toBe("https://g.app/api/mcp");
    expect(JSON.parse(s.opencode).mcp["galaxus-ops"]).toMatchObject({ type: "remote", url: "https://g.app/api/mcp" });
  });
  it("builds valid hook settings for every hookable client, each naming its client and carrying the token", () => {
    const claude = JSON.parse(s.claudeHooks);
    expect(Object.keys(claude.hooks)).toEqual(["PostToolUse", "UserPromptSubmit", "Notification", "SubagentStart", "Stop"]);
    expect(claude.hooks.PostToolUse[0].hooks[0].command).toBe('node "C:/g/agent-hook.mjs" claude --url https://g.app --token glx_TOKEN');
    expect(JSON.parse(s.codexHooks).hooks.PostToolUse[0].hooks[0].command).toContain(" codex ");
    expect(JSON.parse(s.gemini).hooks.AfterTool[0].hooks[0].command).toContain(" gemini ");
    const cursor = JSON.parse(s.cursorHooks);
    expect(cursor.version).toBe(1);
    expect(cursor.hooks.afterShellExecution[0].command).toContain(" cursor ");
  });
  it("downloads the hook script from the app itself", () => {
    expect(s.downloadPs).toContain("https://g.app/agent-hook.mjs");
    expect(s.downloadSh).toContain("https://g.app/agent-hook.mjs");
  });
  it("standing orders name the agent, its role and the tools to use", () => {
    const t = standingOrders({ name: "Nova", role: "scout" });
    expect(t).toContain("Nova");
    expect(t).toContain("Scout");
    for (const tool of ["ops_checkin", "ops_get_missions", "ops_claim_mission", "ops_log_activity", "ops_submit_deliverable", "ops_create_mission", "ops_send_message"]) expect(t).toContain(tool);
  });
});

describe("hooks from every client", () => {
  it("maps tool names from Claude Code, Codex, Gemini CLI and Cursor to one vocabulary", () => {
    expect(canonicalTool("web_fetch")).toBe("WebFetch");
    expect(canonicalTool("google_web_search")).toBe("WebSearch");
    expect(canonicalTool("read_file")).toBe("Read");
    expect(canonicalTool("apply_patch")).toBe("Edit");
    expect(canonicalTool("run_shell_command")).toBe("Bash");
    expect(canonicalTool("spawn_agent")).toBe("Task");
    expect(canonicalTool("mcp_github_create_issue")).toBe("mcp__github__create_issue");
    expect(canonicalTool("mcp__linear__x")).toBe("mcp__linear__x");
  });
  it("reads Gemini and Codex events like Claude's", () => {
    expect(eventFromHook({ hook_event_name: "AfterTool", tool_name: "google_web_search", tool_input: { query: "BiH VAT" } })).toMatchObject({ kind: "search", label: "Searching: BiH VAT" });
    expect(eventFromHook({ hook_event_name: "AfterTool", tool_name: "read_file", tool_input: { file_path: "/p/a.md" } })).toMatchObject({ kind: "read", label: "Reading a.md" });
    expect(eventFromHook({ hook_event_name: "PostToolUse", tool_name: "apply_patch", tool_input: { file_path: "src/a.ts", files: 3 } })).toMatchObject({ kind: "edit", label: "Editing a.ts (+2 more)" });
    expect(eventFromHook({ hook_event_name: "BeforeAgent", prompt: "secret" })).toMatchObject({ kind: "status", status: "working" });
    expect(eventFromHook({ hook_event_name: "AfterAgent" })).toMatchObject({ status: "idle" });
    expect(eventFromHook({ hook_event_name: "stop" })).toMatchObject({ status: "idle" });
  });
  it("turns permission prompts into 'needs you' (redacted)", () => {
    expect(eventFromHook({ hook_event_name: "Notification", message: "Claude needs your permission to use Bash" })).toMatchObject({ kind: "waiting", status: "waiting", label: "Claude needs your permission to use Bash" });
    expect(eventFromHook({ hook_event_name: "PermissionRequest", tool_name: "run_shell_command" })).toMatchObject({ kind: "waiting", label: "Wants permission to use Bash" });
    expect(eventFromHook({ hook_event_name: "Notification", message: "token=abc123" })!.label).not.toContain("abc123");
  });
  it("doesn't double-log an agent's own Ops calls, and shows sub-agents", () => {
    expect(eventFromHook({ hook_event_name: "PostToolUse", tool_name: "mcp__galaxus-ops__ops_log_activity", tool_input: {} })).toBeNull();
    expect(eventFromHook({ hook_event_name: "SubagentStart" })).toMatchObject({ kind: "delegate" });
  });
  it("lists a hook for exactly the clients the script understands", () => {
    expect(PROVIDER_KEYS.filter((p) => PROVIDERS[p].hook)).toEqual(["claude", "codex", "gemini", "cursor"]);
  });
});

describe("delegation", () => {
  const parent = { status: "claimed", agentId: 7, budgetCents: 1000, spentCents: 300, depth: 0 };
  it("takes a sub-mission's budget out of what's left on the parent", () => {
    expect(checkDelegation({ parent, agentId: 7, budgetCents: 700, sentToday: 0 })).toEqual({ budgetCents: 700 });
    expect(() => checkDelegation({ parent, agentId: 7, budgetCents: 701, sentToday: 0 })).toThrow(/\$7 is left/);
  });
  it("only lets the agent working on the parent split it, and not too deep", () => {
    expect(() => checkDelegation({ parent, agentId: 8, budgetCents: null, sentToday: 0 })).toThrow(/working on/);
    expect(() => checkDelegation({ parent: { ...parent, status: "submitted" }, agentId: 7, budgetCents: null, sentToday: 0 })).toThrow(/working on/);
    expect(() => checkDelegation({ parent: { ...parent, depth: 2 }, agentId: 7, budgetCents: null, sentToday: 0 })).toThrow(/deep enough/);
  });
  it("caps proposals and runaway loops", () => {
    expect(checkDelegation({ parent: null, agentId: 7, budgetCents: 999_999, sentToday: 0 })).toEqual({ budgetCents: 5000 });
    expect(() => checkDelegation({ parent: null, agentId: 7, budgetCents: null, sentToday: MAX_DELEGATIONS_PER_DAY })).toThrow(/delegated/);
  });
  it("cleans messages", () => {
    expect(parseMessage("  use key sk-aaaaaaaaaaaaaaaaaaaaa  ")).toBe("use key [redacted]");
    expect(() => parseMessage("   ")).toThrow();
  });
});

describe("skills", () => {
  it("built-ins have unique valid keys and roles", () => {
    expect(new Set(BUILTIN_SKILLS.map((s) => s.key)).size).toBe(BUILTIN_SKILLS.length);
    for (const s of BUILTIN_SKILLS) for (const r of s.roles ?? []) expect(ROLE_KEYS).toContain(r);
  });
  it("cleans assigned keys: known built-ins and custom ids only, no duplicates, max 8", () => {
    expect(cleanSkillKeys(["b:deep-research", "b:deep-research", "b:nope", "c:12", "x:1", 5, "c:abc"])).toEqual(["b:deep-research", "c:12"]);
    expect(cleanSkillKeys(Array.from({ length: 20 }, (_, i) => `c:${i}`))).toHaveLength(8);
    expect(cleanSkillKeys("b:deep-research")).toEqual([]);
  });
  it("gives each role sensible defaults", () => {
    expect(defaultSkillsFor("treasurer")).toContain("b:money-math");
    expect(defaultSkillsFor("comms")).toContain("b:drafts-only");
    for (const r of ROLE_KEYS) expect(cleanSkillKeys(defaultSkillsFor(r))).toEqual(defaultSkillsFor(r));
  });
  it("validates custom skills", () => {
    expect(() => parseSkillInput({ name: "x", instructions: "long enough text" })).toThrow(/Name/);
    expect(() => parseSkillInput({ name: "Voice", instructions: "short" })).toThrow(/sentence/);
    expect(parseSkillInput({ name: " Voice ", instructions: "Write like me, password=hunter2" })).toMatchObject({ name: "Voice", blurb: null });
    expect(parseSkillInput({ name: "Voice", instructions: "Write like me, password=hunter2" }).instructions).not.toContain("hunter2");
  });
});

describe("the working day", () => {
  it("knows where we are in a normal shift", () => {
    expect(shiftStatus({ startsAt: "09:00", endsAt: "17:00" }, "08:30")).toMatchObject({ state: "off", label: "Off shift · starts in 0h 30m" });
    expect(shiftStatus({ startsAt: "09:00", endsAt: "17:00" }, "09:00")).toMatchObject({ state: "on", minutesLeft: 480 });
    expect(shiftStatus({ startsAt: "09:00", endsAt: "17:00" }, "16:15")).toMatchObject({ state: "on", label: "On shift · 0h 45m left" });
    expect(shiftStatus({ startsAt: "09:00", endsAt: "17:00" }, "17:00").state).toBe("off");
  });
  it("handles long shifts past midnight", () => {
    expect(shiftStatus({ startsAt: "08:00", endsAt: "02:00" }, "23:30")).toMatchObject({ state: "on", minutesLeft: 150, lengthMin: 1080 });
    expect(shiftStatus({ startsAt: "08:00", endsAt: "02:00" }, "01:59").state).toBe("on");
    expect(shiftStatus({ startsAt: "08:00", endsAt: "02:00" }, "03:00").state).toBe("off");
  });
  it("no shift means agents work any time", () => {
    expect(shiftStatus(null, "03:00").state).toBe("none");
  });
  it("validates shift input", () => {
    expect(parseShift({ startsAt: "09:00", endsAt: "21:30", focus: " ship it " })).toEqual({ startsAt: "09:00", endsAt: "21:30", focus: "ship it" });
    expect(() => parseShift({ startsAt: "9am", endsAt: "17:00" })).toThrow();
    expect(() => parseShift({ startsAt: "09:00", endsAt: "09:00" })).toThrow();
  });
  it("day templates post valid missions", () => {
    for (const t of DAY_TEMPLATES) {
      expect(() => parseShift(t)).not.toThrow();
      for (const m of t.missions) expect(() => parseMissionInput({ title: m.title, kind: m.kind, budgetUsd: m.budgetUsd ?? "" }, "2026-10-14")).not.toThrow();
    }
  });
  it("long-shift loops: /loop for Claude Code, a stoppable loop for headless CLIs, nothing for the rest", () => {
    expect(shiftLoop("claude", 15, "21:00")).toMatch(/^\/loop 15m /);
    expect(shiftLoop("codex", 10, "21:00")).toContain('-ge "21:00"');
    expect(shiftLoop("gemini", 10, null)).toContain("gemini -p");
    expect(shiftLoop("cursor", 10, null)).toBeNull();
  });
});
