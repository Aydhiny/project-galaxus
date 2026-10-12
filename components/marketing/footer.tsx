import Link from "next/link";
import { GalaxusMark, PlansioMark } from "@/components/marketing/ui";

const FOOTER_LINKS = {
  Product: [
    { href: "#empire", label: "Empire" },
    { href: "#features", label: "Features" },
    { href: "#connectors", label: "Connectors" },
    { href: "#pricing", label: "Pricing" },
    { href: "#faq", label: "FAQ" },
  ],
  Account: [
    { href: "/login", label: "Sign in" },
    { href: "/register", label: "Create account" },
    { href: "/install", label: "Install the app" },
  ],
  Legal: [
    { href: "/privacy", label: "Privacy Policy" },
    { href: "/terms", label: "Terms of Service" },
  ],
};

export function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative border-t border-white/[0.08] mt-12">
      <div className="mx-auto max-w-6xl px-5 sm:px-6 py-14">
        <div className="grid grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr_1fr] gap-10">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" aria-label="Galaxus home"><GalaxusMark /></Link>
            <p className="text-sm text-white/50 mt-4 max-w-[30ch] leading-relaxed">Your life as a living 3D empire: habits, faith, money and craft in one place.</p>
            <div className="mt-6 inline-flex items-center gap-3 rounded-2xl mk-card px-4 py-3">
              <PlansioMark size={30} label={false} />
              <span className="text-xs text-white/55 leading-tight">Designed &amp; built by<br /><a href="https://plansio.agency" target="_blank" rel="noopener" className="mk-serif text-base text-white hover:mk-accent">Plansio</a></span>
            </div>
          </div>

          {Object.entries(FOOTER_LINKS).map(([section, links]) => (
            <div key={section}>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/40 mb-4">{section}</p>
              <ul className="flex flex-col gap-2.5">
                {links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-white/60 hover:text-white transition-colors">{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-6 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/40">
          <p>© {year} Galaxus · a <a href="https://plansio.agency" target="_blank" rel="noopener" className="hover:text-white">Plansio</a> product</p>
          <p>Made for people building a life, not just a to-do list.</p>
        </div>
      </div>
    </footer>
  );
}
