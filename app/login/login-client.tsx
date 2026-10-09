"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { OAuthButtons } from "@/components/oauth-buttons";
import { AuthShell, AuthField, AuthError, AuthSubmit, AuthLink } from "@/components/auth-shell";
import { safeCallbackUrl } from "@/lib/safe-redirect";

export default function LoginPage({ googleEnabled, githubEnabled }: { googleEnabled: boolean; githubEnabled: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);
  const searchParams = useSearchParams();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    const res = await signIn("credentials", { email: email.trim(), password, totpCode, redirect: false });
    if (res?.ok) {
      // Full page load, not router.push: the client SessionProvider only
      // fetches the session on load, so a soft navigation left useSession()
      // "unauthenticated" (sidebar showing "User", etc.) until a manual refresh.
      // Also honours ?callbackUrl= so you land where you were heading.
      window.location.assign(safeCallbackUrl(searchParams.get("callbackUrl"), window.location.origin));
      return; // keep the spinner until the navigation happens
    }

    if (res?.code === "2fa_required") {
      setNeedsTwoFactor(true);
      setError("");
    } else if (res?.code === "2fa_invalid") {
      setNeedsTwoFactor(true);
      setError("Incorrect code. Try again or use a backup code.");
    } else if (res?.code === "rate_limited") {
      setError("Too many attempts. Wait a minute and try again.");
    } else if (res?.code === "oauth_only") {
      setError("This account uses Google/GitHub sign-in — use a button below instead of a password.");
    } else {
      setError("Invalid email or password.");
    }
    setLoading(false);
  }

  return (
    <AuthShell
      title={needsTwoFactor ? "Two-step verification" : "Welcome back"}
      subtitle={needsTwoFactor ? "Enter the 6-digit code from your authenticator app, or a backup code." : "Sign in to pick up where you left off."}
      footer={!needsTwoFactor && <>New here? <AuthLink href="/register">Create an account</AuthLink></>}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {!needsTwoFactor ? (
          <>
            <AuthField
              id="login-email" label="Email" type="email" autoComplete="email" autoFocus
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required
            />
            <AuthField
              id="login-password" label="Password" type={showPw ? "text" : "password"} autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" required
              hint={<Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">Forgot password?</Link>}
              trailing={
                <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"}
                  className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />
          </>
        ) : (
          <AuthField
            id="login-totp" label="Verification code" inputMode="numeric" autoComplete="one-time-code" autoFocus
            value={totpCode} onChange={(e) => setTotpCode(e.target.value)} placeholder="123456 or XXXXX-XXXXX" required
            className="tracking-widest"
          />
        )}
        {error && <AuthError>{error}</AuthError>}
        <AuthSubmit loading={loading}>{needsTwoFactor ? "Verify" : "Sign in"}</AuthSubmit>
        {needsTwoFactor && (
          <button
            type="button"
            onClick={() => { setNeedsTwoFactor(false); setTotpCode(""); setError(""); }}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            ← Use a different account
          </button>
        )}
      </form>
      {!needsTwoFactor && (googleEnabled || githubEnabled) && (
        <div className="mt-6">
          <OAuthButtons google={googleEnabled} github={githubEnabled} />
        </div>
      )}
    </AuthShell>
  );
}
