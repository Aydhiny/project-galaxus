"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useSession, signOut } from "next-auth/react";
import {
  User, Lock, Bell, Sparkles, ShieldAlert, Loader2, CheckCircle2, MailWarning,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  updateProfile, changePassword, deleteAccount, resendVerificationEmail,
} from "@/lib/actions/account";
import { saveNotificationPrefs, type NotificationPrefs } from "@/lib/actions/user-settings";

interface AccountInfo {
  id: number;
  name: string;
  email: string;
  plan: string;
  emailVerified: Date | null;
}

export function SettingsClient({ account, prefs: initialPrefs }: { account: AccountInfo | null; prefs: NotificationPrefs }) {
  const { update: updateSession } = useSession();

  const [name, setName] = useState(account?.name ?? "");
  const [email, setEmail] = useState(account?.email ?? "");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [prefs, setPrefs] = useState(initialPrefs);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [resending, setResending] = useState(false);

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
    const res = await changePassword({ currentPassword, newPassword });
    if (res.error) toast.error(res.error);
    else {
      toast.success("Password updated");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    }
    setSavingPassword(false);
  }

  async function handlePrefsChange(next: NotificationPrefs) {
    setPrefs(next);
    setSavingPrefs(true);
    await saveNotificationPrefs(next);
    setSavingPrefs(false);
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
    const res = await deleteAccount(deletePassword);
    if (res.error) { toast.error(res.error); setDeleting(false); return; }
    await signOut({ callbackUrl: "/" });
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
          <CardDescription>Change your account password.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSave} className="flex flex-col gap-4 max-w-sm">
            <div className="space-y-1.5">
              <Label htmlFor="current-password">Current password</Label>
              <Input id="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </div>
            <Button type="submit" disabled={savingPassword} className="w-fit">
              {savingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>

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
        </CardContent>
      </Card>

      {/* Plan */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4" /> Plan</CardTitle>
          <CardDescription>Your current subscription tier.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4 max-w-md">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/25">
              {account?.plan === "pro" ? <><CheckCircle2 className="w-3 h-3" /> Pro</> : "Free"}
            </span>
            {account?.plan !== "pro" && (
              <span className="text-xs text-muted-foreground">30-day history limit</span>
            )}
          </div>
          {account?.plan !== "pro" && (
            <Tooltip>
              <TooltipTrigger render={<Button variant="outline" disabled className="cursor-not-allowed" />}>
                Upgrade to Pro
              </TooltipTrigger>
              <TooltipContent>Stripe checkout coming soon</TooltipContent>
            </Tooltip>
          )}
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
                  This permanently deletes your account and all associated data — habits, prayers, goals, journal entries, everything. Enter your password to confirm.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Input
                type="password" placeholder="Your password"
                value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)}
                className="my-2"
              />
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={deleting || !deletePassword} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
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
