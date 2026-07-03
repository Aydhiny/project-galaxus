import { MarketingNav } from "@/components/marketing/nav";
import { MarketingFooter } from "@/components/marketing/footer";
import { SmoothScrollProvider } from "@/components/marketing/smooth-scroll-provider";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/site";

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
  publisher: { "@type": "Organization", name: "Plansio" },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <SmoothScrollProvider>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="relative min-h-screen bg-background overflow-x-hidden">
        <MarketingNav />
        <main>{children}</main>
        <MarketingFooter />
      </div>
    </SmoothScrollProvider>
  );
}
