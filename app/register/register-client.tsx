"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BackgroundBeams } from "@/components/aceternity/background-beams";
import { MovingBorderBtn } from "@/components/aceternity/moving-border-btn";
import { GradientText } from "@/components/aceternity/gradient-text";
import { OAuthButtons } from "@/components/oauth-buttons";
import { Loader2, Eye, EyeOff } from "lucide-react";

const STARS = [
  { w: 1.5, h: 2.1, top: 12.3, left: 8.7,  op: 0.35 },
  { w: 2.2, h: 1.8, top: 45.6, left: 23.1, op: 0.25 },
  { w: 1.1, h: 1.4, top: 78.9, left: 56.4, op: 0.45 },
  { w: 2.8, h: 2.3, top: 34.2, left: 71.8, op: 0.30 },
  { w: 1.6, h: 1.9, top: 91.0, left: 14.5, op: 0.40 },
  { w: 2.0, h: 1.5, top: 6.7,  left: 89.2, op: 0.20 },
  { w: 1.3, h: 2.7, top: 60.1, left: 38.9, op: 0.35 },
  { w: 2.5, h: 1.2, top: 22.8, left: 67.3, op: 0.28 },
  { w: 1.9, h: 2.4, top: 83.5, left: 42.1, op: 0.42 },
  { w: 2.1, h: 1.7, top: 15.4, left: 95.6, op: 0.33 },
  { w: 1.4, h: 2.0, top: 52.7, left: 3.8,  op: 0.38 },
  { w: 2.6, h: 1.3, top: 70.9, left: 78.4, op: 0.22 },
  { w: 1.8, h: 2.6, top: 38.3, left: 51.2, op: 0.47 },
  { w: 2.9, h: 2.1, top: 4.5,  left: 61.9, op: 0.26 },
  { w: 1.7, h: 1.4, top: 66.8, left: 17.3, op: 0.43 },
  { w: 2.3, h: 2.8, top: 29.0, left: 84.6, op: 0.29 },
  { w: 1.0, h: 2.2, top: 87.4, left: 29.8, op: 0.36 },
  { w: 2.7, h: 1.9, top: 48.6, left: 73.2, op: 0.24 },
  { w: 1.5, h: 1.1, top: 11.2, left: 46.9, op: 0.41 },
  { w: 2.4, h: 2.5, top: 74.3, left: 9.1,  op: 0.32 },
];

export default function RegisterPage({ googleEnabled, githubEnabled }: { googleEnabled: boolean; githubEnabled: boolean }) {
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [done, setDone]         = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error ?? "Registration failed. Please try again."); return; }
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#070b18] relative overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full blur-[120px] opacity-25 bg-[#173eff]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[300px] rounded-full blur-[100px] opacity-15 bg-[#7c3aed]" />
        <div className="absolute top-1/3 left-0 w-[300px] h-[300px] rounded-full blur-[80px] opacity-10 bg-[#06b6d4]" />
      </div>
      <BackgroundBeams />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {STARS.map((s, i) => (
          <div key={i} className="absolute rounded-full bg-white/15"
            style={{ width: s.w+"px", height: s.h+"px", top: s.top+"%", left: s.left+"%", opacity: s.op }} />
        ))}
      </div>

      <div className="relative z-10 w-full max-w-sm mx-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background:"linear-gradient(135deg,rgba(23,62,255,0.2),rgba(124,58,237,0.2))", border:"1px solid rgba(23,62,255,0.3)", boxShadow:"0 0 40px rgba(23,62,255,0.25)" }}>
            <span className="text-2xl" style={{ filter:"drop-shadow(0 0 8px rgba(23,62,255,0.8))" }}>✦</span>
          </div>
          <GradientText as="h1" from="#60a5fa" via="#818cf8" to="#a78bfa" className="text-3xl font-bold tracking-tight">
            Galaxus
          </GradientText>
          <p className="text-white/40 text-sm mt-1">Create your universe</p>
        </div>

        <div className="rounded-2xl border border-white/[0.08] p-8"
          style={{ background:"rgba(10,14,28,0.85)", backdropFilter:"blur(32px) saturate(180%)", boxShadow:"inset 0 1px 0 rgba(255,255,255,0.08),0 32px 80px rgba(0,0,0,0.60)" }}>

          {done ? (
            <div className="text-center space-y-3 py-4">
              <div className="text-4xl">✓</div>
              <p className="text-white/80 font-semibold">Account created!</p>
              <p className="text-white/40 text-sm">Redirecting to login…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-[0.18em] text-white/35 font-semibold block">Name</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="Your name" required
                  className="w-full px-4 py-3 rounded-xl border text-sm"
                  style={{ background:"rgba(255,255,255,0.05)", borderColor:"rgba(255,255,255,0.10)", color:"rgba(255,255,255,0.9)" }} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-[0.18em] text-white/35 font-semibold block">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" required
                  className="w-full px-4 py-3 rounded-xl border text-sm"
                  style={{ background:"rgba(255,255,255,0.05)", borderColor:"rgba(255,255,255,0.10)", color:"rgba(255,255,255,0.9)" }} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-[0.18em] text-white/35 font-semibold block">Password</label>
                <div className="relative">
                  <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="Min. 8 characters" required minLength={8}
                    className="w-full px-4 py-3 pr-11 rounded-xl border text-sm"
                    style={{ background:"rgba(255,255,255,0.05)", borderColor:"rgba(255,255,255,0.10)", color:"rgba(255,255,255,0.9)" }} />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-[0.18em] text-white/35 font-semibold block">Confirm Password</label>
                <input type={showPw ? "text" : "password"} value={confirm} onChange={e => setConfirm(e.target.value)}
                  placeholder="Repeat password" required
                  className="w-full px-4 py-3 rounded-xl border text-sm"
                  style={{ background:"rgba(255,255,255,0.05)", borderColor:"rgba(255,255,255,0.10)", color:"rgba(255,255,255,0.9)" }} />
              </div>

              {error && (
                <div className="px-4 py-2.5 rounded-xl text-sm text-red-300 text-center"
                  style={{ background:"rgba(239,68,68,0.12)", border:"1px solid rgba(239,68,68,0.25)" }}>
                  {error}
                </div>
              )}

              <MovingBorderBtn type="submit" disabled={loading} containerClassName="w-full" className="w-full h-11" innerClassName="w-full justify-center">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create account"}
              </MovingBorderBtn>
            </form>
          )}
          {!done && (googleEnabled || githubEnabled) && (
            <div className="mt-5">
              <OAuthButtons google={googleEnabled} github={githubEnabled} />
            </div>
          )}
        </div>

        <p className="text-center text-sm text-white/30 mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-white/60 hover:text-white transition-colors underline underline-offset-2">
            Sign in
          </Link>
        </p>
        <p className="text-center text-xs text-white/20 mt-3">بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيم</p>
      </div>
    </div>
  );
}
