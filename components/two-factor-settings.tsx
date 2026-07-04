"use client";

import { useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { ShieldCheck, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { beginTwoFactorEnrollment, confirmTwoFactorEnrollment, disableTwoFactor } from "@/lib/actions/two-factor";

type Step = "idle" | "enrolling" | "backup-codes";

export function TwoFactorSettings({ enabled, hasPassword }: { enabled: boolean; hasPassword: boolean }) {
  const [step, setStep] = useState<Step>("idle");
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");

  async function startEnroll() {
    setLoading(true);
    const res = await beginTwoFactorEnrollment();
    if (res.error) { toast.error(res.error); setLoading(false); return; }
    setQrDataUrl(res.qrDataUrl!);
    setSecret(res.secret!);
    setStep("enrolling");
    setLoading(false);
  }

  async function confirmEnroll(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await confirmTwoFactorEnrollment(code);
    if (res.error) { toast.error(res.error); setLoading(false); return; }
    setBackupCodes(res.backupCodes!);
    setIsEnabled(true);
    setStep("backup-codes");
    setLoading(false);
  }

  function finishSetup() {
    setStep("idle");
    setCode(""); setQrDataUrl(""); setSecret(""); setBackupCodes([]);
    toast.success("Two-factor authentication enabled");
  }

  async function handleDisable() {
    setLoading(true);
    const res = await disableTwoFactor(disablePassword);
    if (res.error) { toast.error(res.error); setLoading(false); return; }
    setIsEnabled(false);
    setDisablePassword("");
    toast.success("Two-factor authentication disabled");
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Two-factor authentication</CardTitle>
        <CardDescription>Require a code from an authenticator app when signing in.</CardDescription>
      </CardHeader>
      <CardContent className="max-w-md">
        {step === "idle" && (
          isEnabled ? (
            <div className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5 text-sm text-emerald">
                <CheckCircle2 className="w-4 h-4" /> Enabled
              </span>
              <AlertDialog>
                <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
                  Disable
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disable two-factor authentication?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {hasPassword
                        ? "Your account will only require a password to sign in. Enter your password to confirm."
                        : "Your account will only require your Google/GitHub sign-in going forward."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  {hasPassword && (
                    <Input
                      type="password" placeholder="Your password"
                      value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)}
                      className="my-2"
                    />
                  )}
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDisable} disabled={loading || (hasPassword && !disablePassword)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Disable"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : (
            <Button onClick={startEnroll} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enable 2FA"}
            </Button>
          )
        )}

        {step === "enrolling" && (
          <form onSubmit={confirmEnroll} className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">Scan this with an authenticator app (Google Authenticator, Authy, 1Password, etc.):</p>
            {qrDataUrl && (
              <Image src={qrDataUrl} alt="Two-factor authentication QR code" width={160} height={160} unoptimized className="rounded-lg border border-border" />
            )}
            <p className="text-xs text-muted-foreground">
              Can&apos;t scan? Enter this key manually: <code className="font-mono text-foreground/80">{secret}</code>
            </p>
            <Input
              value={code} onChange={(e) => setCode(e.target.value)}
              placeholder="6-digit code" inputMode="numeric" autoFocus required
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify & enable"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setStep("idle")}>Cancel</Button>
            </div>
          </form>
        )}

        {step === "backup-codes" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">Save your backup codes</p>
            <p className="text-xs text-muted-foreground">
              Each code works once, if you ever lose access to your authenticator app. Save them somewhere safe — they won&apos;t be shown again.
            </p>
            <div className="grid grid-cols-2 gap-2 font-mono text-xs bg-muted rounded-lg p-3">
              {backupCodes.map((c) => <span key={c}>{c}</span>)}
            </div>
            <Button onClick={finishSetup} className="w-fit">I&apos;ve saved these codes</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
