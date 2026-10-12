import type { Metadata } from "next";
import { MarketingHero } from "@/components/marketing/hero";
import { MarketingFeatures } from "@/components/marketing/features";
import { MarketingConnectors } from "@/components/marketing/connectors";
import { MarketingPricing } from "@/components/marketing/pricing";
import { MarketingFaq } from "@/components/marketing/faq";
import { MarketingGetApp } from "@/components/marketing/get-app";
import { GhostCta, PlansioMark, PrimaryCta, SectionHead } from "@/components/marketing/ui";
import { getDesktopDownloads } from "@/lib/desktop-release";

export const metadata: Metadata = {
  title: "Galaxus — Run your life like an empire",
  description:
    "Tasks, prayers, money, gigs and your craft as a living 3D city, with automations that scout work, send emails and file deadlines for you. By Plansio.",
};

// Picks up newly published desktop installers within ~10 minutes.
export const revalidate = 600;

export default async function MarketingHomePage() {
  const downloads = await getDesktopDownloads();
  return (
    <>
      <MarketingHero />
      <MarketingFeatures />
      <MarketingConnectors />
      <MarketingPricing />
      <MarketingGetApp downloads={downloads} />

      <section id="faq" className="relative py-24 sm:py-32 px-5 sm:px-6 scroll-mt-20">
        <div className="mb-14">
          <SectionHead n="05" eyebrow="FAQ" title="Questions," accent="answered." center />
        </div>
        <MarketingFaq />
      </section>

      <section className="relative px-5 sm:px-6 pb-24">
        <div className="relative mx-auto max-w-6xl rounded-[32px] border border-white/10 overflow-hidden">
          <div className="relative bg-white/[0.02] px-6 py-16 sm:px-12 sm:py-24 text-center overflow-hidden">
            <div className="absolute inset-0 mk-grid" aria-hidden />
            <div className="relative">
              <h2 className="mk-display text-4xl sm:text-6xl font-semibold leading-[1.02] text-white">
                Your empire is <span className="mk-serif mk-accent text-[1.15em]">waiting.</span>
              </h2>
              <p className="mt-5 text-white/60 max-w-md mx-auto">Start free in under a minute. No credit card, no fifteen other apps.</p>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                <PrimaryCta href="/register">Build your empire, free</PrimaryCta>
                <GhostCta href="/login">Sign in</GhostCta>
              </div>
              <p className="mt-10 inline-flex items-center gap-2 text-xs text-white/40">A product of <PlansioMark size={20} className="text-sm" /></p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
