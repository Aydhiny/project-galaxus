import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#070b18",
          backgroundImage:
            "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(23,62,255,0.35) 0%, transparent 60%), radial-gradient(ellipse 50% 40% at 90% 100%, rgba(124,58,237,0.20) 0%, transparent 55%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 96,
            height: 96,
            borderRadius: 28,
            marginBottom: 32,
            background: "linear-gradient(135deg, rgba(23,62,255,0.25), rgba(124,58,237,0.25))",
            border: "2px solid rgba(23,62,255,0.4)",
          }}
        >
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #60a5fa, #a78bfa)",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 84,
            fontWeight: 700,
            color: "white",
            letterSpacing: -2,
          }}
        >
          Galaxus
        </div>
        <div style={{ display: "flex", fontSize: 30, color: "rgba(255,255,255,0.55)", marginTop: 16 }}>
          Your personal growth universe
        </div>
        <div style={{ display: "flex", fontSize: 22, color: "rgba(255,255,255,0.3)", marginTop: 28 }}>
          Built by Plansio
        </div>
      </div>
    ),
    { ...size }
  );
}
