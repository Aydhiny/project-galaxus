"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AuthShell, AuthField, AuthError, AuthSubmit, AuthSuccess, AuthLink } from "@/components/auth-shell";
import { resetPassword } from "@/lib/actions/password-reset";

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setLoading(true);
    setError("");
    const res = await resetPassword(token, password);
    if (res.error) setError(res.error);
    else {
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    }
    setLoading(false);
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="You'll be signed out on every other device for safety."
      footer={<AuthLink href="/login">← Back to sign in</AuthLink>}
    >
      {done ? (
        <AuthSuccess title="Password updated">Taking you to sign in…</AuthSuccess>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <AuthField id="reset-password" label="New password" type="password" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required minLength={8} />
          <AuthField id="reset-confirm" label="Confirm password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" required />
          {error && <AuthError>{error}</AuthError>}
          <AuthSubmit loading={loading}>Update password</AuthSubmit>
        </form>
      )}
    </AuthShell>
  );
}
