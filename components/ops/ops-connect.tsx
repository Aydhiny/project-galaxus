"use client";

// Add an agent and connect it. Two kinds:
//   • On your computer: any MCP client (Claude Code, Codex, Gemini CLI, Cursor,
//     Grok, OpenCode…) with its own token. Clients with hooks are OBSERVED;
//     the rest report what they choose to.
//   • In the cloud: runs on your own Claude runner (GitHub Actions or your API
//     key). Nothing to install; it pulls missions all shift on its own.
// The token is shown once. Each tab says honestly what you will and won't see.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Cloud, Copy, Laptop, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BUILTIN_SKILLS, PROVIDERS, PROVIDER_KEYS, ROLES, ROLE_KEYS, connectionSnippets, defaultSkillsFor, shiftLoop, standingOrders,
  type ProviderKey, type RoleKey,
} from "@/lib/ops";
import { ProviderIcon } from "@/components/ops/provider-logos";
import { createAgentC } from "@/lib/client/ops";

type Tab = "claude" | "codex" | "gemini" | "cursor" | "opencode" | "other";
const TAB_OF: Record<ProviderKey, Tab> = {
  claude: "claude", codex: "codex", gemini: "gemini", cursor: "cursor", windsurf: "other", copilot: "other", grok: "other", opencode: "opencode", cline: "other", other: "other",
};
const TABS: [Tab, string][] = [["claude", "Claude Code"], ["codex", "Codex"], ["gemini", "Gemini CLI"], ["cursor", "Cursor"], ["opencode", "OpenCode"], ["other", "Other MCP client"]];
const SCRIPT_KEY = "ops.hookScript";
const SCRIPT_DEFAULT = "~/.galaxus/agent-hook.mjs";
const field = "w-full rounded-lg bg-white/[0.06] border border-white/10 px-2.5 py-1.5 text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-[#6b8afd]/60";

type Made = { token: string | null; name: string; role: RoleKey; provider: ProviderKey; cloud: boolean };

export function ConnectDialog({ onClose, onCreated, preset, claudeMode, shiftEnds }: {
  onClose: () => void; onCreated: () => void; preset?: ProviderKey | "cloud"; claudeMode?: "runner" | "api" | "none"; shiftEnds?: string | null;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<RoleKey>("researcher");
  const [cloud, setCloud] = useState(preset === "cloud");
  const [provider, setProvider] = useState<ProviderKey>(preset && preset !== "cloud" ? preset : "claude");
  const [skills, setSkills] = useState<string[]>(defaultSkillsFor("researcher"));
  const [made, setMade] = useState<Made | null>(null);
  const [busy, start] = useTransition();

  function pickRole(r: RoleKey) { setRole(r); setSkills(defaultSkillsFor(r)); }

  function create(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        const r = await createAgentC({ name, role, provider: cloud ? "claude" : provider, cloud, skills });
        setMade({ token: r.token, name: name.trim(), role, provider: cloud ? "claude" : provider, cloud });
        onCreated();
      } catch (err) { toast.error((err as Error).message); }
    });
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-3 sm:p-6" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl max-h-full overflow-y-auto rounded-2xl border border-white/15 bg-[#26272b] text-white p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{made ? (made.cloud ? `${made.name} is on the floor` : `Connect ${made.name}`) : "Hire an agent"}</h2>
            <p className="text-xs text-white/55 mt-0.5">{made ? (made.cloud ? "Cloud agents need nothing installed." : "One token per agent. It is how Galaxus knows who is who.") : "Each agent gets a desk, a role costume and its own identity."}</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-white/10 inline-flex items-center justify-center" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>

        {!made ? (
          <form onSubmit={create} className="mt-4 space-y-3">
            <div>
              <label className="text-xs text-white/60" htmlFor="agent-name">Name</label>
              <input id="agent-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Nova" className={field} autoFocus />
            </div>
            <div>
              <p className="text-xs text-white/60">Where does it work?</p>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                <button type="button" onClick={() => setCloud(false)} className={cn("rounded-lg border p-2.5 text-left", !cloud ? "border-[#6b8afd]/70 bg-[#6b8afd]/15" : "border-white/10 hover:bg-white/5")}>
                  <span className="flex items-center gap-1.5 text-sm font-semibold"><Laptop className="w-4 h-4" /> Your computer</span>
                  <span className="block text-[11px] text-white/55 mt-0.5">Claude Code, Codex, Gemini, Cursor, Grok… over MCP</span>
                </button>
                <button type="button" onClick={() => setCloud(true)} className={cn("rounded-lg border p-2.5 text-left", cloud ? "border-[#6b8afd]/70 bg-[#6b8afd]/15" : "border-white/10 hover:bg-white/5")}>
                  <span className="flex items-center gap-1.5 text-sm font-semibold"><Cloud className="w-4 h-4" /> Galaxus cloud</span>
                  <span className="block text-[11px] text-white/55 mt-0.5">Runs on your Claude, with web search. Fully automatic.</span>
                </button>
              </div>
              {cloud && claudeMode === "none" && (
                <p className="mt-1.5 text-[11px] text-amber-200">Connect your Claude first (Connections → Claude): cloud agents run on your own subscription or API key.</p>
              )}
            </div>
            <div>
              <p className="text-xs text-white/60">Role (decides the costume and which missions it takes)</p>
              <div className="mt-1 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {ROLE_KEYS.map((r) => (
                  <button type="button" key={r} onClick={() => pickRole(r)} title={ROLES[r].blurb}
                    className={cn("rounded-lg border px-2 py-1.5 text-left text-xs transition-colors", role === r ? "border-[#6b8afd]/70 bg-[#6b8afd]/15" : "border-white/10 hover:bg-white/5")}>
                    <span className="font-semibold">{ROLES[r].label}</span>
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-white/45">{ROLES[role].blurb}</p>
            </div>
            {!cloud && (
              <div>
                <p className="text-xs text-white/60">Which client runs it? (its logo floats above the agent)</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {PROVIDER_KEYS.map((p) => (
                    <button type="button" key={p} onClick={() => setProvider(p)}
                      className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors", provider === p ? "border-[#6b8afd]/70 bg-[#6b8afd]/15" : "border-white/10 hover:bg-white/5")}>
                      <ProviderIcon provider={p} className="w-4 h-4" /> {PROVIDERS[p].label}
                      {PROVIDERS[p].hook && <span className="text-[10px] text-emerald-300/80">observed</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="text-xs text-white/60">Skills (instructions it follows; change them any time)</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {BUILTIN_SKILLS.map((s) => (
                  <button type="button" key={s.key} title={s.blurb} onClick={() => setSkills((k) => (k.includes(s.key) ? k.filter((x) => x !== s.key) : [...k, s.key].slice(0, 8)))}
                    className={cn("rounded-full px-2.5 py-1 text-[11px] border", skills.includes(s.key) ? "bg-violet-400/20 border-violet-300/60 text-violet-100" : "border-white/10 text-white/55 hover:text-white")}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
            <button disabled={busy || name.trim().length < 2} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#6b8afd] text-[#0f1222] text-sm font-semibold disabled:opacity-40">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Create agent
            </button>
          </form>
        ) : made.cloud ? (
          <div className="mt-4 space-y-2 text-sm text-white/75">
            <Honest>Cloud agents are <b>observed by construction</b>: Galaxus starts each run on your Claude and files the result, so everything on its desk is real. They can search and read the web, and nothing else: no logins, purchases or messages.</Honest>
            <p>It takes open {ROLES[made.role].label} missions automatically, one at a time, every ~10 minutes during your shift (and right away when you post one).</p>
            {claudeMode === "none" && <p className="text-amber-200">It will wait until you connect your Claude (Connections → Claude).</p>}
          </div>
        ) : (
          <Snippets made={made} shiftEnds={shiftEnds ?? null} />
        )}
      </div>
    </div>
  );
}

function Snippets({ made, shiftEnds }: { made: Made; shiftEnds: string | null }) {
  const [tab, setTab] = useState<Tab>(TAB_OF[made.provider]);
  // Only mounted after a click, so reading browser values in a lazy initialiser is safe.
  const [script, setScript] = useState(() => { try { return localStorage.getItem(SCRIPT_KEY) || SCRIPT_DEFAULT; } catch { return SCRIPT_DEFAULT; } });
  const [origin] = useState(() => window.location.origin);
  function saveScript(v: string) { setScript(v); try { localStorage.setItem(SCRIPT_KEY, v); } catch { /* ignore */ } }

  const s = connectionSnippets({ url: `${origin}/api/mcp`, token: made.token ?? "", hookScript: script.replace(/\\/g, "/") });
  const orders = standingOrders({ name: made.name, role: made.role });
  const loopFor = (p: ProviderKey) => shiftLoop(p, 15, shiftEnds);
  const hooked = tab === "claude" || tab === "codex" || tab === "gemini" || tab === "cursor";
  let n = 0;

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
        Copy what you need now. The token is shown once; Galaxus only keeps a hash. Lost it? Remove the agent and add it again. Keep these configs in your <b>user</b> settings, never in a repo you push.
      </div>

      <div className="flex flex-wrap gap-1">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("h-8 px-3 rounded-full text-xs border", tab === k ? "border-[#6b8afd]/70 bg-[#6b8afd]/15" : "border-white/10 text-white/60 hover:text-white")}>{label}</button>
        ))}
      </div>

      {hooked ? (
        <Honest>{TABS.find((t) => t[0] === tab)?.[1]} has hooks, so its activity is <b>observed, not self-reported</b>: pages it fetches, searches, files it edits, commands it runs, and when it is waiting for your permission (the red beacon). Prompts, replies, tool output and file contents never leave your machine.</Honest>
      ) : (
        <Honest>This client connects over MCP, so it can take missions and report. There is no hook for it, so what you see is <b>what the agent chooses to log</b> with <code>ops_log_activity</code>, not a guaranteed record.</Honest>
      )}

      {hooked && (
        <Step n={++n} title="Get the hook script (once per computer)">
          <p className="text-[11px] text-white/50 mb-1">PowerShell (Windows):</p>
          <Copy_ text={s.downloadPs} />
          <p className="text-[11px] text-white/50 mt-2 mb-1">macOS / Linux:</p>
          <Copy_ text={s.downloadSh} />
          <label className="block text-[11px] text-white/55 mt-2">Where is it? (Windows: use the full path, e.g. C:/Users/you/.galaxus/agent-hook.mjs)</label>
          <input value={script} onChange={(e) => saveScript(e.target.value)} className={cn(field, "font-mono text-xs")} />
          <p className="text-[11px] text-white/45 mt-1">Needs Node 18+. Read it first if you like: it is ~100 lines and sends only tool names, URLs, search queries, file names and commands.</p>
        </Step>
      )}

      {tab === "claude" && (
        <>
          <Step n={++n} title="Connect it to Galaxus"><Copy_ text={s.claudeMcp} /></Step>
          <Step n={++n} title="Turn on live activity: merge into ~/.claude/settings.json"><Copy_ text={s.claudeHooks} /></Step>
        </>
      )}
      {tab === "codex" && (
        <>
          <Step n={++n} title="Add to ~/.codex/config.toml"><Copy_ text={s.codex} /></Step>
          <Step n={++n} title="Live activity: ~/.codex/hooks.json, then approve it once with /hooks"><Copy_ text={s.codexHooks} /></Step>
          <p className="text-[11px] text-white/45">Codex asks you to trust new hooks before they run. Check the field names against your Codex version&apos;s docs if anything doesn&apos;t fire.</p>
        </>
      )}
      {tab === "gemini" && (
        <Step n={++n} title="Merge into ~/.gemini/settings.json (MCP server + hooks)"><Copy_ text={s.gemini} /></Step>
      )}
      {tab === "cursor" && (
        <>
          <Step n={++n} title="Add to ~/.cursor/mcp.json"><Copy_ text={s.cursor} /></Step>
          <Step n={++n} title="Live activity: ~/.cursor/hooks.json"><Copy_ text={s.cursorHooks} /></Step>
          <p className="text-[11px] text-white/45">The Cursor CLI (cursor-agent) currently fires only the shell hooks; the editor fires all of them.</p>
        </>
      )}
      {tab === "opencode" && <Step n={++n} title="Add to opencode.json"><Copy_ text={s.opencode} /></Step>}
      {tab === "other" && (
        <>
          <Step n={++n} title="Most clients (Windsurf, Cline, Grok CLI, Copilot…) accept this shape"><Copy_ text={s.generic} /></Step>
          <Step n={++n} title="Or by hand: server URL + header">
            <Copy_ text={`${origin}/api/mcp`} />
            <div className="h-1.5" />
            <Copy_ text={`Authorization: Bearer ${made.token}`} />
          </Step>
        </>
      )}

      <Step n={++n} title="Standing orders (paste into CLAUDE.md, AGENTS.md, GEMINI.md or your client's rules)">
        <Copy_ text={orders} />
      </Step>

      {(tab === "claude" || tab === "codex" || tab === "gemini") && (
        <Step n={++n} title={tab === "claude" ? "Long shifts: keep it working (run inside Claude Code)" : "Long shifts: one mission every 15 minutes"}>
          <Copy_ text={loopFor(tab)!} />
          <p className="text-[11px] text-white/45 mt-1">{tab === "claude" ? "Claude Code's /loop re-runs the prompt on a schedule while the session is open." : "Headless runs use your client's own sign-in. Check the flags against your installed version."}</p>
        </Step>
      )}
      <p className="text-[11px] text-white/45">Missions are pulled, not pushed: the agent picks them up when it runs and calls <code>ops_checkin</code>.</p>
    </div>
  );
}

function Honest({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-white/[0.05] border border-white/10 px-3 py-2 text-xs text-white/70">{children}</p>;
}
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-white/85 mb-1"><span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-[#6b8afd]/20 text-[#c7d2ff] text-[11px] mr-1.5">{n}</span>{title}</p>
      {children}
    </div>
  );
}
export function Copy_({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="relative">
      <pre className="rounded-lg bg-black/50 border border-white/10 p-2.5 pr-10 text-[11px] leading-relaxed text-white/85 overflow-x-auto whitespace-pre-wrap break-all">{text}</pre>
      <button
        onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { toast.error("Couldn't copy. Select the text instead."); } }}
        className="absolute top-1.5 right-1.5 h-7 w-7 rounded-md bg-white/10 hover:bg-white/20 inline-flex items-center justify-center" title="Copy">
        {done ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}
