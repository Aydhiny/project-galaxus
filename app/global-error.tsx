"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app/global-error.tsx]", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ background: "#070b18", color: "white", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ textAlign: "center", maxWidth: 380 }}>
            <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Galaxus hit a snag</h1>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 24 }}>
              Something went wrong at the application level. Please try again.
            </p>
            <button
              onClick={reset}
              style={{
                background: "linear-gradient(135deg, #173eff 0%, #3758f9 100%)",
                color: "white",
                fontSize: 14,
                fontWeight: 600,
                padding: "10px 20px",
                borderRadius: 12,
                border: "none",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
