"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { ShineButton } from "@/components/lw/shine-button";
import { BorderBeam } from "@/components/lw/border-beam";

// Static stars — fixed positions so SSR and client always match
const STARS = [
  { w: 1.5, h: 2.1, top: 12.3, left: 8.7, op: 0.35 },
  { w: 2.2, h: 1.8, top: 45.6, left: 23.1, op: 0.25 },
  { w: 1.1, h: 1.4, top: 78.9, left: 56.4, op: 0.45 },
  { w: 2.8, h: 2.3, top: 34.2, left: 71.8, op: 0.30 },
  { w: 1.6, h: 1.9, top: 91.0, left: 14.5, op: 0.40 },
  { w: 2.0, h: 1.5, top: 6.7, left: 89.2, op: 0.20 },
  { w: 1.3, h: 2.7, top: 60.1, left: 38.9, op: 0.35 },
  { w: 2.5, h: 1.2, top: 22.8, left: 67.3, op: 0.28 },
  { w: 1.9, h: 2.4, top: 83.5, left: 42.1, op: 0.42 },
  { w: 2.1, h: 1.7, top: 15.4, left: 95.6, op: 0.33 },
  { w: 1.4, h: 2.0, top: 52.7, left: 3.8, op: 0.38 },
  { w: 2.6, h: 1.3, top: 70.9, left: 78.4, op: 0.22 },
  { w: 1.8, h: 2.6, top: 38.3, left: 51.2, op: 0.47 },
  { w: 1.2, h: 1.6, top: 96.1, left: 33.7, op: 0.31 },
  { w: 2.9, h: 2.1, top: 4.5, left: 61.9, op: 0.26 },
  { w: 1.7, h: 1.4, top: 66.8, left: 17.3, op: 0.43 },
  { w: 2.3, h: 2.8, top: 29.0, left: 84.6, op: 0.29 },
  { w: 1.0, h: 2.2, top: 87.4, left: 29.8, op: 0.36 },
  { w: 2.7, h: 1.9, top: 48.6, left: 73.2, op: 0.24 },
  { w: 1.5, h: 1.1, top: 11.2, left: 46.9, op: 0.41 },
  { w: 2.4, h: 2.5, top: 74.3, left: 9.1, op: 0.32 },
  { w: 1.1, h: 1.8, top: 57.9, left: 92.4, op: 0.37 },
  { w: 2.0, h: 1.3, top: 19.6, left: 35.7, op: 0.27 },
  { w: 1.6, h: 2.9, top: 43.1, left: 58.3, op: 0.44 },
  { w: 2.8, h: 1.6, top: 93.7, left: 76.5, op: 0.23 },
  { w: 1.3, h: 2.3, top: 2.8, left: 22.4, op: 0.39 },
  { w: 2.2, h: 1.0, top: 61.5, left: 47.8, op: 0.34 },
  { w: 1.9, h: 2.7, top: 31.4, left: 6.2, op: 0.46 },
  { w: 1.4, h: 1.5, top: 77.2, left: 63.9, op: 0.21 },
  { w: 2.6, h: 2.0, top: 18.9, left: 81.7, op: 0.40 },
];

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    if (res?.ok) {
      router.push("/dashboard");
    } else {
      setError("Invalid credentials. Try again.");
    }
    setLoading(false);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{
        background: `
          radial-gradient(ellipse 80% 60% at 50% -20%, oklch(0.35 0.22 258 / 45%) 0%, transparent 65%),
          radial-gradient(ellipse 40% 40% at 80% 80%, oklch(0.40 0.22 290 / 28%) 0%, transparent 55%),
          oklch(0.058 0.022 258)
        `,
      }}
    >
      {/* Stars */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {STARS.map((s, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white/30"
            style={{
              width: s.w + "px",
              height: s.h + "px",
              top: s.top + "%",
              left: s.left + "%",
              opacity: s.op,
            }}
          />
        ))}
      </div>

      {/* Aurora animated orbs */}
      <div
        className="absolute w-[600px] h-[600px] rounded-full pointer-events-none animate-glow-pulse"
        style={{
          top: "-20%",
          left: "15%",
          background: "radial-gradient(circle, oklch(0.45 0.28 258 / 22%) 0%, transparent 70%)",
          filter: "blur(70px)",
        }}
      />
      <div
        className="absolute w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{
          bottom: "-15%",
          right: "10%",
          background: "radial-gradient(circle, oklch(0.62 0.26 290 / 16%) 0%, transparent 70%)",
          filter: "blur(90px)",
          animation: "glow-pulse 3.5s ease-in-out infinite 1.2s",
        }}
      />
      <div
        className="absolute w-[380px] h-[380px] rounded-full pointer-events-none"
        style={{
          top: "55%",
          left: "3%",
          background: "radial-gradient(circle, oklch(0.50 0.24 220 / 13%) 0%, transparent 70%)",
          filter: "blur(60px)",
          animation: "glow-pulse 4.5s ease-in-out infinite 0.7s",
        }}
      />
      {/* Third orb — cyan accent */}
      <div
        className="absolute w-[280px] h-[280px] rounded-full pointer-events-none"
        style={{
          top: "20%",
          right: "25%",
          background: "radial-gradient(circle, oklch(0.62 0.22 210 / 10%) 0%, transparent 70%)",
          filter: "blur(50px)",
          animation: "float-up 6s ease-in-out infinite",
        }}
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm mx-4">
        {/* Logo area */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-5 relative"
            style={{
              background: "oklch(1 0 0 / 5%)",
              border: "1px solid oklch(1 0 0 / 15%)",
            }}
          >
            {/* Pulsing glow rings */}
            <div className="absolute inset-[-4px] rounded-2xl animate-glow-pulse"
              style={{ background: "radial-gradient(circle, #173eff25 0%, transparent 70%)" }} />
            <span
              className="text-3xl relative z-10 animate-glow-pulse"
              style={{ filter: "drop-shadow(0 0 12px #173eff) drop-shadow(0 0 24px #173eff80)" }}
            >✦</span>
          </div>
          <h1
            className="text-4xl font-bold tracking-tight lw-gradient-text"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            GALAXUS
          </h1>
          <p className="text-[oklch(0.94_0.015_258/55%)] mt-1.5 text-sm">
            Your personal universe
          </p>
        </div>

        {/* Glass card with BorderBeam */}
        <div
          className="rounded-2xl p-8 relative overflow-hidden"
          style={{
            background: "oklch(1 0 0 / 5%)",
            backdropFilter: "blur(24px) saturate(180%)",
            border: "1px solid oklch(1 0 0 / 10%)",
            boxShadow: "0 32px 80px rgba(0,0,0,0.5), inset 0 1px 0 oklch(1 0 0 / 12%), inset 0 -1px 0 oklch(0 0 0 / 20%)",
          }}
        >
          <BorderBeam size={80} duration={5} colorFrom="#173eff" colorTo="#a78bfa" opacity={0.5} />
          <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
            <div className="space-y-2">
              <Label
                htmlFor="username"
                className="text-[9px] uppercase tracking-[0.2em] text-[oklch(0.94_0.015_258/50%)]"
              >
                Username
              </Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ajdin"
                className="h-12 rounded-xl"
                style={{
                  background: "oklch(1 0 0 / 7%)",
                  border: "1px solid oklch(1 0 0 / 14%)",
                  color: "oklch(0.94 0.015 258)",
                }}
                required
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="password"
                className="text-[9px] uppercase tracking-[0.2em] text-[oklch(0.94_0.015_258/50%)]"
              >
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-12 rounded-xl"
                style={{
                  background: "oklch(1 0 0 / 7%)",
                  border: "1px solid oklch(1 0 0 / 14%)",
                  color: "oklch(0.94 0.015 258)",
                }}
                required
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 text-center bg-red-400/10 border border-red-400/20 rounded-xl py-2 px-3">{error}</p>
            )}

            <ShineButton
              type="submit"
              size="lg"
              disabled={loading}
              className="w-full !rounded-xl disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              ) : (
                "Enter your universe"
              )}
            </ShineButton>
          </form>
        </div>

        <p className="text-center text-sm text-[oklch(0.94_0.015_258/35%)] mt-6 tracking-wide">
          بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيم
        </p>
      </div>
    </div>
  );
}
