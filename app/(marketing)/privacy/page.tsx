import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Galaxus",
  description: "How Plansio collects, uses, and protects your data on Galaxus.",
};

const LAST_UPDATED = "July 3, 2026";

export default function PrivacyPage() {
  return (
    <div className="pt-32 pb-24 px-4 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <p className="section-label mb-3">Legal</p>
        <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: {LAST_UPDATED}</p>

        <div className="flex flex-col gap-8 text-sm sm:text-base text-foreground/85 leading-relaxed">
          <p>
            Plansio (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates Galaxus (the &quot;Service&quot;). This
            Privacy Policy explains what information we collect, how we use it, and the choices you have. By using
            Galaxus, you agree to the collection and use of information as described here.
          </p>

          <section>
            <h2 className="font-heading text-lg font-semibold mb-2">1. Information we collect</h2>
            <p className="mb-2">We collect the minimum information needed to run the Service:</p>
            <ul className="list-disc pl-5 flex flex-col gap-1.5 text-muted-foreground">
              <li><strong className="text-foreground/85">Account data</strong> — your name, email address, and a hashed password.</li>
              <li><strong className="text-foreground/85">Content you create</strong> — habits, prayers, goals, journal entries, workouts, reading logs, and other data you enter into your account.</li>
              <li><strong className="text-foreground/85">Usage data</strong> — basic, aggregated analytics (page views, performance metrics) via Vercel Analytics and Speed Insights, which do not identify you personally.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-heading text-lg font-semibold mb-2">2. How we use your information</h2>
            <p className="text-muted-foreground">
              We use your information solely to operate, maintain, and improve Galaxus — to authenticate you, store
              and display your own data back to you, and to understand aggregate usage so we can improve the
              product. We do not sell your personal data.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-semibold mb-2">3. Data isolation</h2>
            <p className="text-muted-foreground">
              Every account&apos;s content is strictly isolated at the database level. No other user — including
              other free or paid accounts — can read or write your data.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-semibold mb-2">4. Third-party services</h2>
            <p className="text-muted-foreground">
              We rely on a small number of infrastructure providers to run Galaxus, including our hosting provider
              (Vercel) and database provider (Neon). These providers process data on our behalf and are bound by
              their own privacy and security commitments; we do not share your data with advertisers.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-semibold mb-2">5. Data retention & deletion</h2>
            <p className="text-muted-foreground">
              We retain your account and content for as long as your account is active. You may request deletion of
              your account and all associated data at any time by contacting us; deletion is permanent.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-semibold mb-2">6. Your rights</h2>
            <p className="text-muted-foreground">
              Depending on where you live, you may have rights to access, correct, export, or delete your personal
              data. Contact us and we will respond promptly.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-semibold mb-2">7. Changes to this policy</h2>
            <p className="text-muted-foreground">
              We may update this policy from time to time. We&apos;ll update the &quot;Last updated&quot; date above
              when we do.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-semibold mb-2">8. Contact</h2>
            <p className="text-muted-foreground">
              Questions about this policy? Reach out to us at{" "}
              <a href="mailto:privacy@plansio.app" className="text-primary hover:underline">privacy@plansio.app</a>.
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
