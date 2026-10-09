import Image from "next/image";
import Link from "next/link";
import { Check, RefreshCw } from "lucide-react";
import { PlatformInstall } from "@/components/install/install-guide";
import type { DesktopDownloads } from "@/lib/desktop-release";

// Benefits, not platforms — the device tabs on the right already list those.
const BENEFITS = [
  "Its own icon, window and Dock / taskbar spot",
  "Always the latest version — nothing to update",
  "Free on every device",
];

/** Landing-page "Get the app" section — same install panel as /install. */
export function MarketingGetApp({ downloads }: { downloads: DesktopDownloads }) {
  return (
    <section id="download" className="relative py-24 sm:py-32 px-4 sm:px-6 scroll-mt-20">
      <div className="mx-auto max-w-5xl grid gap-12 lg:grid-cols-[1fr_1.15fr] lg:items-start">
        <div className="lg:sticky lg:top-28">
          <p className="section-label mb-3">Get the app</p>
          <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">On every screen you own.</h2>
          <p className="mt-4 text-muted-foreground max-w-md">
            Install Galaxus on your phone, Mac or PC. It opens in its own window with its own icon — and because it
            runs the live app, you always have the newest version without updating anything.
          </p>

          <ul className="mt-8 space-y-2.5">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-center gap-2.5 text-sm">
                <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Check className="w-3 h-3" strokeWidth={3} />
                </span>
                {b}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex items-center gap-3 text-sm text-muted-foreground">
            <Image src="/icons/apple-touch-icon.png" alt="" width={36} height={36} className="rounded-[9px] ring-1 ring-border" />
            <span className="inline-flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              {downloads.version ? `Desktop v${downloads.version} · ` : ""}updates itself
            </span>
            <Link href="/install" className="ml-auto underline-offset-4 hover:underline hover:text-foreground">Full guide →</Link>
          </div>
        </div>

        <PlatformInstall downloads={downloads} />
      </div>
    </section>
  );
}
