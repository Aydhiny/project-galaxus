"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { MovingBorderBtn } from "@/components/aceternity/moving-border-btn";
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
    <AuthShell title="Reset your password" subtitle="Forgot your password?">
      {message ? (
        <div className="text-center space-y-3 py-2">
          <div className="text-4xl">✓</div>
          <p className="text-white/80 text-sm">{message}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-[0.18em] text-white/35 font-semibold block">Email</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" required
              className="w-full px-4 py-3 rounded-xl border text-sm"
              style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.9)" }}
            />
          </div>
          {error && (
            <div className="px-4 py-2.5 rounded-xl text-sm text-red-300 text-center"
              style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>
              {error}
            </div>
          )}
          <MovingBorderBtn type="submit" disabled={loading} containerClassName="w-full" className="w-full h-11" innerClassName="w-full justify-center">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send reset link"}
          </MovingBorderBtn>
        </form>
      )}
      <p className="text-center text-sm text-white/30 mt-6">
        <Link href="/login" className="text-white/60 hover:text-white transition-colors underline underline-offset-2">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
