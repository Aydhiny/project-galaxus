"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AuthShell, AuthSuccess, AuthLink } from "@/components/auth-shell";
import { verifyEmail } from "@/lib/actions/password-reset";

export default function VerifyEmailPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    // Tokens are single-use. React StrictMode (dev) runs effects twice, and
    // the old `alive` flag discarded the FIRST (successful) result, then
    // showed the second call's "invalid or expired" — a false failure.
    // The ref guarantees exactly one verification request per mount.
    if (started.current) return;
    started.current = true;
    verifyEmail(token).then((res) => {
      if (res.error) { setError(res.error); setState("error"); }
      else setState("success");
    });
  }, [token]);

  return (
    <AuthShell
      title="Verify your email"
      footer={<AuthLink href="/productivity">Go to the app →</AuthLink>}
    >
      {state === "loading" && (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-3">Verifying your email…</p>
        </div>
      )}
      {state === "success" && <AuthSuccess title="Email verified">Your account is confirmed.</AuthSuccess>}
      {state === "error" && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center">
          <p className="font-semibold text-destructive">Verification failed</p>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
        </div>
      )}
    </AuthShell>
  );
}
