import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Galaxus",
  description: "The terms governing your use of Galaxus, built by Plansio.",
};

const LAST_UPDATED = "July 3, 2026";

export default function TermsPage() {
  return (
    <div className="pt-32 pb-24 px-4 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <p className="section-label mb-3">Legal</p>
        <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: {LAST_UPDATED}</p>

        <div className="flex flex-col gap-8 text-sm sm:text-base text-foreground/85 leading-relaxed">
          <p>
            These Terms of Service (&quot;Terms&quot;) govern your access to and use of Galaxus (the
            &quot;Service&quot;), operated by Plansio (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;). By creating
            an account or using the Service, you agree to these Terms.
          </p>

          <section>
            <h2 className="font-heading text-lg font-semibold mb-2">1. Your account</h2>
            <p className="text-muted-foreground">
              You&apos;re responsible for maintaining the confidentiality of your login credentials and for all
              activity under your account. You must provide accurate information when registering and keep it up to
              date.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-semibold mb-2">2. Acceptable use</h2>
            <p className="text-muted-foreground">
              You agree not to misuse the Service — including attempting to access another user&apos;s data, disrupt
              the Service, or use it for any unlawful purpose.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-semibold mb-2">3. Plans & billing</h2>
            <p className="text-muted-foreground">
              Galaxus offers a Free plan and a paid Pro plan. Where billing is enabled, fees are charged in advance
              on a recurring basis and are non-refundable except where required by law. You can cancel a paid plan
              at any time; your access continues until the end of the current billing period.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-semibold mb-2">4. Your content</h2>
            <p className="text-muted-foreground">
              You retain ownership of everything you enter into Galaxus. We only use your content to provide the
              Service back to you — we don&apos;t claim ownership of it, and we don&apos;t share it with other users
              or third parties.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-semibold mb-2">5. Termination</h2>
            <p className="text-muted-foreground">
              You may stop using the Service and request account deletion at any time. We may suspend or terminate
              accounts that violate these Terms.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-semibold mb-2">6. Disclaimer & limitation of liability</h2>
            <p className="text-muted-foreground">
              The Service is provided &quot;as is&quot; without warranties of any kind. To the maximum extent
              permitted by law, Plansio is not liable for any indirect, incidental, or consequential damages arising
              from your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-semibold mb-2">7. Changes to these Terms</h2>
            <p className="text-muted-foreground">
              We may update these Terms from time to time. Continued use of the Service after changes take effect
              means you accept the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-semibold mb-2">8. Contact</h2>
            <p className="text-muted-foreground">
              Questions about these Terms? Reach out to us at{" "}
              <a href="mailto:hello@plansio.app" className="text-primary hover:underline">hello@plansio.app</a>.
            </p>
          </section>

          <p className="text-xs text-muted-foreground/60 pt-4 border-t border-border">
            This document is a general template and does not constitute legal advice. Plansio recommends consulting
            a qualified attorney to ensure full compliance with applicable law before relying on it.
          </p>
        </div>
      </div>
    </div>
  );
}
