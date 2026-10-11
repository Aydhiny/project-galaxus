// Client entry point for lib/actions/hud.ts (readable errors, see lib/action-result.ts).
import { unwrapped } from "@/lib/action-result";
import { getHud } from "@/lib/actions/hud";

export const getHudC = unwrapped(getHud);
export type { Hud } from "@/lib/services/hud";
