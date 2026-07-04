"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { MovingBorderBtn } from "@/components/aceternity/moving-border-btn";
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
    <AuthShell title="Set a new password" subtitle="Choose a new password">
      {done ? (
        <div className="text-center space-y-3 py-4">
          <div className="text-4xl">✓</div>
          <p className="text-white/80 font-semibold">Password updated!</p>
          <p className="text-white/40 text-sm">Redirecting to sign in…</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-[0.18em] text-white/35 font-semibold block">New password</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters" required minLength={8}
              className="w-full px-4 py-3 rounded-xl border text-sm"
              style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.9)" }}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-[0.18em] text-white/35 font-semibold block">Confirm password</label>
            <input
              type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat password" required
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
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update password"}
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
