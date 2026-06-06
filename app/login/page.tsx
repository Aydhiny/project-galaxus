"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

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
      router.push("/");
    } else {
      setError("Invalid credentials. Try again.");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      {/* Background stars effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 60 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white/10"
            style={{
              width: Math.random() * 2 + 1 + "px",
              height: Math.random() * 2 + 1 + "px",
              top: Math.random() * 100 + "%",
              left: Math.random() * 100 + "%",
              opacity: Math.random() * 0.5 + 0.1,
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
