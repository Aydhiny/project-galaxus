// Client entry points for lib/actions/money.ts (readable errors, see lib/action-result.ts).
import { unwrapped } from "@/lib/action-result";
import { addIncome, deleteIncome, saveMoneySettings, saveStripeKey } from "@/lib/actions/money";

export const addIncomeC = unwrapped(addIncome);
export const deleteIncomeC = unwrapped(deleteIncome);
export const saveMoneySettingsC = unwrapped(saveMoneySettings);
export const saveStripeKeyC = unwrapped(saveStripeKey);
export type { MoneyState } from "@/lib/actions/money";
