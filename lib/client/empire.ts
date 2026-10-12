// Client entry point for lib/actions/empire.ts (readable errors, see lib/action-result.ts).
import { unwrapped } from "@/lib/action-result";
import { getEmpire, getPublicEmpire, saveEmpireSharing } from "@/lib/actions/empire";

export const getEmpireC = unwrapped(getEmpire);
export const getPublicEmpireC = unwrapped(getPublicEmpire);
export const saveEmpireSharingC = unwrapped(saveEmpireSharing);
export type { EmpireState, Building, Bubble } from "@/lib/services/empire";
export type { World, WorldEvent, Airship, GoalSite, Weather } from "@/lib/empire-world";
export type { PublicEmpire, PublicCity } from "@/lib/services/empire-social";
