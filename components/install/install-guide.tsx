"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Share, SquarePlus, Check, Download, Compass, MonitorDown, AppWindow, Apple, ShieldAlert, Sparkles, Smartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useInstall, type Platform } from "@/lib/hooks/use-install";
import type { DesktopDownloads } from "@/lib/desktop-release";

type Tab = "ios" | "mac" | "windows" | "android";

const TABS: { id: Tab; label: string }[] = [
  { id: "ios", label: "iPhone & iPad" },
  { id: "mac", label: "Mac" },
  { id: "windows", label: "Windows" },
  { id: "android", label: "Android" },
];

function tabFor(p: Platform): Tab {
  if (p === "ios-safari" || p === "ios-other") return "ios";
  if (p === "mac" || p === "mac-safari") return "mac";
  if (p === "android") return "android";
  return "windows";
}

export function InstallGuide({ downloads }: { downloads: DesktopDownloads }) {
  const { platform, installed, canPrompt, promptInstall } = useInstall();
  const [chosen, setChosen] = useState<Tab | null>(null);
  const tab = chosen ?? tabFor(platform);
  const onThisDevice = tab === tabFor(platform);

  return (
    <div className="min-h-dvh bg-background text-foreground px-5 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-4">
          <Image src="/icons/apple-touch-icon.png" alt="" width={60} height={60} className="rounded-[15px] ring-1 ring-border" priority />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Get the Galaxus app</h1>
            <p className="text-sm text-muted-foreground">Its own icon and window. Opens instantly, always up to date.</p>
          </div>
        </div>

        {installed && (
          <div className="mt-8 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <p className="flex items-center gap-2 font-medium"><Check className="w-4 h-4 text-emerald-500" /> You&apos;re already using the installed app.</p>
          </div>
        )}

        <div className="mt-8 grid grid-cols-4 rounded-lg border border-border p-0.5 bg-muted/50" role="tablist" aria-label="Device">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setChosen(t.id)}
              className={cn(
                "px-1 h-9 rounded-md text-xs sm:text-sm transition-colors whitespace-nowrap",
                tab === t.id ? "bg-background shadow-xs font-medium" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-6 space-y-6" role="tabpanel">
          {tab === "ios" && (
            <Option title="Add to Home Screen" badge="Recommended" icon={Smartphone}>
              {platform === "ios-other" && onThisDevice && (
                <Note icon={Compass}>For the smoothest install, open this page in <b>Safari</b>.</Note>
              )}
              <ol className="space-y-2.5">
                <Step n={1} icon={Share}>Open <b>project-galaxus.vercel.app</b> in <b>Safari</b> and tap <b>Share</b> (square with an arrow).</Step>
                <Step n={2} icon={SquarePlus}>Scroll down and tap <b>Add to Home Screen</b>.</Step>
                <Step n={3} icon={Check}>Tap <b>Add</b>. Galaxus opens full-screen from your home screen.</Step>
              </ol>
              <p className="text-xs text-muted-foreground">
                Sign in once inside the app — iOS keeps home-screen apps separate from Safari. An App Store version
                isn&apos;t available (it needs Apple&apos;s paid developer program); this install is the same app.
              </p>
            </Option>
          )}

          {tab === "mac" && (
            <>
              <Option title="Install from your browser" badge="Recommended · no warnings" icon={Sparkles}>
                {canPrompt && onThisDevice ? (
                  <PrimaryButton onClick={promptInstall} icon={MonitorDown}>Install Galaxus</PrimaryButton>
                ) : (
                  <ol className="space-y-2.5">
                    <Step n={1} icon={Compass}><b>Safari</b> (macOS Sonoma or newer): menu bar → <b>File → Add to Dock</b>.</Step>
                    <Step n={2} icon={AppWindow}><b>Chrome / Edge</b>: click the install icon at the right of the address bar, then <b>Install</b>.</Step>
                  </ol>
                )}
                <p className="text-xs text-muted-foreground">Appears in your Dock and Launchpad like any app, and updates itself.</p>
              </Option>
              <DownloadOption
                platform="mac"
                url={downloads.mac}
                version={downloads.version}
                releaseUrl={downloads.releaseUrl}
                label="Download for Mac (.dmg)"
                detail="Universal — Apple Silicon (M1–M4) and Intel. Open the .dmg and drag Galaxus to Applications."
                warning={<>First launch: if macOS says it can&apos;t check the app, open <b>System Settings → Privacy &amp; Security</b> and click <b>Open Anyway</b> (one time).</>}
              />
            </>
          )}

          {tab === "windows" && (
            <>
              <Option title="Install from your browser" badge="Recommended · no warnings" icon={Sparkles}>
                {canPrompt && onThisDevice ? (
                  <PrimaryButton onClick={promptInstall} icon={MonitorDown}>Install Galaxus</PrimaryButton>
                ) : (
                  <ol className="space-y-2.5">
                    <Step n={1} icon={AppWindow}>In <b>Edge</b> or <b>Chrome</b>, click the install icon at the right end of the address bar.</Step>
                    <Step n={2} icon={Check}>Click <b>Install</b>. Pin it to the taskbar or Start if you like.</Step>
                  </ol>
                )}
                <p className="text-xs text-muted-foreground">Gets its own window, Start-menu entry and taskbar icon, and updates itself.</p>
              </Option>
              <DownloadOption
                platform="windows"
                url={downloads.windows}
                version={downloads.version}
                releaseUrl={downloads.releaseUrl}
                label="Download for Windows (.exe)"
                detail="Windows 10 and 11. Installs for your user only — no admin rights needed."
                warning={<>If SmartScreen appears, click <b>More info → Run anyway</b> (one time). The installer isn&apos;t code-signed yet.</>}
              />
            </>
          )}

          {tab === "android" && (
            <Option title="Install from Chrome" badge="Recommended" icon={Smartphone}>
              {canPrompt && onThisDevice ? (
                <PrimaryButton onClick={promptInstall} icon={Download}>Install Galaxus</PrimaryButton>
              ) : (
                <ol className="space-y-2.5">
                  <Step n={1} icon={AppWindow}>In Chrome, tap the <b>⋮</b> menu.</Step>
                  <Step n={2} icon={Download}>Tap <b>Install app</b> (or <b>Add to Home screen</b>).</Step>
                </ol>
              )}
            </Option>
          )}
        </div>

        <div className="mt-10 text-sm text-muted-foreground">
          <Link href="/productivity" className="hover:text-foreground">Or continue in the browser →</Link>
        </div>
      </div>
    </div>
  );
}

function Option({ title, badge, icon: Icon, children }: {
  title: string; badge?: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center"><Icon className="w-4 h-4" /></span>
        <h2 className="font-semibold flex-1">{title}</h2>
        {badge && <span className="text-[11px] font-medium rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-0.5">{badge}</span>}
      </div>
      {children}
    </section>
  );
}

function DownloadOption({ platform, url, version, releaseUrl, label, detail, warning }: {
  platform: "mac" | "windows"; url: string | null; version: string | null; releaseUrl: string;
  label: string; detail: string; warning: React.ReactNode;
}) {
  const Icon = platform === "mac" ? Apple : MonitorDown;
  return (
    <section className="rounded-2xl border border-border p-5 space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center"><Icon className="w-4 h-4" /></span>
        <h2 className="font-semibold flex-1">Or download the desktop app</h2>
        {version && <span className="text-xs text-muted-foreground tabular-nums">v{version}</span>}
      </div>
      <p className="text-sm text-muted-foreground">{detail}</p>
      {url ? (
        <a href={url} className="w-full h-11 rounded-lg border border-input bg-background text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-accent transition-colors">
          <Download className="w-4 h-4" /> {label}
        </a>
      ) : (
        <p className="text-sm text-muted-foreground rounded-lg bg-muted px-3 py-2.5">
          The installer is being built — check back shortly, or see <a href={releaseUrl} className="underline underline-offset-4">all releases</a>.
        </p>
      )}
      <Note icon={ShieldAlert}>{warning}</Note>
    </section>
  );
}

function Note({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <p className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed">
      <Icon className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" /> <span>{children}</span>
    </p>
  );
}

function Step({ n, icon: Icon, children }: { n: number; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-border bg-background p-3">
      <span className="w-6 h-6 shrink-0 rounded-full bg-muted text-xs font-semibold flex items-center justify-center">{n}</span>
      <span className="text-sm pt-0.5 flex-1">{children}</span>
      <Icon className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
    </li>
  );
}

function PrimaryButton({ onClick, icon: Icon, children }: { onClick: () => void; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="w-full h-11 rounded-lg bg-primary text-primary-foreground text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-primary/90">
      <Icon className="w-4 h-4" /> {children}
    </button>
  );
}
