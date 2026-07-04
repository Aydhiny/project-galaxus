import { getAccountInfo } from "@/lib/actions/account";
import { getNotificationPrefs } from "@/lib/actions/user-settings";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const [account, prefs] = await Promise.all([getAccountInfo(), getNotificationPrefs()]);

  return (
    <div className="page">
      <SettingsClient account={account} prefs={prefs} />
    </div>
  );
}
