import { MarketingNav } from "@/components/marketing/nav";
import { MarketingFooter } from "@/components/marketing/footer";
import { SmoothScrollProvider } from "@/components/marketing/smooth-scroll-provider";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <SmoothScrollProvider>
      <div className="relative min-h-screen bg-background overflow-x-hidden">
        <MarketingNav />
        <main>{children}</main>
        <MarketingFooter />
      </div>
    </SmoothScrollProvider>
  );
}
