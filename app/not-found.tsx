import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#070b18] relative overflow-hidden px-4">
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full blur-[120px] opacity-25 bg-[#173eff]" />
      </div>
      <div className="relative z-10 text-center max-w-sm">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6"
          style={{ background: "rgba(23,62,255,0.12)", border: "1px solid rgba(23,62,255,0.28)" }}
        >
          <Compass className="w-7 h-7 text-[#818cf8]" />
        </div>
        <p className="text-6xl font-heading font-bold text-white mb-2">404</p>
        <h1 className="text-lg font-semibold text-white/90 mb-2">This corner of the universe is empty</h1>
        <p className="text-sm text-white/40 mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has drifted elsewhere.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{ background: "linear-gradient(135deg, #173eff 0%, #3758f9 100%)" }}
        >
          Back to Galaxus
        </Link>
      </div>
    </div>
  );
}
