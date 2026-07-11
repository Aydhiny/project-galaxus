import { Suspense } from "react";
import { getAccountInfo } from "@/lib/actions/account";
import { getNotificationPrefs } from "@/lib/actions/user-settings";
import { getLeaderboardOptIn } from "@/lib/actions/leaderboard";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const [account, prefs, leaderboardOptIn] = await Promise.all([
    getAccountInfo(),
    getNotificationPrefs(),
    getLeaderboardOptIn(),
  ]);

  return (
    <div className="page">
      <Suspense>
        <SettingsClient account={account} prefs={prefs} leaderboardOptIn={leaderboardOptIn} />
      </Suspense>
    </div>
  );
}
