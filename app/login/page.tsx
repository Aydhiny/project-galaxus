"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

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
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      {/* Background stars — static positions to avoid hydration mismatch */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {STARS.map((s, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white/10"
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

      {/* Glow behind card */}
      <div className="absolute w-96 h-96 rounded-full blur-3xl opacity-10 bg-[var(--gold)]" />

      <div className="relative z-10 w-full max-w-sm mx-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 border border-[var(--gold)]/30 bg-[var(--gold-muted)]">
            <span className="text-2xl">✦</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Galaxus
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Your personal universe
          </p>
        </div>

        <div className="rounded-2xl border border-white/8 bg-card p-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-muted-foreground text-xs uppercase tracking-widest">
                Username
              </Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ajdin"
                className="bg-white/5 border-white/10 focus:border-[var(--gold)]/50 focus:ring-[var(--gold)]/20 h-11"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-muted-foreground text-xs uppercase tracking-widest">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-white/5 border-white/10 focus:border-[var(--gold)]/50 focus:ring-[var(--gold)]/20 h-11"
                required
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 text-center">{error}</p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-[var(--gold)] hover:bg-[var(--gold)]/90 text-[oklch(0.08_0.01_85)] font-semibold rounded-xl"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Enter your universe"
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6 opacity-50">
          بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيم
        </p>
      </div>
    </div>
  );
}
