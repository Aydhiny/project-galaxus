// Galaxus MCP endpoint (Model Context Protocol, Streamable HTTP).
//
//   URL:   https://project-galaxus.vercel.app/api/mcp
//   Auth:  Authorization: Bearer glx_…   (create in Settings → AI assistants)
//
// Any MCP client (Claude Code / Desktop, Cursor, VS Code, …) can connect and
// use the tools in lib/mcp/tools.ts. Excluded from the session proxy
// (proxy.ts) because it authenticates each request with its own token.

import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { revalidatePath } from "next/cache";
import { registerGalaxusTools } from "@/lib/mcp/tools";
import { verifyApiToken } from "@/lib/services/api-tokens";
import { checkRateLimit } from "@/lib/ratelimit";
import { recordToolResultFor } from "@/lib/services/voice";

export const maxDuration = 60;

const handler = createMcpHandler(
  (server) => {
    registerGalaxusTools(server, {
      // Writes from an AI show up in the open app on its next refresh.
      onWrite: () => {
        revalidatePath("/tasks");
        revalidatePath("/productivity");
        revalidatePath("/review");
      },
      // Voice runner: record what each call actually changed, for the UI.
      onToolResult: ({ tool, text, userId, scope }) =>
        scope === "voice" ? recordToolResultFor(userId, tool, text) : undefined,
    });
  },
  {
    serverInfo: { name: "galaxus", version: "1.0.0" },
    instructions:
      "Galaxus is the user's personal productivity app: tasks, routines and monthly goals. Call get_overview first. " +
      "To help with a goal, design a phased beginner→pro plan and save it with create_goal_plan. Dates are YYYY-MM-DD, months YYYY-MM.",
  }
);

const authed = withMcpAuth(
  handler,
  async (_req, bearerToken) => {
    const hit = await verifyApiToken(bearerToken);
    if (!hit || hit.scope === "game") return undefined; // → 401 with a WWW-Authenticate challenge
    // Generous limit for AI tool calls, but stops a leaked token being hammered.
    if (!checkRateLimit(`mcp:${hit.tokenId}`, 120, 60_000).allowed) return undefined;
    return {
      token: bearerToken!,
      clientId: `galaxus-token-${hit.tokenId}`,
      scopes: ["tasks:read", "tasks:write"],
      extra: { userId: hit.userId, scope: hit.scope },
    };
  },
  { required: true }
);

export { authed as GET, authed as POST, authed as DELETE };
