// Provider error bodies end up in DB fields the UI shows (free_llm_keys.last_error,
// mission notes, "Every free model failed (…)" messages). Some providers echo
// the key back ("Incorrect API key provided: gsk_live_…"). scrubSecret() removes
// the exact key we sent, any long fragment of it, and anything shaped like a
// common API key, before such text is stored or shown.

const KEY_SHAPES: RegExp[] = [
  /\bglx_[\w-]{8,}/g, // Galaxus API tokens
  /\bsk-[\w-]{12,}/g, // OpenAI / Anthropic / OpenRouter / DeepSeek…
  /\bgsk_[\w-]{12,}/g, // Groq
  /\bAIza[\w-]{20,}/g, // Google
  /\b(?:ghp|gho|ghu|ghs|github_pat)_\w{10,}/g, // GitHub
  /\bxox[abpr]-[\w-]{10,}/g, // Slack
  /\bnvapi-[\w-]{12,}/g, // NVIDIA
  /\bhf_[\w]{12,}/g, // Hugging Face
  /\bBearer\s+[\w.~+/-]{8,}=*/gi,
  /\b(?:api[_-]?key|access[_-]?token|secret|token|password|authorization)\s*[=:]\s*["']?[^\s"',;]{6,}/gi,
];

export function scrubSecret(text: string, ...secrets: (string | null | undefined)[]): string {
  let out = String(text ?? "");
  for (const s of secrets) {
    if (!s || s.length < 6) continue;
    out = out.split(s).join("[key]");
    // Providers often show only part of the key ("sk-ab…wxyz"): drop any 12+ char run of it too.
    for (let i = 0; i + 12 <= s.length; i += 6) {
      const frag = s.slice(i, i + 12);
      if (out.includes(frag)) out = out.split(frag).join("[key]");
    }
  }
  return KEY_SHAPES.reduce((acc, re) => acc.replace(re, "[key]"), out);
}
