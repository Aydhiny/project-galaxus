"use client";

import { signIn } from "next-auth/react";

export function OAuthButtons({ google, github }: { google: boolean; github: boolean }) {
  if (!google && !github) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-white/10" />
        <span className="text-[10px] uppercase tracking-[0.18em] text-white/30">or continue with</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: google && github ? "1fr 1fr" : "1fr" }}>
        {google && (
          <button
            type="button"
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm text-white/80 hover:text-white hover:bg-white/[0.06] transition-colors"
            style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.10)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3.01h3.88c2.27-2.09 3.58-5.17 3.58-8.66z"/>
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.01c-1.08.72-2.45 1.15-4.05 1.15-3.11 0-5.75-2.1-6.69-4.93H1.3v3.1C3.26 21.3 7.31 24 12 24z"/>
              <path fill="#FBBC05" d="M5.31 14.3c-.24-.72-.38-1.49-.38-2.3s.14-1.58.38-2.3V6.6H1.3A11.98 11.98 0 000 12c0 1.94.46 3.77 1.3 5.4l4.01-3.1z"/>
              <path fill="#EA4335" d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.3 6.6l4.01 3.1c.94-2.83 3.58-4.93 6.69-4.93z"/>
            </svg>
            Google
          </button>
        )}
        {github && (
          <button
            type="button"
            onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm text-white/80 hover:text-white hover:bg-white/[0.06] transition-colors"
            style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.10)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.04-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.3 3.5 1 .11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23.96-.27 1.98-.4 3-.4 1.02 0 2.04.13 3 .4 2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22 0 1.6-.02 2.89-.02 3.29 0 .32.22.7.83.58C20.56 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            GitHub
          </button>
        )}
      </div>
    </div>
  );
}
