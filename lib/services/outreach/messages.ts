// Cold-message writer. Claude when an Anthropic key is set, otherwise the
// Bosnian template in lib/outreach.ts — the engine works either way.

import Anthropic from "@anthropic-ai/sdk";
import { GAP_META, OPT_OUT_LINE, templateMessage, type Gap, type OutreachStats } from "@/lib/outreach";

const MODEL = "claude-opus-5-5";

type DraftLead = {
  name: string;
  category: string | null;
  city: string | null;
  rating: number | null;
  reviewCount: number | null;
  website: string | null;
  gaps: string[];
};

const WRITER_SYSTEM = `You write first-contact WhatsApp messages from a freelance developer in Bosnia and Herzegovina to a local business.

Rules:
- Language: Bosnian (ijekavica), formal "Vi" form, natural and warm — like a real person, not an ad.
- 350–600 characters before the final line. No links, no emojis, no hashtags, no bullet points.
- Open with a greeting and who the sender is (use the sender name given).
- Mention one or two concrete things you noticed about THIS business (its Google rating, the specific website gaps listed). Never invent facts beyond the input.
- Say in one sentence what you would build for them and the benefit (more bookings, fewer phone calls, patients/clients finding them online).
- End with a low-pressure question about a 10-minute call this week.
- First person in the present or future tense only — Bosnian past tense reveals the sender's gender, which you don't know.
- After a blank line, finish with exactly this line: ${OPT_OUT_LINE}
- Output only the message text.`;

function client(apiKey: string) {
  return new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
}

/** Text of a response, or null if Claude (and its fallback) declined. */
async function ask(apiKey: string, system: string, prompt: string, effort: "low" | "medium", maxTokens: number): Promise<string | null> {
  const response = await client(apiKey).beta.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    // A policy decline is retried on Anthropic's recommended fallback model
    // inside the same call, instead of coming back as a refusal.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort },
    system,
    messages: [{ role: "user", content: prompt }],
  });
  if (response.stop_reason === "refusal") return null;
  const text = response.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("")
    .trim();
  return text || null;
}

export async function draftMessage(lead: DraftLead, opts: { senderName: string; offer: string | null; anthropicKey: string | null }) {
  const fallback = () => templateMessage(lead, opts.senderName);
  if (!opts.anthropicKey) return fallback();

  const facts = [
    `Sender name: ${opts.senderName}`,
    `What the sender offers: ${opts.offer || "websites, online booking systems and custom software"}`,
    `Business: ${lead.name}${lead.category ? ` (${lead.category})` : ""}${lead.city ? `, ${lead.city}` : ""}`,
    lead.rating ? `Google rating: ${lead.rating.toFixed(1)} from ${lead.reviewCount ?? 0} reviews` : "Google rating: none",
    `Website: ${lead.website ?? "none"}`,
    `Gaps found: ${lead.gaps.map((g) => GAP_META[g as Gap]?.label ?? g).join(", ") || "none"}`,
  ].join("\n");

  try {
    const text = await ask(opts.anthropicKey, WRITER_SYSTEM, facts, "low", 4000);
    if (!text) return fallback();
    // Guarantee the opt-out line even if the model paraphrased it.
    const withOptOut = text.includes(OPT_OUT_LINE) ? text : `${text}\n\n${OPT_OUT_LINE}`;
    return { text: withOptOut, variant: `claude:${lead.gaps[0] ?? "general"}` };
  } catch (e) {
    console.error("[outreach] Claude draft failed, using template:", e instanceof Error ? e.message : e);
    return fallback();
  }
}

const REVIEW_SYSTEM = `You are a sharp, practical sales coach reviewing one month of cold WhatsApp outreach by a freelance developer in Bosnia and Herzegovina.
Write in English. Be concrete and brief: at most 8 short lines.
Cover: what is working, what isn't, which message angle or gap type to lean into, one change to test next month, and whether the daily volume should change.
Base every claim on the numbers and examples given; if the sample is too small to conclude anything, say so plainly.`;

export async function monthlyReview(
  apiKey: string,
  stats: OutreachStats,
  examples: { replied: string[]; ignored: string[] }
): Promise<string> {
  const prompt = [
    `Stats (JSON):\n${JSON.stringify(stats, null, 2)}`,
    `Messages that got a reply:\n${examples.replied.map((m, i) => `${i + 1}. ${m}`).join("\n\n") || "(none)"}`,
    `Messages with no reply:\n${examples.ignored.map((m, i) => `${i + 1}. ${m}`).join("\n\n") || "(none)"}`,
  ].join("\n\n---\n\n");
  const text = await ask(apiKey, REVIEW_SYSTEM, prompt, "medium", 6000);
  if (!text) throw new Error("Claude declined to review this month.");
  return text;
}
