"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Hook point for Sentry.captureException(error) once wired up (see components/ui/error-boundary.tsx).
    console.error("[app/error.tsx]", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#070b18] relative overflow-hidden px-4">
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full blur-[120px] opacity-20 bg-[#dc2626]" />
      </div>
      <div className="relative z-10 text-center max-w-sm">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6"
          style={{ background: "rgba(220,38,38,0.10)", border: "1px solid rgba(220,38,38,0.25)" }}
        >
          <AlertTriangle className="w-7 h-7 text-red-400" />
        </div>
        <h1 className="text-lg font-semibold text-white/90 mb-2">Something went wrong</h1>
        <p className="text-sm text-white/40 mb-8">
          An unexpected error occurred. You can try again, or head back to the dashboard.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #173eff 0%, #3758f9 100%)" }}
          >
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
          <Link
            href="/dashboard"
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-white/70 hover:text-white border border-white/10 hover:bg-white/5 transition-colors"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
