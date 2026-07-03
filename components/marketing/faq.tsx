"use client";

import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

const FAQS = [
  {
    q: "Is my data private and separate from other accounts?",
    a: "Yes. Every account's habits, prayers, goals, journal entries, and creative logs are fully isolated — no one else can see or touch your data, and you can't see theirs.",
  },
  {
    q: "Is Galaxus tied to a specific religion?",
    a: "Galaxus was built with Islamic spiritual practice in mind — prayer times, Quran progress, and duas are first-class features — but it's just as much a habit, goal, and creative tracker for anyone. Use the pillars that matter to you and ignore the rest.",
  },
  {
    q: "Can I use Galaxus for free?",
    a: "Yes — the Free plan covers daily check-ins, goals, journaling, and spiritual tracking with no time limit. Pro adds deeper insights, unlimited history, and more customization.",
  },
  {
    q: "Does it work on my phone?",
    a: "Galaxus is a installable web app (PWA) — add it to your home screen on iOS or Android for an app-like experience, with offline support for your core pages.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes, there's no lock-in. Downgrade or delete your account whenever you'd like.",
  },
];

export function MarketingFaq() {
  return (
    <Accordion defaultValue={[0]} className="max-w-2xl mx-auto">
      {FAQS.map((f, i) => (
        <AccordionItem key={i} value={i} className="glass rounded-xl px-5 mb-3 border-0">
          <AccordionTrigger className="font-heading text-base">{f.q}</AccordionTrigger>
          <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
