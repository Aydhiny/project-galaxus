// @vitest-environment node
//
// public/agent-hook.mjs runs inside every tool call of Claude Code, Codex,
// Gemini CLI and Cursor, so it must (1) send only a few whitelisted fields,
// never the prompt, model output, tool output or file contents, (2) print
// exactly what each client expects on stdout, and (3) never fail or slow the
// agent, whatever goes wrong.

import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import * as hook from "../public/agent-hook.mjs";

// The script is plain JS; in tests we only care about the JSON it produces.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normalize = hook.normalize as (client: string, payload: unknown) => any;
const reply = hook.reply as (client: string, event: string) => string;

const SCRIPT = new URL("../public/agent-hook.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function run(stdin: string, args: string[], env: Record<string, string> = {}) {
  return new Promise<{ code: number | null; ms: number; out: string }>((resolve) => {
    const t0 = Date.now();
    const p = spawn(process.execPath, [SCRIPT, ...args], { env: { ...process.env, GALAXUS_AGENT_TOKEN: "", GALAXUS_URL: "", ...env }, stdio: ["pipe", "pipe", "ignore"] });
    let out = "";
    p.stdout.on("data", (c) => (out += c));
    p.stdin.end(stdin);
    p.on("close", (code) => resolve({ code, ms: Date.now() - t0, out }));
  });
}

async function capture(fn: (port: number) => Promise<unknown>) {
  let got: { auth?: string; body?: string; url?: string; client?: string } = {};
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => { got = { auth: req.headers.authorization, body, url: req.url, client: String(req.headers["x-galaxus-client"]) }; res.end("{}"); });
  }).listen(0);
  await once(server, "listening");
  await fn((server.address() as AddressInfo).port);
  server.close();
  return got;
}

const LEAKS = ["hunter2", "TOP SECRET", "C:/secret", "NOT WHITELISTED", "transcript", "session_id", "PATCH BODY"];

describe("agent-hook.mjs (end to end)", () => {
  it("forwards only whitelisted fields with the token from --token/--url", async () => {
    const payload = {
      hook_event_name: "PostToolUse", tool_name: "WebFetch", session_id: "s1", cwd: "C:/secret/project", transcript_path: "C:/Users/x/t.jsonl",
      prompt: "my password is hunter2",
      tool_input: { url: "https://example.com/a", extra: "NOT WHITELISTED" },
      tool_response: { content: "TOP SECRET FILE CONTENTS" },
    };
    let r = { code: -1 as number | null, out: "" };
    const got = await capture(async (port) => { r = await run(JSON.stringify(payload), ["claude", "--url", `http://127.0.0.1:${port}/`, "--token", "glx_test"]); });
    expect(r.code).toBe(0);
    expect(r.out).toBe(""); // Claude Code would feed stdout to the model on some events
    expect(got.url).toBe("/api/agents/event");
    expect(got.auth).toBe("Bearer glx_test");
    expect(got.client).toBe("claude");
    const sent = JSON.parse(got.body!);
    expect(sent.tool_name).toBe("WebFetch");
    expect(sent.tool_input.url).toBe("https://example.com/a");
    for (const leak of LEAKS) expect(got.body).not.toContain(leak);
  });

  it("still reads the token from the environment", async () => {
    const got = await capture(async (port) => { await run(JSON.stringify({ hook_event_name: "Stop" }), ["codex"], { GALAXUS_AGENT_TOKEN: "glx_env", GALAXUS_URL: `http://127.0.0.1:${port}` }); });
    expect(got.auth).toBe("Bearer glx_env");
  });

  it("answers Gemini with JSON and Cursor's prompt hook with continue:true, even when offline", async () => {
    expect((await run(JSON.stringify({ hook_event_name: "AfterTool", tool_name: "read_file" }), ["gemini", "--url", "http://127.0.0.1:1", "--token", "glx_t"])).out).toBe("{}");
    expect((await run(JSON.stringify({ hook_event_name: "beforeSubmitPrompt", prompt: "x" }), ["cursor"])).out).toBe('{"continue":true}');
  });

  it("exits 0 quickly when the server is unreachable, on garbage, or unconfigured", async () => {
    const r = await run(JSON.stringify({ hook_event_name: "Stop" }), ["claude", "--url", "http://127.0.0.1:1", "--token", "glx_t"]);
    expect(r.code).toBe(0);
    expect(r.ms).toBeLessThan(5000);
    expect((await run("not json", ["gemini", "--url", "http://127.0.0.1:1", "--token", "glx_t"])).code).toBe(0);
    expect((await run("{}", [])).code).toBe(0);
  });
});

describe("normalize", () => {
  it("Codex apply_patch: file names from the headers, never the patch", () => {
    const n = normalize("codex", { hook_event_name: "PostToolUse", tool_name: "apply_patch", tool_input: { command: "*** Begin Patch\n*** Update File: src/a.ts\n+PATCH BODY hunter2\n*** Add File: src/b.ts\n*** End Patch" } });
    expect(n.tool_input).toEqual({ file_path: "src/a.ts", files: 2 });
    for (const leak of LEAKS) expect(JSON.stringify(n)).not.toContain(leak);
  });
  it("Codex shell commands given as arrays become one line", () => {
    expect(normalize("codex", { hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: ["bash", "-lc", "ls"] } }).tool_input.command).toBe("bash -lc ls");
  });
  it("Gemini web_fetch: only the URL leaves, not the prompt around it", () => {
    const n = normalize("gemini", { hook_event_name: "AfterTool", tool_name: "web_fetch", tool_input: { prompt: "summarise https://x.dev/page for my hunter2 project" } });
    expect(n.tool_input).toEqual({ url: "https://x.dev/page" });
  });
  it("Gemini read_file uses absolute_path", () => {
    expect(normalize("gemini", { hook_event_name: "AfterTool", tool_name: "read_file", tool_input: { absolute_path: "/p/notes.md" } }).tool_input.file_path).toBe("/p/notes.md");
  });
  it("Cursor's per-action hooks get a tool name; output is dropped", () => {
    expect(normalize("cursor", { hook_event_name: "afterShellExecution", command: "npm test", output: "TOP SECRET" })).toEqual({ hook_event_name: "afterShellExecution", tool_name: "Bash", tool_input: { command: "npm test" } });
    expect(normalize("cursor", { hook_event_name: "afterFileEdit", file_path: "a.ts", edits: [{ new_string: "TOP SECRET" }] })).toEqual({ hook_event_name: "afterFileEdit", tool_name: "Edit", tool_input: { file_path: "a.ts" } });
    expect(normalize("cursor", { hook_event_name: "afterMCPExecution", mcp_server_name: "linear", tool_name: "create issue", tool_input: {}, result_json: "TOP SECRET" }).tool_name).toBe("mcp__linear__create_issue");
  });
  it("permission notifications keep only the short system message", () => {
    expect(normalize("claude", { hook_event_name: "Notification", message: "Claude needs your permission to use Bash", prompt: "hunter2" })).toEqual({ hook_event_name: "Notification", tool_name: undefined, message: "Claude needs your permission to use Bash" });
  });
  it("reply() never talks to Claude or Codex", () => {
    expect(reply("claude", "UserPromptSubmit")).toBe("");
    expect(reply("codex", "UserPromptSubmit")).toBe("");
  });
});

describe("--dir: only the agent's own sessions report", () => {
  it("matches the folder and its subfolders, on Windows paths too, and nothing else", () => {
    expect(hook.insideDir("C:\\User\\Reuf\\src", "c:/user/reuf")).toBe(true);
    expect(hook.insideDir("C:\\User\\Reuf", "C:\\User\\Reuf\\")).toBe(true);
    expect(hook.insideDir("/home/a/reuf/app", "/home/a/reuf")).toBe(true);
    // Your other sessions (e.g. working on Galaxus itself) are not the agent.
    expect(hook.insideDir("C:\\User\\Programming\\project-galaxus", "C:\\User\\Reuf")).toBe(false);
    expect(hook.insideDir("C:/User/Reufx", "C:/User/Reuf")).toBe(false); // a sibling with a longer name
    expect(hook.insideDir("", "C:/User/Reuf")).toBe(false);
  });
});
