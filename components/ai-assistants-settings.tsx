"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { Bot, Check, Copy, KeyRound, Loader2, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createApiToken, listApiTokens, revokeApiToken } from "@/lib/actions/api-tokens";

type TokenRow = Awaited<ReturnType<typeof listApiTokens>>[number];
type Client = "claude-code" | "claude-desktop" | "cursor" | "vscode";

const CLIENTS: { id: Client; label: string }[] = [
  { id: "claude-code", label: "Claude Code" },
  { id: "claude-desktop", label: "Claude Desktop" },
  { id: "cursor", label: "Cursor" },
  { id: "vscode", label: "VS Code" },
];

function snippet(client: Client, url: string, token: string): { hint: string; code: string } {
  switch (client) {
    case "claude-code":
      return {
        hint: "Run once in your terminal:",
        code: `claude mcp add --transport http galaxus ${url} --header "Authorization: Bearer ${token}"`,
      };
    case "claude-desktop":
      return {
        hint: "Settings → Developer → Edit config, add this, then restart Claude Desktop:",
        code: JSON.stringify({
          mcpServers: {
            galaxus: {
              command: "npx",
              args: ["-y", "mcp-remote", url, "--header", "Authorization:${AUTH_HEADER}"],
              env: { AUTH_HEADER: `Bearer ${token}` },
            },
          },
        }, null, 2),
      };
    case "cursor":
      return {
        hint: "Add to ~/.cursor/mcp.json (or .cursor/mcp.json in a project):",
        code: JSON.stringify({ mcpServers: { galaxus: { url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2),
      };
    case "vscode":
      return {
        hint: "Add to .vscode/mcp.json (or your user MCP settings):",
        code: JSON.stringify({ servers: { galaxus: { type: "http", url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2),
      };
  }
}

export function AiAssistantsSettings() {
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [name, setName] = useState("Claude");
  const [fresh, setFresh] = useState<string | null>(null); // raw token, shown once
  const [client, setClient] = useState<Client>("claude-code");
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    listApiTokens().then((t) => { if (alive) setTokens(t); });
    return () => { alive = false; };
  }, []);
  // The real origin on the client (works on any domain / preview URL); the
  // production URL during SSR.
  const origin = useSyncExternalStore(() => () => {}, () => window.location.origin, () => "https://project-galaxus.vercel.app");

  const url = `${origin}/api/mcp`;
  const s = snippet(client, url, fresh ?? "glx_YOUR_TOKEN");

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Couldn't copy — select the text and copy it manually.");
    }
  }

  function create() {
    startTransition(async () => {
      try {
        const { token, row } = await createApiToken(name);
        setFresh(token);
        setTokens((ts) => [{ ...row, lastUsedAt: null }, ...(ts ?? [])]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't create a token.");
      }
    });
  }

  return (
    <Card id="ai" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Bot className="w-4 h-4" /> AI assistants</CardTitle>
        <CardDescription>
          Connect Claude, Cursor or any MCP-compatible AI to plan monthly goals and manage tasks with you —
          e.g. “Make me a handstand plan for October, beginner to pro.”
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 1. Token */}
        <div className="space-y-2">
          <p className="text-sm font-medium">1. Create an access token</p>
          <div className="flex gap-2 max-w-md">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (e.g. Claude on laptop)"
              className="flex-1 h-9 rounded-md border border-border bg-transparent px-3 text-sm"
              aria-label="Token name"
            />
            <button onClick={create} disabled={pending} className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-60">
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Create
            </button>
          </div>
          {fresh && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
              <p className="text-xs font-medium">Copy this token now — it won&apos;t be shown again.</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate rounded bg-background px-2 py-1.5 text-xs font-mono">{fresh}</code>
                <button onClick={() => copy(fresh, "token")} className="h-8 px-2.5 rounded-md border border-border text-xs inline-flex items-center gap-1">
                  {copied === "token" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} Copy
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 2. Connect */}
        <div className="space-y-2">
          <p className="text-sm font-medium">2. Connect your assistant</p>
          <div className="inline-flex flex-wrap rounded-lg border border-border p-0.5 bg-muted/50" role="tablist">
            {CLIENTS.map((c) => (
              <button key={c.id} role="tab" aria-selected={client === c.id} onClick={() => setClient(c.id)}
                className={cn("px-2.5 h-7 rounded-md text-xs", client === c.id ? "bg-background shadow-xs font-medium" : "text-muted-foreground hover:text-foreground")}>
                {c.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{s.hint}</p>
          <div className="relative">
            <pre className="rounded-lg border border-border bg-muted/50 p-3 pr-20 text-xs font-mono whitespace-pre-wrap break-all">{s.code}</pre>
            <button onClick={() => copy(s.code, "snippet")} className="absolute top-2 right-2 h-7 px-2 rounded-md border border-border bg-background text-xs inline-flex items-center gap-1">
              {copied === "snippet" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} Copy
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Server URL: <code className="font-mono">{url}</code> · Other MCP clients: use “Streamable HTTP” with an
            <code className="font-mono"> Authorization: Bearer …</code> header.
          </p>
        </div>

        {/* Existing tokens */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Active tokens</p>
          {tokens === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {tokens.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <KeyRound className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      <code className="font-mono">{t.prefix}…</code> · {t.lastUsedAt ? `used ${formatDistanceToNow(new Date(t.lastUsedAt), { addSuffix: true })}` : "never used"}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setTokens((ts) => ts!.filter((x) => x.id !== t.id));
                      revokeApiToken(t.id).then(() => toast.success(`Revoked “${t.name}”`)).catch(() => toast.error("Couldn't revoke."));
                    }}
                    className="h-8 px-2 rounded-md text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 inline-flex items-center gap-1"
                    aria-label={`Revoke ${t.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">Treat tokens like passwords. Revoking one disconnects that assistant immediately.</p>
        </div>
      </CardContent>
    </Card>
  );
}
