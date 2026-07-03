import Link from "next/link";

const FOOTER_LINKS = {
  Product: [
    { href: "#features", label: "Features" },
    { href: "#pricing", label: "Pricing" },
    { href: "#faq", label: "FAQ" },
  ],
  Account: [
    { href: "/login", label: "Sign in" },
    { href: "/register", label: "Create account" },
  ],
  Legal: [
    { href: "/privacy", label: "Privacy Policy" },
    { href: "/terms", label: "Terms of Service" },
  ],
};

export function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative border-t border-border/60 mt-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-lg" style={{ filter: "drop-shadow(0 0 8px rgba(23,62,255,0.8))" }}>✦</span>
              <span className="font-heading font-bold text-lg tracking-tight">Galaxus</span>
            </Link>
            <p className="text-sm text-muted-foreground mt-3 max-w-[22ch]">
              Your personal universe — habits, goals, and growth, all in one place.
            </p>
          </div>

          {Object.entries(FOOTER_LINKS).map(([section, links]) => (
            <div key={section}>
              <p className="section-label mb-3">{section}</p>
              <ul className="flex flex-col gap-2.5">
                {links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="lw-divider" />

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>© {year} Galaxus. Built by Plansio.</p>
          <p className="text-muted-foreground/60">Made for people building a life, not just a to-do list.</p>
        </div>
      </div>
    </footer>
  );
}
