import { create } from "zustand";
import type { Spot } from "@/components/empire/room-engine";

/** Where the faded page room looks. Pages set it when you switch tabs; it resets on navigation. */
export const useRoomSpot = create<{ spot: Spot; set: (s: Spot) => void }>()((set) => ({ spot: "overview", set: (spot) => set({ spot }) }));
export const setRoomSpot = (s: Spot) => useRoomSpot.getState().set(s);
