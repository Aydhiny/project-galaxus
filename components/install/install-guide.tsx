"use client";

import Link from "next/link";
import Image from "next/image";
import { Share, SquarePlus, Check, Smartphone, Download, Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInstall, type Platform } from "@/lib/hooks/use-install";
import { LogoMark } from "@/components/auth-shell";

const TABS: { id: Platform | "ios"; label: string }[] = [
  { id: "ios", label: "iPhone / iPad" },
  { id: "android", label: "Android" },
  { id: "desktop", label: "Desktop" },
];

export function InstallGuide() {
  const { platform, installed, canPrompt, promptInstall } = useInstall();
  const active = platform === "ios-safari" || platform === "ios-other" ? "ios" : platform;

  return (
    <div className="min-h-dvh bg-background text-foreground px-5 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-3">
          <Image src="/icons/apple-touch-icon.png" alt="" width={56} height={56} className="rounded-[14px] ring-1 ring-border" priority />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Get the Galaxus app</h1>
            <p className="text-sm text-muted-foreground">Full screen, its own icon, opens instantly.</p>
          </div>
        </div>

        {installed ? (
          <div className="mt-8 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5">
            <p className="flex items-center gap-2 font-medium"><Check className="w-4 h-4 text-emerald-500" /> You&apos;re using the installed app.</p>
            <Link href="/productivity" className="inline-block mt-3 text-sm underline underline-offset-4">Go to today →</Link>
          </div>
        ) : (
          <>
            <div className="mt-8 inline-flex rounded-lg border border-border p-0.5 bg-muted/50 w-full" role="tablist">
              {TABS.map((t) => (
                <a
                  key={t.id}
                  href={`#${t.id}`}
                  role="tab"
                  aria-selected={active === t.id}
                  className={cn(
                    "flex-1 text-center px-2 h-8 leading-8 rounded-md text-sm transition-colors",
                    active === t.id ? "bg-background shadow-xs font-medium" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t.label}
                </a>
              ))}
            </div>

            {/* iOS */}
            <section id="ios" className={cn("mt-6", active !== "ios" && "opacity-70")}>
              <h2 className="font-semibold mb-1">iPhone &amp; iPad</h2>
              {platform === "ios-other" && (
                <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
                  <Compass className="inline w-4 h-4 mr-1 -mt-0.5" /> For the smoothest install, open this page in <b>Safari</b>.
                </p>
              )}
              <ol className="space-y-3 mt-3">
                <Step n={1} icon={Share}>Tap the <b>Share</b> button in Safari&apos;s toolbar (square with an arrow).</Step>
                <Step n={2} icon={SquarePlus}>Scroll down and tap <b>Add to Home Screen</b>.</Step>
                <Step n={3} icon={Check}>Tap <b>Add</b>. Galaxus now opens full-screen from your home screen.</Step>
              </ol>
              <p className="text-xs text-muted-foreground mt-3">
                You&apos;ll sign in once inside the app (iOS keeps home-screen apps separate from Safari).
              </p>
            </section>

            {/* Android */}
            <section id="android" className={cn("mt-8", active !== "android" && "opacity-70")}>
              <h2 className="font-semibold mb-3">Android</h2>
              {canPrompt && active === "android" ? (
                <InstallButton onClick={promptInstall} />
              ) : (
                <ol className="space-y-3">
                  <Step n={1} icon={Smartphone}>In Chrome, tap the <b>⋮</b> menu.</Step>
                  <Step n={2} icon={Download}>Tap <b>Install app</b> (or <b>Add to Home screen</b>).</Step>
                </ol>
              )}
            </section>

            {/* Desktop */}
            <section id="desktop" className={cn("mt-8", active !== "desktop" && "opacity-70")}>
              <h2 className="font-semibold mb-3">Desktop (Chrome, Edge)</h2>
              {canPrompt && active === "desktop" ? (
                <InstallButton onClick={promptInstall} />
              ) : (
                <p className="text-sm text-muted-foreground">Click the install icon at the right end of the address bar, or use the browser menu → <b>Install Galaxus</b>.</p>
              )}
            </section>
          </>
        )}

        <div className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
          <LogoMark className="w-6 h-6 text-xs rounded-md" />
          <Link href="/productivity" className="hover:text-foreground">Continue in the browser</Link>
        </div>
      </div>
    </div>
  );
}

function Step({ n, icon: Icon, children }: { n: number; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5">
      <span className="w-7 h-7 shrink-0 rounded-full bg-muted text-xs font-semibold flex items-center justify-center">{n}</span>
      <span className="text-sm pt-1 flex-1">{children}</span>
      <Icon className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
    </li>
  );
}

function InstallButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full h-11 rounded-lg bg-primary text-primary-foreground text-sm font-medium inline-flex items-center justify-center gap-2">
      <Download className="w-4 h-4" /> Install Galaxus
    </button>
  );
}
