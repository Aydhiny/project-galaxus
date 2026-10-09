"use client";

import { useState } from "react";
import { AuthShell, AuthField, AuthError, AuthSubmit, AuthSuccess, AuthLink } from "@/components/auth-shell";
import { requestPasswordReset } from "@/lib/actions/password-reset";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    const res = await requestPasswordReset(email);
    if (res.error) setError(res.error);
    else setMessage(res.message ?? "If an account exists for that email, we've sent a password reset link.");
    setLoading(false);
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we'll send you a link to choose a new one."
      footer={<AuthLink href="/login">← Back to sign in</AuthLink>}
    >
      {message ? (
        <AuthSuccess title="Check your inbox">{message}</AuthSuccess>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <AuthField id="forgot-email" label="Email" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          {error && <AuthError>{error}</AuthError>}
          <AuthSubmit loading={loading}>Send reset link</AuthSubmit>
        </form>
      )}
    </AuthShell>
  );
}
