"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Castle, Menu } from "lucide-react";
import { useSession } from "next-auth/react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { GalaxusMark, PlansioMark } from "@/components/marketing/ui";

const NAV_LINKS = [
  { href: "#empire", label: "Empire" },
  { href: "#features", label: "Features" },
  { href: "#connectors", label: "Connectors" },
  { href: "#pricing", label: "Pricing" },
  { href: "#download", label: "Get the app" },
  { href: "#faq", label: "FAQ" },
];

export function MarketingNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { status } = useSession();
  const authed = status === "authenticated"; // signed in → straight back to your empire

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const cta = authed
    ? { href: "/empire", label: "Open your empire", icon: <Castle className="w-4 h-4" /> }
    : { href: "/register", label: "Get started", icon: <ArrowUpRight className="w-4 h-4" /> };

  return (
    <header className="fixed top-0 inset-x-0 z-50 px-4 sm:px-6 pt-4">
      <div className="mx-auto max-w-6xl">
        <div className={cn("flex items-center justify-between rounded-2xl px-4 sm:px-5 py-2.5 border transition-all duration-300",
          scrolled ? "bg-zinc-950/75 backdrop-blur-xl border-white/10" : "bg-transparent border-transparent")}>
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/" aria-label="Galaxus home"><GalaxusMark /></Link>
            <span className="hidden sm:block h-5 w-px bg-white/15" />
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-white/45">by <PlansioMark size={18} className="text-[13px]" /></span>
          </div>

          <nav className="hidden lg:flex items-center gap-7">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="text-sm text-white/60 hover:text-white transition-colors">{l.label}</a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            {!authed && <Link href="/login" className="h-9 px-4 rounded-full text-sm text-white/75 hover:text-white inline-flex items-center">Sign in</Link>}
            <Link href={cta.href} className="h-9 px-4 rounded-full bg-white text-zinc-950 text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-zinc-200 transition-colors">
              {cta.label} {cta.icon}
            </Link>
          </div>

          <button onClick={() => setOpen(true)} className="md:hidden p-2 -mr-2 text-white/80 hover:text-white" aria-label="Open menu">
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="dark p-6 w-72 bg-zinc-950 text-white border-white/10">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div className="flex flex-col gap-6 mt-8">
            <GalaxusMark />
            <nav className="flex flex-col gap-4">
              {NAV_LINKS.map((l) => (
                <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="text-base font-medium text-white/80 hover:text-white">{l.label}</a>
              ))}
            </nav>
            <div className="flex flex-col gap-3 pt-4 border-t border-white/10">
              {!authed && <Link href="/login" onClick={() => setOpen(false)} className="h-11 rounded-full border border-white/15 inline-flex items-center justify-center text-sm">Sign in</Link>}
              <Link href={cta.href} onClick={() => setOpen(false)} className="h-11 rounded-full bg-white text-zinc-950 inline-flex items-center justify-center gap-1.5 text-sm font-semibold">{cta.label} {cta.icon}</Link>
            </div>
            <p className="text-xs text-white/40 inline-flex items-center gap-1.5">Crafted by <PlansioMark size={16} className="text-[13px]" /></p>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
