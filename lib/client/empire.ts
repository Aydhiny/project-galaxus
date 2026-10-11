// Client entry point for lib/actions/empire.ts (readable errors, see lib/action-result.ts).
import { unwrapped } from "@/lib/action-result";
import { getEmpire } from "@/lib/actions/empire";

export const getEmpireC = unwrapped(getEmpire);
export type { EmpireState, Building, Bubble } from "@/lib/services/empire";
