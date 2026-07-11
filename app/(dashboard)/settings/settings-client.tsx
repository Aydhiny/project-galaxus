"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useSession, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import {
  User, Lock, Bell, Sparkles, ShieldAlert, Loader2, CheckCircle2, MailWarning, Download, AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  updateProfile, changePassword, deleteAccount, resendVerificationEmail,
} from "@/lib/actions/account";
import { saveNotificationPrefs, type NotificationPrefs } from "@/lib/actions/user-settings";
import { exportUserData } from "@/lib/actions/export-data";
import { generateReportPdf } from "@/lib/actions/generate-report";
import { createCheckoutSession, createPortalSession } from "@/lib/actions/billing";
import { setLeaderboardOptIn } from "@/lib/actions/leaderboard";
import { TwoFactorSettings } from "@/components/two-factor-settings";

interface AccountInfo {
  id: number;
  name: string;
  email: string;
  plan: string;
  emailVerified: Date | null;
  twoFactorEnabled: boolean;
  hasPassword: boolean;
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
}

export function SettingsClient({
  account, prefs: initialPrefs, leaderboardOptIn: initialLeaderboardOptIn,
}: { account: AccountInfo | null; prefs: NotificationPrefs; leaderboardOptIn: boolean }) {
  const { update: updateSession } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [name, setName] = useState(account?.name ?? "");
  const [email, setEmail] = useState(account?.email ?? "");
  const [savingProfile, setSavingProfile] = useState(false);

  const [hasPassword, setHasPassword] = useState(account?.hasPassword ?? false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [prefs, setPrefs] = useState(initialPrefs);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [leaderboardOptIn, setLeaderboardOptInState] = useState(initialLeaderboardOptIn);
  const [savingLeaderboardOptIn, setSavingLeaderboardOptIn] = useState(false);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [resending, setResending] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reportRange, setReportRange] = useState<"week" | "month" | "all">("week");
  const [generatingReport, setGeneratingReport] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [managingBilling, setManagingBilling] = useState(false);

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (!checkout) return;
    if (checkout === "success") toast.success("You're now on Pro!");
    else if (checkout === "cancelled") toast.info("Checkout cancelled — no changes were made.");
    router.replace("/settings");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUpgrade() {
    setUpgrading(true);
    const res = await createCheckoutSession();
    if (res.error) { toast.error(res.error); setUpgrading(false); return; }
    window.location.href = res.url!;
  }

  async function handleManageBilling() {
    setManagingBilling(true);
    const res = await createPortalSession();
    if (res.error) { toast.error(res.error); setManagingBilling(false); return; }
    window.location.href = res.url!;
  }

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    const res = await updateProfile({ name, email });
    if (res.error) toast.error(res.error);
    else {
      toast.success("Profile updated");
      await updateSession({ name, email });
    }
    setSavingProfile(false);
  }

  async function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) { toast.error("New passwords don't match."); return; }
    setSavingPassword(true);
    const res = await changePassword({
      currentPassword: hasPassword ? currentPassword : undefined,
      newPassword,
    });
    if (res.error) toast.error(res.error);
    else {
      toast.success(hasPassword ? "Password updated" : "Password set");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setHasPassword(true);
    }
    setSavingPassword(false);
  }

  async function handlePrefsChange(next: NotificationPrefs) {
    setPrefs(next);
    setSavingPrefs(true);
    await saveNotificationPrefs(next);
    setSavingPrefs(false);
  }

  async function handleLeaderboardOptInChange(next: boolean) {
    setLeaderboardOptInState(next);
    setSavingLeaderboardOptIn(true);
    await setLeaderboardOptIn(next);
    setSavingLeaderboardOptIn(false);
  }

  async function handleResendVerification() {
    setResending(true);
    const res = await resendVerificationEmail();
    if (res.error) toast.error(res.error);
    else toast.success("Verification email sent");
    setResending(false);
  }

  async function handleDelete() {
    setDeleting(true);
    const res = await deleteAccount(hasPassword ? deletePassword : undefined);
    if (res.error) { toast.error(res.error); setDeleting(false); return; }
    await signOut({ callbackUrl: "/" });
  }

  async function handleExport() {
    setExporting(true);
    try {
      const data = await exportUserData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `galaxus-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  async function handleDownloadReport() {
    setGeneratingReport(true);
    try {
      const res = await generateReportPdf(reportRange);
      if ("error" in res) { toast.error(res.error); return; }
      const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Report generation failed. Please try again.");
    } finally {
      setGeneratingReport(false);
    }
  }

  return (
    <TooltipProvider delay={200}>
      <PageHeader label="Account" title="Settings" subtitle="Manage your profile, security, and preferences" />

      {account && !account.emailVerified && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
          <div className="flex items-center gap-2.5 text-sm text-amber-500">
            <MailWarning className="w-4 h-4 shrink-0" />
            <span>Your email isn&apos;t verified yet.</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleResendVerification} disabled={resending}>
            {resending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Resend email"}
          </Button>
        </div>
      )}

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><User className="w-4 h-4" /> Profile</CardTitle>
          <CardDescription>Your name and email address.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleProfileSave} className="flex flex-col gap-4 max-w-sm">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <Button type="submit" disabled={savingProfile} className="w-fit">
              {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save profile"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Lock className="w-4 h-4" /> Password</CardTitle>
          <CardDescription>
            {hasPassword
              ? "Change your account password."
              : "You signed up with Google/GitHub — set a password to also enable email sign-in."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSave} className="flex flex-col gap-4 max-w-sm">
            {hasPassword && (
              <div className="space-y-1.5">
                <Label htmlFor="current-password">Current password</Label>
                <Input id="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="new-password">{hasPassword ? "New password" : "Password"}</Label>
              <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm {hasPassword ? "new " : ""}password</Label>
              <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </div>
            <Button type="submit" disabled={savingPassword} className="w-fit">
              {savingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : hasPassword ? "Update password" : "Set password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Two-factor authentication */}
      <TwoFactorSettings enabled={account?.twoFactorEnabled ?? false} hasPassword={hasPassword} />

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bell className="w-4 h-4" /> Reminders</CardTitle>
          <CardDescription>
            Local browser notifications — these only fire while Galaxus is open in a tab, not when your device is asleep or the app is closed.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 max-w-md">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Prayer time reminders</p>
              <p className="text-xs text-muted-foreground">Notify me when each prayer time arrives</p>
            </div>
            <Switch
              checked={prefs.notifyPrayerReminders}
              onCheckedChange={(checked) => handlePrefsChange({ ...prefs, notifyPrayerReminders: checked })}
              disabled={savingPrefs}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Remind me before (minutes)</p>
              <p className="text-xs text-muted-foreground">A heads-up ahead of the prayer time</p>
            </div>
            <Input
              type="number" min={0} max={60}
              value={prefs.notifyPrayerMinutesBefore}
              onChange={(e) => handlePrefsChange({ ...prefs, notifyPrayerMinutesBefore: Number(e.target.value) })}
              className="w-20"
              disabled={savingPrefs}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Daily check-in nudge</p>
              <p className="text-xs text-muted-foreground">Remind me if I haven&apos;t logged today yet</p>
            </div>
            <Switch
              checked={prefs.notifyDailyCheckin}
              onCheckedChange={(checked) => handlePrefsChange({ ...prefs, notifyDailyCheckin: checked })}
              disabled={savingPrefs}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Nudge hour (24h)</p>
              <p className="text-xs text-muted-foreground">Local time to check for a missed check-in</p>
            </div>
            <Input
              type="number" min={0} max={23}
              value={prefs.notifyDailyCheckinHour}
              onChange={(e) => handlePrefsChange({ ...prefs, notifyDailyCheckinHour: Number(e.target.value) })}
              className="w-20"
              disabled={savingPrefs}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Weekly email digest</p>
              <p className="text-xs text-muted-foreground">A summary of your week, sent by email</p>
            </div>
            <Switch
              checked={prefs.notifyWeeklyDigest}
              onCheckedChange={(checked) => handlePrefsChange({ ...prefs, notifyWeeklyDigest: checked })}
              disabled={savingPrefs}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Show me on the public leaderboard</p>
              <p className="text-xs text-muted-foreground">Your name, total days, best streak, and badge count become visible to other users</p>
            </div>
            <Switch
              checked={leaderboardOptIn}
              onCheckedChange={handleLeaderboardOptInChange}
              disabled={savingLeaderboardOptIn}
            />
          </div>
        </CardContent>
      </Card>

      {/* Plan */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4" /> Plan</CardTitle>
          <CardDescription>Your current subscription tier.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4 max-w-md">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/25">
                {account?.plan === "pro" ? <><CheckCircle2 className="w-3 h-3" /> Pro</> : "Free"}
              </span>
              {account?.plan !== "pro" && (
                <span className="text-xs text-muted-foreground">30-day history limit</span>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              ❄️ {account?.plan === "pro" ? "3" : "1"} streak freeze{account?.plan === "pro" ? "s" : ""}/month
            </span>
            {account?.plan === "pro" && account.subscriptionStatus === "past_due" && (
              <span className="inline-flex items-center gap-1.5 text-xs text-destructive">
                <AlertTriangle className="w-3 h-3" /> Payment failed — update your card
              </span>
            )}
            {account?.plan === "pro" && account.subscriptionStatus !== "past_due" && account.currentPeriodEnd && (
              <span className="text-xs text-muted-foreground">
                Renews on {format(new Date(account.currentPeriodEnd), "MMM d, yyyy")}
              </span>
            )}
          </div>
          {account?.plan === "pro" ? (
            <Button variant="outline" onClick={handleManageBilling} disabled={managingBilling} className="w-fit shrink-0">
              {managingBilling ? <Loader2 className="w-4 h-4 animate-spin" /> : "Manage billing"}
            </Button>
          ) : (
            <Button onClick={handleUpgrade} disabled={upgrading} className="w-fit shrink-0">
              {upgrading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Upgrade to Pro"}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Data */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Download className="w-4 h-4" /> Your data</CardTitle>
          <CardDescription>Download everything in your account, or a summarized report.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={handleExport} disabled={exporting} className="w-fit">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Download my data (JSON)"}
          </Button>
          <div className="flex items-center gap-2">
            <Select value={reportRange} onValueChange={(v) => v && setReportRange(v as "week" | "month" | "all")}>
              <SelectTrigger className="h-9 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week" className="text-xs">Week</SelectItem>
                <SelectItem value="month" className="text-xs">Month</SelectItem>
                <SelectItem value="all" className="text-xs">All-time</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleDownloadReport} disabled={generatingReport} className="w-fit">
              {generatingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : "Download PDF report"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="ring-destructive/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive"><ShieldAlert className="w-4 h-4" /> Danger zone</CardTitle>
          <CardDescription>Deleting your account permanently removes all of your data. This can&apos;t be undone.</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="destructive" />}>
              Delete account
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes your account and all associated data — habits, prayers, goals, journal entries, everything.
                  {hasPassword ? " Enter your password to confirm." : ""}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {hasPassword && (
                <Input
                  type="password" placeholder="Your password"
                  value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)}
                  className="my-2"
                />
              )}
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={deleting || (hasPassword && !deletePassword)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete permanently"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
