"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { getTodayCheckin } from "@/lib/actions/checkin";
import { getNotificationPrefs } from "@/lib/actions/user-settings";

const REMINDED_KEY = "galaxus-daily-checkin-reminded";

function alreadyRemindedToday(dateStr: string): boolean {
  try { return localStorage.getItem(REMINDED_KEY) === dateStr; } catch { return false; }
}
function markRemindedToday(dateStr: string) {
  try { localStorage.setItem(REMINDED_KEY, dateStr); } catch { /* ignore */ }
}

/** Mounted once in the dashboard layout — nudges once per day if it's past the user's chosen hour and today's check-in hasn't been started. */
export function DailyCheckinReminder() {
  const router = useRouter();

  useEffect(() => {
    let alive = true;

    (async () => {
      const [prefs, checkin] = await Promise.all([getNotificationPrefs(), getTodayCheckin()]);
      if (!alive || !prefs.notifyDailyCheckin) return;

      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      if (now.getHours() < prefs.notifyDailyCheckinHour) return;
      if (checkin) return; // already started today's check-in
      if (alreadyRemindedToday(today)) return;

      markRemindedToday(today);
      toast("Haven't logged today yet", {
        description: "Your daily check-in is still waiting.",
        action: { label: "Log now", onClick: () => router.push("/daily") },
      });
    })();

    return () => { alive = false; };
  }, [router]);

  return null;
}
