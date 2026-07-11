export type Plan = "free" | "pro";

export interface PlanLimits {
  /** Max days of history a plan can query. null = unlimited. */
  historyDays: number | null;
  /** Streak freezes granted per calendar month. */
  streakFreezesPerMonth: number;
}

const LIMITS: Record<Plan, PlanLimits> = {
  free: { historyDays: 30, streakFreezesPerMonth: 1 },
  pro: { historyDays: null, streakFreezesPerMonth: 3 },
};

export function getPlanLimits(plan: string): PlanLimits {
  return LIMITS[plan as Plan] ?? LIMITS.free;
}

/** Clamps a requested history window to what the plan allows. */
export function clampHistoryDays(plan: string, requestedDays: number): number {
  const { historyDays } = getPlanLimits(plan);
  if (historyDays === null) return requestedDays;
  return Math.min(requestedDays, historyDays);
}

/** Derives our internal plan tier from a Stripe subscription status, stored verbatim on the users row. */
export function planFromSubscriptionStatus(status: string | null): Plan {
  return status === "active" || status === "trialing" ? "pro" : "free";
}
