"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { OAuthButtons } from "@/components/oauth-buttons";
import { AuthShell, AuthField, AuthError, AuthSubmit, AuthSuccess, AuthLink } from "@/components/auth-shell";

export default function RegisterPage({ googleEnabled, githubEnabled }: { googleEnabled: boolean; githubEnabled: boolean }) {
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [done, setDone]         = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error ?? "Registration failed. Please try again."); return; }
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const strength = password.length === 0 ? 0 : password.length < 8 ? 1 : /[A-Z]/.test(password) && /\d/.test(password) && password.length >= 12 ? 3 : 2;

  return (
    <AuthShell
      title="Create your account"
      subtitle="Free forever for the basics. Takes 20 seconds."
      footer={!done && <>Already have an account? <AuthLink href="/login">Sign in</AuthLink></>}
    >
      {done ? (
        <AuthSuccess title="Account created">Check your inbox to verify your email. Taking you to sign in…</AuthSuccess>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <AuthField id="reg-name" label="Name" autoComplete="name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
          <AuthField id="reg-email" label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          <div className="space-y-2">
            <AuthField
              id="reg-password" label="Password" type={showPw ? "text" : "password"} autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required minLength={8}
              trailing={
                <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"}
                  className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />
            {password && (
              <div className="flex items-center gap-2" aria-live="polite">
                <div className="flex-1 grid grid-cols-3 gap-1">
                  {[1, 2, 3].map((i) => (
                    <span key={i} className={"h-1 rounded-full " + (strength >= i ? (strength === 1 ? "bg-red-500" : strength === 2 ? "bg-amber-500" : "bg-emerald-500") : "bg-muted")} />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground w-14 text-right">{["", "Too short", "Okay", "Strong"][strength]}</span>
              </div>
            )}
          </div>
          <AuthField id="reg-confirm" label="Confirm password" type={showPw ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" required />
          {error && <AuthError>{error}</AuthError>}
          <AuthSubmit loading={loading}>Create account</AuthSubmit>
        </form>
      )}
      {!done && (googleEnabled || githubEnabled) && (
        <div className="mt-6">
          <OAuthButtons google={googleEnabled} github={githubEnabled} />
        </div>
      )}
    </AuthShell>
  );
}
