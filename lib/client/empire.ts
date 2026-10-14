// Client entry point for lib/actions/empire.ts (readable errors, see lib/action-result.ts).
import { unwrapped } from "@/lib/action-result";
import { findWeatherPlaces, getEmpire, getInterior, getPublicEmpire, getWeatherPlace, saveEmpireSharing, saveEmpireStyle, saveWeatherPlace } from "@/lib/actions/empire";

export const getEmpireC = unwrapped(getEmpire);
export const getInteriorC = unwrapped(getInterior);
export const saveEmpireStyleC = unwrapped(saveEmpireStyle);
export const getPublicEmpireC = unwrapped(getPublicEmpire);
export const saveEmpireSharingC = unwrapped(saveEmpireSharing);
export const getWeatherPlaceC = unwrapped(getWeatherPlace);
export const findWeatherPlacesC = unwrapped(findWeatherPlaces);
export const saveWeatherPlaceC = unwrapped(saveWeatherPlace);
export type { EmpireState, Building, Bubble } from "@/lib/services/empire";
export type { World, WorldEvent, Airship, GoalSite, Weather, SkyNow, Citizen, Season, EmpireStyle } from "@/lib/empire-world";
export type { Interior } from "@/lib/services/empire-extras";
export type { PublicEmpire, PublicCity } from "@/lib/services/empire-social";
