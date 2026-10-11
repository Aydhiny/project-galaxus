// Community scout — pure logic (tested in community.test.ts): finding Discord
// invite codes in text, and how relevant a server is to the work you do.

export const COMMUNITY_TOPICS = [
  { key: "ai", label: "AI & automation", emoji: "🤖", words: ["ai", "automation", "n8n", "zapier", "make.com", "agents", "llm", "gpt", "openai", "claude", "prompt", "chatbot", "machine learning"] },
  { key: "vibe", label: "Vibe coding", emoji: "⚡", words: ["vibe", "cursor", "lovable", "bolt", "replit", "v0", "indie hacker", "indiehacker", "saas", "side project", "build in public", "nocode", "no-code", "low-code"] },
  { key: "video", label: "Video editing", emoji: "🎬", words: ["video", "editing", "editor", "premiere", "after effects", "davinci", "capcut", "motion", "youtube", "content creator", "shorts", "tiktok", "creators"] },
  { key: "web", label: "Web dev", emoji: "💻", words: ["web", "javascript", "typescript", "react", "next.js", "nextjs", "frontend", "full stack", "fullstack", "node", ".net", "c#", "developer", "programming", "coding"] },
  { key: "clients", label: "Freelance & clients", emoji: "💼", words: ["freelance", "freelancer", "clients", "agency", "hiring", "jobs", "gigs", "work", "business", "entrepreneur", "startup", "founders", "marketing"] },
  { key: "games", label: "Game dev", emoji: "🎮", words: ["game dev", "gamedev", "unity", "unreal", "godot", "indie game"] },
] as const;
export type CommunityTopic = (typeof COMMUNITY_TOPICS)[number]["key"];

/** discord.gg/abc, discord.com/invite/abc, discordapp.com/invite/abc → ["abc"] */
export function extractInviteCodes(text: string): string[] {
  const codes = new Set<string>();
  for (const m of text.matchAll(/(?:discord\.gg|discord(?:app)?\.com\/invite)\/([A-Za-z0-9-]{2,32})/gi)) codes.add(m[1]);
  return [...codes];
}

const wordHit = (hay: string, w: string) =>
  w.length <= 3 ? new RegExp(`(^|[^a-z0-9])${w.replace(/[.+]/g, "\\$&")}([^a-z0-9]|$)`).test(hay) : hay.includes(w);

/** Which of your topics a server is about, and a 0–100 relevance score. */
export function classifyCommunity(name: string, description: string | null): { topics: CommunityTopic[]; relevance: number } {
  const hay = `${name} ${description ?? ""}`.toLowerCase();
  const topics: CommunityTopic[] = [];
  let hits = 0;
  for (const t of COMMUNITY_TOPICS) {
    const n = t.words.filter((w) => wordHit(hay, w)).length;
    if (n > 0) { topics.push(t.key); hits += n; }
  }
  // Servers that bring clients / work together score extra — that's where money is.
  const money = /\b(clients?|hiring|jobs?|gigs?|freelanc\w*|commissions?|paid work|networking)\b/.test(hay) ? 20 : 0;
  return { topics, relevance: Math.min(100, hits * 15 + money) };
}

/** Big enough to be alive, small enough that you get noticed: rank by relevance, then by a gentle size curve. */
export function communityRank(c: { relevance: number; members: number | null; online: number | null }): number {
  const members = c.members ?? 0;
  const activity = members > 0 ? (c.online ?? 0) / members : 0;
  return c.relevance * 2 + Math.min(40, Math.log10(members + 1) * 10) + Math.min(20, activity * 100);
}

export const iconUrl = (guildId: string | null, icon: string | null) =>
  guildId && icon ? `https://cdn.discordapp.com/icons/${guildId}/${icon}.${icon.startsWith("a_") ? "gif" : "png"}?size=128` : null;
