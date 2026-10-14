#!/usr/bin/env node
// Galaxus Ops hook: tells your facility what an agent just did.
// Works with Claude Code, Codex, Gemini CLI and Cursor (pass the client name).
//
//   node agent-hook.mjs <claude|codex|gemini|cursor> --url https://your-galaxus --token glx_…
//   (or set GALAXUS_URL and GALAXUS_AGENT_TOKEN instead of the flags)
//
// The client runs this after each tool call and passes the event as JSON on
// stdin. We forward ONLY a few small fields: which tool, and the url / search
// query / file NAME / command it was given. The prompt, the model's reply,
// tool output and file contents are never read or sent. Galaxus redacts
// secrets again on arrival.
//
// It never fails loudly: a broken hook would interrupt the agent, so any
// problem (no network, bad token, odd input) is swallowed and the agent
// carries on. Exit code is always 0.

const CLIENTS = ["claude", "codex", "gemini", "cursor"];

const clip = (v, n) => (typeof v === "string" ? v.slice(0, n) : undefined);
const firstUrl = (s) => (typeof s === "string" ? s.match(/https?:\/\/[^\s"'<>)]+/)?.[0] : undefined);
const asText = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").join(" ") : typeof v === "string" ? v : undefined);

/** Files touched by a Codex apply_patch, from its headers only (never the patch body). */
function patchFiles(input) {
  const text = Object.values(input).filter((v) => typeof v === "string").join("\n");
  return [...text.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)].map((m) => m[1].trim());
}

/** Client payload → the small, whitelisted shape Galaxus accepts. Exported for tests. */
export function normalize(client, p) {
  if (!p || typeof p !== "object") return null;
  const i = p.tool_input && typeof p.tool_input === "object" ? p.tool_input : {};
  let event = p.hook_event_name;
  let tool = p.tool_name;

  // Cursor's per-action hooks carry no tool name: give them one.
  if (client === "cursor") {
    if (event === "afterShellExecution") { tool = "Bash"; return pack(event, tool, { command: clip(p.command, 300) }); }
    if (event === "afterFileEdit") { tool = "Edit"; return pack(event, tool, { file_path: clip(p.file_path, 300) }); }
    if (event === "afterMCPExecution") tool = `mcp__${String(p.mcp_server_name || "mcp").replace(/\W+/g, "_")}__${String(p.tool_name || "tool").replace(/\W+/g, "_")}`;
  }

  if (/notification|permission/i.test(String(event))) {
    return { hook_event_name: event, tool_name: clip(tool, 100), message: clip(p.message, 200) };
  }

  const files = String(tool).toLowerCase() === "apply_patch" ? patchFiles(i) : [];
  return pack(event, tool, {
    url: clip(i.url, 400) || clip(firstUrl(i.prompt), 400), // Gemini's web_fetch takes URLs inside a prompt: only the URL leaves
    query: clip(i.query, 200),
    file_path: clip(files[0] ?? i.file_path ?? i.absolute_path ?? i.path, 300),
    files: files.length || undefined,
    notebook_path: clip(i.notebook_path, 300),
    command: files.length ? undefined : clip(asText(i.command), 300),
    pattern: clip(i.pattern, 200),
    description: clip(i.description, 200),
  });
}

function pack(event, tool, input) {
  for (const k of Object.keys(input)) if (input[k] === undefined || input[k] === "") delete input[k];
  return { hook_event_name: event, tool_name: clip(tool, 100), tool_input: input };
}

/** What the client expects on stdout so it carries on untouched. */
export function reply(client, event) {
  if (client === "gemini") return "{}"; // Gemini parses stdout as JSON
  if (client === "cursor") return event === "beforeSubmitPrompt" ? '{"continue":true}' : "{}";
  return ""; // Claude Code / Codex: plain stdout on a prompt hook becomes model context, so say nothing
}

/** Is `cwd` the folder `dir` or inside it? (Windows: case-insensitive, either slash.) */
export function insideDir(cwd, dir) {
  const norm = (s) => String(s).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  const c = norm(cwd), d = norm(dir);
  return !!c && !!d && (c === d || c.startsWith(`${d}/`));
}

function arg(name) {
  const k = process.argv.indexOf(`--${name}`);
  return k > 0 ? process.argv[k + 1] : undefined;
}

async function main() {
  const client = CLIENTS.includes(process.argv[2]) ? process.argv[2] : "claude";
  const token = arg("token") || process.env.GALAXUS_AGENT_TOKEN;
  const base = (arg("url") || process.env.GALAXUS_URL || "").replace(/\/+$/, "");
  let event;
  try {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    const p = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    event = p?.hook_event_name;
    // --dir <folder>: report only sessions working inside the agent's own folder. Hooks in ~/.claude
    // fire for EVERY session on the computer; without this, your own unrelated sessions show up as the agent.
    const dir = arg("dir") || process.env.GALAXUS_AGENT_DIR;
    const inDir = !dir || insideDir(String(p?.cwd ?? p?.workspace_roots?.[0] ?? ""), dir);
    const body = token && base && inDir ? normalize(client, p) : null;
    if (body) {
      await fetch(`${base}/api/agents/event`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Galaxus-Client": client },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(3000),
      });
    }
  } catch {
    /* never interrupt the agent */
  }
  const out = reply(client, event);
  if (out) process.stdout.write(out);
  process.exit(0);
}

// Run only when executed (tests import normalize/reply without running it).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) main();
