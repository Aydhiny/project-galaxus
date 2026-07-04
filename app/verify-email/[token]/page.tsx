"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { verifyEmail } from "@/lib/actions/password-reset";

export default function VerifyEmailPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    verifyEmail(token).then((res) => {
      if (!alive) return;
      if (res.error) { setError(res.error); setState("error"); }
      else setState("success");
    });
    return () => { alive = false; };
  }, [token]);

  return (
    <AuthShell title="Verify your email" subtitle="Email verification">
      <div className="text-center space-y-3 py-4">
        {state === "loading" && (
          <>
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-white/40" />
            <p className="text-white/60 text-sm">Verifying your email…</p>
          </>
        )}
        {state === "success" && (
          <>
            <div className="text-4xl">✓</div>
            <p className="text-white/80 font-semibold">Email verified!</p>
            <p className="text-white/40 text-sm">Your account is now confirmed.</p>
          </>
        )}
        {state === "error" && (
          <>
            <div className="text-4xl">✕</div>
            <p className="text-white/80 font-semibold">Verification failed</p>
            <p className="text-white/40 text-sm">{error}</p>
          </>
        )}
      </div>
      <p className="text-center text-sm text-white/30 mt-6">
        <Link href="/dashboard" className="text-white/60 hover:text-white transition-colors underline underline-offset-2">
          Go to dashboard
        </Link>
      </p>
    </AuthShell>
  );
}
