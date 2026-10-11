"use client";

// Plays the azan at each prayer time (vaktija.ba times for your city), on any
// page. Uses your uploaded recording; without one, a gentle chime + reminder.
// Also publishes the current prayer so the empire's mosque can glow.

import { useEffect } from "react";
import { create } from "zustand";
import { toast } from "sonner";
import { currentVakat, type Vaktija } from "@/lib/vaktija";
import { getPrayerStateC } from "@/lib/client/prayer";
import { play } from "@/lib/sfx";

type PrayerStore = {
  vaktija: Vaktija | null;
  current: string | null; // bs name of a prayer that started < 15 min ago
  settings: { azanEnabled: boolean; azanFajr: boolean; hasFile: boolean } | null;
  set: (p: Partial<PrayerStore>) => void;
};
export const usePrayerStore = create<PrayerStore>()((set) => ({ vaktija: null, current: null, settings: null, set: (p) => set(p) }));
export const PRAYER_SETTINGS_EVENT = "galaxus:prayer-settings";

const played = (key: string) => { try { return localStorage.getItem(key) === "1"; } catch { return false; } };
const markPlayed = (key: string) => { try { localStorage.setItem(key, "1"); } catch { /* ignore */ } };

let audio: HTMLAudioElement | null = null;
export function playAzan() {
  audio?.pause();
  audio = new Audio("/api/azan");
  return audio.play();
}
export function stopAzan() { audio?.pause(); audio = null; }

export function AzanPlayer() {
  const setStore = usePrayerStore((s) => s.set);

  useEffect(() => {
    const load = () => getPrayerStateC().then((s) => setStore({
      vaktija: s.vaktija, settings: { azanEnabled: s.azanEnabled, azanFajr: s.azanFajr, hasFile: !!s.azanFile },
    })).catch(() => {});
    load();
    const t = setInterval(load, 30 * 60_000);
    window.addEventListener(PRAYER_SETTINGS_EVENT, load);
    return () => { clearInterval(t); window.removeEventListener(PRAYER_SETTINGS_EVENT, load); };
  }, [setStore]);

  useEffect(() => {
    const check = () => {
      const { vaktija, settings } = usePrayerStore.getState();
      if (!vaktija) return;
      const now = new Date();
      const cur = currentVakat(vaktija, now);
      setStore({ current: cur?.bs ?? null });
      if (!cur || !settings?.azanEnabled) return;
      if (cur.key === "fajr" && !settings.azanFajr) return;
      // Only right at the start (first 2 minutes), once per prayer per day.
      const [h, m] = cur.time.split(":").map(Number);
      if (now.getHours() * 60 + now.getMinutes() - (h * 60 + m) > 2) return;
      const key = `azan:${now.toDateString()}:${cur.key}`;
      if (played(key)) return;
      markPlayed(key);
      if (settings.hasFile) {
        playAzan().catch(() => {
          // The browser blocks sound until you've clicked on the page — offer a button.
          toast(`🕌 ${cur.bs} — vrijeme je za namaz`, { duration: 60_000, action: { label: "Play azan", onClick: () => void playAzan() } });
        });
        toast(`🕌 ${cur.bs} · ${cur.time}`, { duration: 15_000, action: { label: "Stop", onClick: stopAzan } });
      } else {
        play("notify");
        toast(`🕌 ${cur.bs} · ${cur.time} — vrijeme je za namaz`, { duration: 30_000 });
      }
    };
    check();
    const t = setInterval(check, 15_000);
    return () => clearInterval(t);
  }, [setStore]);

  return null;
}
