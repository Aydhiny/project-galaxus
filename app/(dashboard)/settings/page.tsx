import { Suspense } from "react";
import { getAccountInfo } from "@/lib/actions/account";
import { getNotificationPrefs } from "@/lib/actions/user-settings";
import { getLeaderboardOptIn } from "@/lib/actions/leaderboard";
import { SettingsClient } from "./settings-client";
import { AdminBackup } from "@/components/settings/admin-backup";
import { isSuperAdmin } from "@/lib/admin";
import { requireUserId } from "@/lib/auth-session";

export default async function SettingsPage() {
  const [account, prefs, leaderboardOptIn, admin] = await Promise.all([
    getAccountInfo(),
    getNotificationPrefs(),
    getLeaderboardOptIn(),
    requireUserId().then(isSuperAdmin).catch(() => false),
  ]);

  return (
    <div className="page">
      {admin && <AdminBackup />}
      <Suspense>
        <SettingsClient account={account} prefs={prefs} leaderboardOptIn={leaderboardOptIn} />
      </Suspense>
    </div>
  );
}
