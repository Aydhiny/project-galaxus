"use client";

import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

const FAQS = [
  {
    q: "Is my data private and separate from other accounts?",
    a: "Yes. Every account is fully isolated, and your diary is encrypted and only opens with your PIN. Sharing your 3D city is opt-in, and visitors only see building levels and numbers, never your tasks, emails, deals or diary.",
  },
  {
    q: "Do I need my own Claude?",
    a: "For the AI features, yes. Galaxus never shares one person's AI with another. Connect your own Claude subscription (a two-minute GitHub runner setup) or paste your own Anthropic API key. Everything else works without it.",
  },
  {
    q: "Will the automations message people for me?",
    a: "Email autopilot starts in shadow mode (drafts only) until you switch it on, and only applies to posts that ask for email. Outreach drafts WhatsApp and email messages that you send yourself. Galaxus never bot-DMs anyone on Reddit or Instagram.",
  },
  {
    q: "Is Galaxus tied to a specific religion?",
    a: "Galaxus was built with Islamic spiritual practice in mind — prayer times, Quran progress, and duas are first-class features — but it's just as much a habit, goal, and creative tracker for anyone. Use the pillars that matter to you and ignore the rest.",
  },
  {
    q: "Can I use Galaxus for free?",
    a: "Yes. The Free plan includes your empire, tasks, goals, prayer times and the private diary with no time limit. Pro adds deeper insights, unlimited history and more customization.",
  },
  {
    q: "Is there an app for my phone or computer?",
    a: "Yes — Galaxus installs on iPhone, iPad, Android, Mac and Windows. On phones, add it to your home screen; on Mac and Windows, install it from your browser or download the desktop app. See “Get the app” above — it always runs the latest version.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes, there's no lock-in. Downgrade or delete your account whenever you'd like.",
  },
];

export function MarketingFaq() {
  return (
    <Accordion defaultValue={[0]} className="max-w-3xl mx-auto">
      {FAQS.map((f, i) => (
        <AccordionItem key={i} value={i} className="mk-card rounded-2xl px-5 sm:px-6 mb-3 border-0">
          <AccordionTrigger className="mk-display text-[15px] font-medium text-white hover:no-underline">{f.q}</AccordionTrigger>
          <AccordionContent className="text-white/60 leading-relaxed">{f.a}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
