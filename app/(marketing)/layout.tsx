import { EB_Garamond, Unbounded } from "next/font/google";
import { MarketingNav } from "@/components/marketing/nav";
import { MarketingFooter } from "@/components/marketing/footer";
import { SmoothScrollProvider } from "@/components/marketing/smooth-scroll-provider";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/site";

// Landing-only type: a wide display face for headlines, an italic serif for accent words.
const display = Unbounded({ variable: "--font-display", subsets: ["latin"], weight: ["500", "600", "700"] });
const serif = EB_Garamond({ variable: "--font-serif", subsets: ["latin"], style: ["italic"], weight: ["500"] });

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  description: SITE_DESCRIPTION,
  applicationCategory: "LifestyleApplication",
  operatingSystem: "Web",
  url: SITE_URL,
  offers: [
    { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
    { "@type": "Offer", name: "Pro", price: "6", priceCurrency: "USD" },
  ],
  publisher: { "@type": "Organization", name: "Plansio", url: "https://plansio.agency" },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <SmoothScrollProvider>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* "dark" scopes the theme tokens so every section shares one dark palette. */}
      <div className={`dark mk ${display.variable} ${serif.variable} relative min-h-screen overflow-x-hidden`}>
        <MarketingNav />
        <main>{children}</main>
        <MarketingFooter />
      </div>
    </SmoothScrollProvider>
  );
}
