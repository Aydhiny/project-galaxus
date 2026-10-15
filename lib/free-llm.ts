// Free LLM APIs: when your Claude budget runs out (or for cheap work), agents
// run on free models instead. Pure rules (tested in free-llm.test.ts).
//
// The catalog comes from github.com/open-free-llm-api/awesome-freellm-apis
// (MIT, refreshed daily at freellm.net). Every provider here speaks the
// OpenAI chat-completions API, so one client serves them all. Limits are the
// published free tiers; where a provider reports exact remaining quota in its
// response headers, Galaxus shows that instead of the estimate.

export type FreeProvider = {
  key: string; name: string; baseUrl: string; keyUrl: string; card: "none" | "phone" | "registration";
  models: { id: string; ctx: number }[];
  limits: { rpm: number | null; rpd: number | null; tpd: number | null }; // published free tier (approx.)
  note: string;
  logo?: "googlegemini" | "openrouter" | "mistralai" | "nvidia" | "huggingface";
  gapMs?: number; // minimum gap between two calls (tight per-second limits), lib/free-limits.ts
};

export const FREE_PROVIDERS: FreeProvider[] = [
  {
    key: "groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1", keyUrl: "https://console.groq.com/keys", card: "none",
    models: [{ id: "openai/gpt-oss-120b", ctx: 131_072 }, { id: "llama-3.3-70b-versatile", ctx: 131_072 }, { id: "openai/gpt-oss-20b", ctx: 131_072 }, { id: "llama-3.1-8b-instant", ctx: 131_072 }],
    limits: { rpm: 30, rpd: 1000, tpd: 100_000 }, note: "Fastest. No card. Reports exact remaining requests per day.",
  },
  {
    key: "gemini", name: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", keyUrl: "https://aistudio.google.com/apikey", card: "none",
    models: [{ id: "gemini-3.8-flash", ctx: 1_000_000 }, { id: "gemini-3.5-flash-lite", ctx: 1_000_000 }, { id: "gemini-3.6-flash", ctx: 1_000_000 }, { id: "gemini-3.1-flash-lite", ctx: 1_000_000 }],
    limits: { rpm: 15, rpd: 1500, tpd: null }, note: "Huge context, generous daily limit. No card.", logo: "googlegemini",
  },
  {
    key: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", keyUrl: "https://openrouter.ai/keys", card: "registration",
    models: [{ id: "nvidia/nemotron-3-ultra-550b-a55b:free", ctx: 1_000_000 }, { id: "nvidia/nemotron-3.5-lightning:free", ctx: 1_000_000 }, { id: "poolside/laguna-s-2.1:free", ctx: 262_144 }],
    limits: { rpm: 20, rpd: 50, tpd: null }, note: "Many :free models. 50 requests/day free (1,000/day after a one-time $10 top-up).", logo: "openrouter",
  },
  {
    key: "cerebras", name: "Cerebras", baseUrl: "https://api.cerebras.ai/v1", keyUrl: "https://cloud.cerebras.ai", card: "none",
    // Checked 2026-10 (inference-docs.cerebras.ai): shared inference serves these two.
    models: [{ id: "gpt-oss-120b", ctx: 131_072 }, { id: "qwen-3.8-27b", ctx: 131_072 }],
    limits: { rpm: 10, rpd: 100, tpd: 1_000_000 }, note: "Very fast, 1M tokens a day. No card.",
  },
  {
    key: "mistral", name: "Mistral AI", baseUrl: "https://api.mistral.ai/v1", keyUrl: "https://console.mistral.ai/api-keys", card: "none",
    models: [{ id: "mistral-small-latest", ctx: 131_072 }, { id: "mistral-medium-latest", ctx: 131_072 }],
    limits: { rpm: 60, rpd: null, tpd: 500_000 }, note: "Free experiment tier (~1 request/second, so calls are spaced). No card.", logo: "mistralai", gapMs: 1_500,
  },
  {
    key: "nvidia", name: "NVIDIA NIM", baseUrl: "https://integrate.api.nvidia.com/v1", keyUrl: "https://build.nvidia.com", card: "phone",
    // Checked 2026-10 against integrate.api.nvidia.com/v1/models (glm-5.2 is gone).
    models: [{ id: "z-ai/glm-5.3-flash", ctx: 1_000_000 }, { id: "z-ai/glm-5.3", ctx: 1_000_000 }, { id: "openai/gpt-oss-20b", ctx: 131_072 }],
    limits: { rpm: 40, rpd: null, tpd: null }, note: "Many free models. Needs phone verification.", logo: "nvidia", gapMs: 1_500,
  },
  {
    key: "llm7", name: "LLM7.io", baseUrl: "https://api.llm7.io/v1", keyUrl: "https://token.llm7.io", card: "none",
    // Checked 2026-10 against api.llm7.io/v1/models: the free ("turbo") models with good availability.
    // "gpt-oss-20b" is now "gpt-oss:20b" (the old id answers 400 model_unavailable); minimax-m2.7 was down most of the time.
    models: [{ id: "gpt-oss:20b", ctx: 128_000 }, { id: "GLM-5.3-Flash", ctx: 128_000 }, { id: "mistral-Nemo-Instruct-2407", ctx: 128_000 }, { id: "codestral-latest", ctx: 128_000 }],
    limits: { rpm: 60, rpd: 6000, tpd: null }, note: "60/min, 250/hour. Works even without a key (lower limits).", gapMs: 1_000,
  },
  {
    key: "huggingface", name: "Hugging Face", baseUrl: "https://router.huggingface.co/v1", keyUrl: "https://huggingface.co/settings/tokens", card: "none",
    models: [{ id: "meta-llama/Llama-3.1-8B-Instruct", ctx: 128_000 }],
    limits: { rpm: null, rpd: null, tpd: null }, note: "Small monthly free credit.", logo: "huggingface",
  },
  {
    // github.com/diegosouzapw/OmniRoute: a gateway YOU run (PC or VPS) that routes "auto" across 150+ free tiers
    // with its own fallback. Galaxus is on Vercel, so it must be reachable over https (e.g. a Cloudflare tunnel).
    key: "omniroute", name: "OmniRoute (your gateway)", baseUrl: "", keyUrl: "https://github.com/diegosouzapw/OmniRoute", card: "none",
    models: [{ id: "auto", ctx: 128_000 }], limits: { rpm: null, rpd: null, tpd: null },
    note: "Your own gateway over 150+ free tiers, with its own automatic fallback. Runs on your PC or a VPS; paste its https URL (…/v1) and the key from its Dashboard → Endpoints.",
  },
  {
    key: "custom", name: "Custom (any OpenAI-compatible)", baseUrl: "", keyUrl: "https://freellm.net", card: "registration",
    models: [], limits: { rpm: null, rpd: null, tpd: null }, note: "Any provider from the directory: paste its base URL and model id.",
  },
];

export const freeProvider = (key: string) => FREE_PROVIDERS.find((p) => p.key === key) ?? null;
export const DIRECTORY_URL = "https://github.com/open-free-llm-api/awesome-freellm-apis";

export type FreeKeyState = {
  provider: string; enabled: boolean; priority: number; day: string | null; requests: number; tokens: number;
  remainingRequests: number | null; limitRequests: number | null; remainingTokens: number | null; headersAt: Date | string | null;
  cooldownUntil: Date | string | null;
  healthFails?: number; // failed health checks in a row (lib/free-health.ts)
};

/** Failed this many hourly health checks in a row: shown as "unhealthy" and tried last, until it passes again. */
export const UNHEALTHY_AFTER = 3;
export const isUnhealthy = (k: Pick<FreeKeyState, "healthFails">) => (k.healthFails ?? 0) >= UNHEALTHY_AFTER;

/** What's left today: exact (from the provider's headers, if recent) or estimated (published limit − what we used). */
export function remainingToday(k: FreeKeyState, today: string, now = Date.now()) {
  const used = k.day === today ? k.requests : 0;
  const usedTokens = k.day === today ? k.tokens : 0;
  const fresh = k.headersAt && now - new Date(k.headersAt).getTime() < 3_600_000 && k.day === today;
  const p = freeProvider(k.provider);
  if (fresh && k.remainingRequests != null) {
    return { requests: k.remainingRequests, limit: k.limitRequests ?? p?.limits.rpd ?? null, exact: true, used, usedTokens };
  }
  const rpd = p?.limits.rpd ?? null;
  return { requests: rpd != null ? Math.max(0, rpd - used) : null, limit: rpd, exact: false, used, usedTokens };
}

/** Can we use this key right now? */
export function usable(k: FreeKeyState, today: string, now = Date.now()) {
  if (!k.enabled) return false;
  if (k.cooldownUntil && new Date(k.cooldownUntil).getTime() > now) return false;
  const r = remainingToday(k, today, now);
  if (r.requests != null && r.requests <= 0) return false;
  const tpd = freeProvider(k.provider)?.limits.tpd;
  return !(tpd != null && r.usedTokens >= tpd);
}

/** Usable keys, best first: healthy before unhealthy, then your priority order, then the most headroom. */
export function pickOrder<T extends FreeKeyState>(keys: T[], today: string, now = Date.now()): T[] {
  return keys.filter((k) => usable(k, today, now)).sort((a, b) => Number(isUnhealthy(a)) - Number(isUnhealthy(b)) || a.priority - b.priority || (remainingToday(b, today, now).requests ?? 1e9) - (remainingToday(a, today, now).requests ?? 1e9));
}

/** Rate-limit headers (Groq, Cerebras, OpenAI-style) → remaining/limit, if the provider sends them. */
export function readRateHeaders(h: { get(name: string): string | null }) {
  const num = (...names: string[]) => { for (const n of names) { const v = h.get(n); if (v != null && v !== "" && Number.isFinite(Number(v))) return Number(v); } return null; };
  return {
    remainingRequests: num("x-ratelimit-remaining-requests-day", "x-ratelimit-remaining-requests"),
    limitRequests: num("x-ratelimit-limit-requests-day", "x-ratelimit-limit-requests"),
    remainingTokens: num("x-ratelimit-remaining-tokens-day", "x-ratelimit-remaining-tokens"),
  };
}

/**
 * How long to rest a provider after an error: honour Retry-After; a daily
 * quota (402, "quota", "per day") rests until tomorrow; a burst limit a minute;
 * a broken key or model 6 hours (fix it in settings).
 */
/**
 * Did the provider say this MODEL is the problem (not the key or the quota)?
 * Then another model on the same provider may well work: "missing" = doesn't
 * exist / no access, "busy" = overloaded right now.
 */
export function modelTrouble(status: number, body: string): "missing" | "busy" | null {
  if (status === 404 || /model_not_found|model_unavailable|does not exist|not found for API version|is not supported/i.test(body)) return "missing";
  // A 400 about the model (LLM7: "Model 'x' is currently unavailable") won't pass by waiting: try another model.
  if (status === 400 && /currently unavailable|not available|unknown model|invalid model/i.test(body)) return "missing";
  if (status === 503 || status === 529 || /overloaded|high demand|UNAVAILABLE|currently unavailable|temporarily unavailable|Empty answer/i.test(body)) return "busy";
  return null;
}

/** The models to try on one provider: yours first, then the catalog's others, then (if it listed them) what your key can use. */
export function modelsToTry(provider: string, mine: string, available: string[] = [], max = 3) {
  const catalog = freeProvider(provider)?.models.map((m) => m.id) ?? [];
  const listed = available.length ? catalog.filter((m) => available.includes(m)) : [];
  const rest = available.length ? listed : catalog;
  return [...new Set([mine, ...rest, ...(available.length && !listed.length ? available.filter((m) => !/embed|whisper|tts|guard|vision|image|audio/i.test(m)).slice(0, 2) : [])])].slice(0, max);
}

export function cooldownMs(status: number, body: string, retryAfter: string | null) {
  const ra = retryAfter != null ? Number(retryAfter) : NaN;
  if (Number.isFinite(ra) && ra > 0) return Math.min(ra * 1000, 24 * 3_600_000);
  if (status === 402 || /quota|per day|daily|credits|insufficient/i.test(body)) return 6 * 3_600_000;
  if (status === 429) return 60_000;
  if (status === 401 || status === 403 || status === 404) return 6 * 3_600_000;
  return 5 * 60_000; // 5xx, timeouts
}

