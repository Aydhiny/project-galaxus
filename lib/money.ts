// Money — pure helpers (tested in money.test.ts). Everything is shown in KM.
// EUR is pegged by law (currency board): 1 EUR = 1.95583 KM, exactly.

export const EUR_TO_KM = 1.95583;
export const CURRENCIES = ["KM", "EUR", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const INCOME_SOURCES = ["client", "retainer", "beat", "gig", "stripe", "other"] as const;
export type IncomeSource = (typeof INCOME_SOURCES)[number];

export const SOURCE_META: Record<IncomeSource, { label: string; color: string }> = {
  client: { label: "Web clients", color: "#0ea5e9" },
  retainer: { label: "Retainers", color: "#10b981" },
  beat: { label: "Beats", color: "#8b5cf6" },
  gig: { label: "Gigs", color: "#f59e0b" },
  stripe: { label: "Stripe", color: "#6366f1" },
  other: { label: "Other", color: "#94a3b8" },
};

/** Original amount (cents) → KM cents. */
export function toKmCents(amountCents: number, currency: string, usdToKm: number): number {
  const c = currency.toUpperCase();
  if (c === "KM" || c === "BAM") return Math.round(amountCents);
  if (c === "EUR") return Math.round(amountCents * EUR_TO_KM);
  if (c === "USD") return Math.round(amountCents * usdToKm);
  throw new Error(`Unsupported currency ${currency}`);
}

export const formatKm = (cents: number) => `${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })} KM`;

export type MoneyRow = { source: string; amountKmCents: number; receivedAt: Date | string };

const monthOf = (d: Date | string) => new Date(d).toISOString().slice(0, 7);

/** Last `n` months (oldest first) with totals per source. */
export function monthlySeries(rows: MoneyRow[], thisMonth: string, n = 6) {
  const months: string[] = [];
  const [y, m] = thisMonth.split("-").map(Number);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    months.push(d.toISOString().slice(0, 7));
  }
  return months.map((month) => {
    const entry: Record<string, number | string> = { month };
    for (const r of rows) {
      if (monthOf(r.receivedAt) !== month) continue;
      entry[r.source] = ((entry[r.source] as number) ?? 0) + r.amountKmCents / 100;
    }
    return entry;
  });
}

export function monthSummary(rows: MoneyRow[], month: string, goalKm: number | null) {
  const inMonth = rows.filter((r) => monthOf(r.receivedAt) === month);
  const totalCents = inMonth.reduce((s, r) => s + r.amountKmCents, 0);
  const bySource: Record<string, number> = {};
  for (const r of inMonth) bySource[r.source] = (bySource[r.source] ?? 0) + r.amountKmCents;
  return {
    totalCents,
    bySource,
    goalPct: goalKm ? Math.min(100, Math.round((totalCents / 100 / goalKm) * 100)) : null,
  };
}

/** Monthly recurring revenue from client retainers (KM). */
export const mrrKm = (clients: { retainerKm: number | null }[]) => clients.reduce((s, c) => s + (c.retainerKm ?? 0), 0);
