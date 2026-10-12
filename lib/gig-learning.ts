// Gig radar's learning system — pure, tested in gig-learning.test.ts.
//
// A small logistic-regression model per user, trained on your reviews
// (👍/👎) plus weaker signals (applied / saved = good, dismissed = bad).
// Features are what a person would look at: words in the title and post,
// the subreddit, the source, the gig type, the pay level, one-time vs
// full-time. It's retrained from scratch after every review (a few hundred
// examples train in milliseconds), and its accuracy is measured honestly
// with cross-validation on your own reviews.

import { gigVerdict, payInUsd, type GigSource } from "@/lib/gigs";

export type GigModel = { w: Record<string, number>; b: number; samples: number; positives: number; accuracy: number | null };
export type Example = { features: string[]; y: 0 | 1; weight: number };

export const EMPTY_MODEL: GigModel = { w: {}, b: 0, samples: 0, positives: 0, accuracy: null };
/** Reviews needed before an accuracy number means anything (learning itself starts at the first one). */
export const MIN_REVIEWS = 8;

export const DOWN_REASONS = [
  { key: "low_pay", label: "Too little pay" },
  { key: "full_time", label: "Full-time / long-term" },
  { key: "not_skill", label: "Not my skill" },
  { key: "not_client", label: "Not a real client" },
  { key: "sketchy", label: "Sketchy / scam" },
  { key: "too_big", label: "Too much work" },
] as const;
export const UP_REASONS = [
  { key: "one_time", label: "One-time" },
  { key: "good_pay", label: "Good pay" },
  { key: "my_skill", label: "My skill" },
  { key: "quick_win", label: "Quick win" },
] as const;

const STOP = new Set(("the and for with you your are this that from have will need looking someone who our can any all but not get just like want "
  + "they them their what when where how more about into also would could should been were was has had its it's i'm we're dm me my hi hello thanks "
  + "please work job post edit edits editing video videos").split(" "));
const words = (s: string) => [...new Set(s.toLowerCase().replace(/https?:\/\/\S+/g, " ").match(/[a-z][a-z0-9+#.-]{2,24}/g) ?? [])]
  .map((w) => w.replace(/[.-]+$/, "")).filter((w) => w.length >= 3 && !STOP.has(w));

export type GigLike = { title: string; body: string | null; source: string; url: string; budget: string | null; profileId: number | null; contactEmail?: string | null };

/** What the model sees about a gig. */
export function gigFeatures(g: GigLike): string[] {
  const body = g.body ?? "";
  const text = `${g.title} ${body}`;
  const f = new Set<string>();
  for (const w of words(g.title)) f.add(`t:${w}`);
  for (const w of words(body).slice(0, 120)) f.add(`w:${w}`);
  f.add(`src:${g.source}`);
  const sub = g.url.match(/reddit\.com\/r\/([^/]+)/i)?.[1]?.toLowerCase();
  if (sub) f.add(`sub:${sub}`);
  if (g.profileId) f.add(`prof:${g.profileId}`);
  for (const t of gigVerdict({ title: g.title, body, source: g.source as GigSource }).tags) f.add(`tag:${t}`);
  const pay = payInUsd(text);
  if (!pay) f.add("pay:none");
  else {
    f.add(`per:${pay.per}`);
    const total = pay.per === "unit" ? pay.usd * 10 : pay.per === "hour" ? pay.usd * 20 : pay.usd;
    f.add(total < 30 ? "pay:tiny" : total < 150 ? "pay:low" : total < 600 ? "pay:mid" : "pay:high");
  }
  f.add(body.length < 80 ? "len:short" : body.length < 600 ? "len:medium" : "len:long");
  if (g.contactEmail) f.add("has:email");
  return [...f];
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
const norm = (n: number) => 1 / Math.sqrt(Math.max(1, n));

export function predict(m: GigModel, features: string[]): number {
  const x = norm(features.length);
  let z = m.b;
  for (const f of features) z += (m.w[f] ?? 0) * x;
  return sigmoid(z);
}

/** L2-regularised logistic regression, full-batch gradient descent. Rare features (seen once) are ignored to avoid memorising. */
export function train(examples: Example[], opts = { epochs: 150, lr: 1.2, l2: 0.01, minCount: 2 }): GigModel {
  const counts = new Map<string, number>();
  for (const e of examples) for (const f of e.features) counts.set(f, (counts.get(f) ?? 0) + 1);
  const keep = (f: string) => (counts.get(f) ?? 0) >= opts.minCount;
  const data = examples.map((e) => ({ ...e, features: e.features.filter(keep), x: norm(e.features.length) }));
  const w: Record<string, number> = {};
  let b = 0;
  const totalWeight = data.reduce((s, e) => s + e.weight, 0) || 1;
  for (let epoch = 0; epoch < opts.epochs; epoch++) {
    const grad: Record<string, number> = {};
    let gb = 0;
    for (const e of data) {
      let z = b;
      for (const f of e.features) z += (w[f] ?? 0) * e.x;
      const err = (sigmoid(z) - e.y) * e.weight;
      gb += err;
      for (const f of e.features) grad[f] = (grad[f] ?? 0) + err * e.x;
    }
    b -= (opts.lr * gb) / totalWeight;
    for (const f of Object.keys(grad)) w[f] = (w[f] ?? 0) - opts.lr * (grad[f] / totalWeight + opts.l2 * (w[f] ?? 0));
  }
  for (const f of Object.keys(w)) if (Math.abs(w[f]) < 0.01) delete w[f];
  return { w, b, samples: examples.length, positives: examples.filter((e) => e.y === 1).length, accuracy: null };
}

/**
 * Honest accuracy: k-fold cross-validation on your explicit reviews only —
 * each review is predicted by a model that never saw it.
 */
export function crossValidate(examples: Example[], reviewedOnly: Example[], k = 5): number | null {
  const pos = reviewedOnly.filter((e) => e.y === 1).length;
  if (reviewedOnly.length < MIN_REVIEWS || pos === 0 || pos === reviewedOnly.length) return null;
  const folds = Math.min(k, reviewedOnly.length);
  let correct = 0;
  for (let i = 0; i < folds; i++) {
    const test = reviewedOnly.filter((_, j) => j % folds === i);
    const testSet = new Set(test);
    const m = train(examples.filter((e) => !testSet.has(e)));
    for (const e of test) if ((predict(m, e.features) >= 0.5 ? 1 : 0) === e.y) correct++;
  }
  return Math.round((correct / reviewedOnly.length) * 100);
}

// Always on: every review shifts the ranking. Influence starts small and grows
// with evidence, so one 👎 nudges the list instead of flipping it.
export const modelReady = (m: GigModel) => m.samples >= 1;

/** Final score: your taste (once learned) weighs more than the generic keyword score. */
export function blendScore(base: number, p: number | null, m: GigModel): number {
  if (p == null || !modelReady(m)) return base;
  const trust = Math.min(0.75, 0.15 + m.samples / 40); // 1 review ≈ 18%, 24+ ≈ 75%
  return Math.round((1 - trust) * base + trust * p * 100);
}

export function featureLabel(f: string): string {
  const [k, v] = [f.slice(0, f.indexOf(":")), f.slice(f.indexOf(":") + 1)];
  switch (k) {
    case "t": case "w": return `“${v}”`;
    case "sub": return `r/${v}`;
    case "src": return { reddit: "Reddit", remotive: "Remotive", remoteok: "RemoteOK", wwr: "We Work Remotely", hn: "Hacker News" }[v] ?? v;
    case "tag": return v;
    case "pay": return { none: "no budget given", tiny: "tiny budget", low: "low budget", mid: "mid budget", high: "good budget" }[v] ?? v;
    case "per": return { unit: "paid per video", hour: "hourly", month: "monthly pay", total: "fixed price" }[v] ?? v;
    case "len": return `${v} post`;
    case "has": return "email to apply";
    case "prof": return "this gig type";
    default: return f;
  }
}

/** The 2 biggest reasons up and down for one gig — shown on the card. */
export function explain(m: GigModel, features: string[]): { likes: string[]; dislikes: string[] } {
  const contrib = features.map((f) => [f, m.w[f] ?? 0] as const).filter(([, w]) => Math.abs(w) > 0.05);
  return {
    likes: contrib.filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([f]) => featureLabel(f)),
    dislikes: contrib.filter(([, w]) => w < 0).sort((a, b) => a[1] - b[1]).slice(0, 2).map(([f]) => featureLabel(f)),
  };
}

/** What the model has learned overall — for the panel. */
export function topFeatures(m: GigModel, n = 8): { likes: string[]; dislikes: string[] } {
  const all = Object.entries(m.w).filter(([f]) => !f.startsWith("prof:"));
  return {
    likes: all.filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).slice(0, n).map(([f]) => featureLabel(f)),
    dislikes: all.filter(([, w]) => w < 0).sort((a, b) => a[1] - b[1]).slice(0, n).map(([f]) => featureLabel(f)),
  };
}

/** Review reasons become features too, so "too little pay" teaches faster than a bare 👎. */
export function reasonFeatures(reasons: string[]): string[] {
  const map: Record<string, string[]> = {
    low_pay: ["pay:tiny", "pay:low", "tag:low pay"], full_time: ["tag:full-time"], good_pay: ["pay:mid", "pay:high"], one_time: ["tag:one-time"],
  };
  return reasons.flatMap((r) => map[r] ?? []);
}
