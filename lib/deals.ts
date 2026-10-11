// Deal Desk — pure logic (tested in deals.test.ts). Every conversation you
// have with a potential client (autopilot emails, gigs you applied to,
// outreach leads) becomes one deal moving through stages; the AI/rules run
// it until there's an agreement, then it's handed to you.

export const DEAL_STAGES = [
  { key: "contacted", label: "Contacted", emoji: "📨" },
  { key: "talking", label: "Talking", emoji: "💬" },
  { key: "negotiating", label: "Negotiating", emoji: "🤝" },
  { key: "ready", label: "Ready for you", emoji: "🎯" },
  { key: "won", label: "Won", emoji: "🏆" },
  { key: "lost", label: "Lost", emoji: "🪦" },
] as const;
export type DealStage = (typeof DEAL_STAGES)[number]["key"];
export const isDealStage = (v: unknown): v is DealStage => DEAL_STAGES.some((s) => s.key === v);

/**
 * "Let's do it", "send the invoice", "when can you start?" — the client is
 * agreeing. From here a human closes: price, deadline and payment are yours.
 */
export function detectAgreement(text: string): boolean {
  const t = text.toLowerCase();
  if (/\b(not interested|no thanks|went with|someone else|pass on|not (a )?fit|unfortunately)\b/.test(t)) return false;
  return /\b(let'?s (do it|go|proceed|start|get started)|deal\b|sounds (good|great|perfect)[,.! ]+(let'?s|when|go|send)|you'?re hired|we'?d like to (hire|work with|proceed)|go ahead|send (me |us )?(the |an |your )?(invoice|contract|payment details|paypal)|how (do|can) (i|we) pay|when can you start|can you start|accepted|approved|it'?s a deal|agreed|count me in|book(ed)? (it|you))\b/.test(t);
}

/** A price mentioned in a message → KM (USD/EUR/KM), for the deal's value. */
export function priceToKm(text: string, usdToKm = 1.8): number | null {
  const m = text.match(/(?:([$€])\s?(\d[\d,.]*)\s?(k)?)|(?:(\d[\d,.]*)\s?(k)?\s?(km|bam|eur|euro|usd|\$|€))/i);
  if (!m) return null;
  const num = parseFloat((m[2] ?? m[4]).replace(/,/g, "")) * ((m[3] ?? m[5]) ? 1000 : 1);
  if (!num || num > 500_000) return null;
  const cur = (m[1] ?? m[6] ?? "").toLowerCase();
  const rate = cur === "€" || cur.startsWith("eur") ? 1.95583 : cur === "km" || cur === "bam" ? 1 : usdToKm;
  return Math.round(num * rate);
}

type EmailLike = { status: string; replyCount: number; category: string | null; lastReplyText: string | null };
type LeadLike = { status: string };

export function stageFromEmail(e: EmailLike): DealStage {
  if (e.category === "rejection" || e.category === "scam") return "lost";
  if (e.lastReplyText && detectAgreement(e.lastReplyText)) return "ready";
  if (e.category === "negotiation") return "negotiating";
  if (e.replyCount > 0) return "talking";
  return "contacted";
}

export function stageFromLead(l: LeadLike): DealStage | null {
  switch (l.status) {
    case "sent": return "contacted";
    case "replied": return "talking";
    case "meeting": return "negotiating";
    case "client": return "won";
    case "not_interested": case "do_not_contact": return "lost";
    default: return null; // not contacted yet — not a deal
  }
}
