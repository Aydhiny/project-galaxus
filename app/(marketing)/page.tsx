import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/hero";
import { MarketingPillars } from "@/components/marketing/pillars";
import { MarketingProductPreview } from "@/components/marketing/product-preview";
import { MarketingPricing } from "@/components/marketing/pricing";
import { MarketingFaq } from "@/components/marketing/faq";
import { MovingBorderBtn } from "@/components/aceternity/moving-border-btn";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Galaxus — Your Personal Growth Universe",
  description:
    "Habits, prayers, goals, deep work, and creative projects — tracked, streaked, and visualized in one calm, beautiful space. Built by Plansio.",
};

export default function MarketingHomePage() {
  return (
    <>
      <MarketingHero />
      <MarketingPillars />
      <MarketingProductPreview />
      <MarketingPricing />

      <section id="faq" className="relative py-24 sm:py-32 px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center mb-14">
          <p className="section-label mb-3">FAQ</p>
          <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">Questions, answered</h2>
        </div>
        <MarketingFaq />
      </section>

      <section className="relative py-24 sm:py-28 px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">
            Your universe is waiting.
          </h2>
          <p className="mt-4 text-muted-foreground max-w-md mx-auto">
            Start free in under a minute — no credit card, no fifteen other apps.
          </p>
          <Link href="/register" className="inline-block mt-8">
            <MovingBorderBtn className="px-7 py-3 text-[15px]" duration={4}>
              Start your universe — free
              <ArrowRight className="w-4 h-4" />
            </MovingBorderBtn>
          </Link>
        </div>
      </section>
    </>
  );
}
