"use server";

import { revalidatePath } from "next/cache";
import { toResult } from "@/lib/action-result";
import { requireUserId } from "@/lib/auth-session";
import type { Currency } from "@/lib/money";
import { addIncomeFor, deleteIncomeFor, moneyFor, saveMoneySettingsFor, saveStripeKeyFor, syncStripeFor } from "@/lib/services/money";

const refresh = () => revalidatePath("/money");

export async function getMoney() {
  return moneyFor(await requireUserId());
}
export type MoneyState = Awaited<ReturnType<typeof getMoney>>;

export async function addIncome(input: { amount: number; currency: Currency; source: string; description?: string; receivedAt?: string }) {
  return toResult(async () => { await addIncomeFor(await requireUserId(), input); refresh(); });
}

export async function deleteIncome(id: number) {
  return toResult(async () => { await deleteIncomeFor(await requireUserId(), id); refresh(); });
}

export async function saveMoneySettings(patch: { goalKm?: number | null; usdToKm?: number }) {
  return toResult(async () => { await saveMoneySettingsFor(await requireUserId(), patch); refresh(); });
}

export async function saveStripeKey(key: string) {
  return toResult(async () => {
    const userId = await requireUserId();
    await saveStripeKeyFor(userId, key);
    const r = key.trim() ? await syncStripeFor(userId) : { synced: 0 };
    refresh();
    return r;
  });
}
