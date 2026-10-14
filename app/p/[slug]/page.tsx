// Public demo site for a lead: "here's how YOUR website could look".
// Private by obscurity (random slug), hidden from search engines, clearly
// labelled as a proposal — never presented as the business's real site.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarCheck, Clock, MapPin, MessageCircle, Phone, ShieldCheck, Sparkles, Star } from "lucide-react";
import { demoBySlug } from "@/lib/services/leads-auto";
import { formatPhone } from "@/lib/outreach";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const d = await demoBySlug((await params).slug);
  return { title: d ? `${d.name} — prijedlog web stranice` : "Prijedlog", robots: { index: false, follow: false } };
}

type Kind = "dental" | "beauty" | "food" | "health" | "fitness" | "generic";
const kindOf = (category: string | null, name: string): Kind => {
  const t = `${category ?? ""} ${name}`.toLowerCase();
  if (/dent|stomat|zub/.test(t)) return "dental";
  if (/hair|frizer|beauty|salon|kozmet|nail|barber|berber/.test(t)) return "beauty";
  if (/restaurant|restoran|cafe|kafi|caff|fast food|pizz|bakery|pekar/.test(t)) return "food";
  if (/clinic|klinik|doctor|doktor|ordinac|physio|fizio|vet|pharm|apotek|healthcare/.test(t)) return "health";
  if (/gym|fitness|teretan|sport/.test(t)) return "fitness";
  return "generic";
};

const COPY: Record<Kind, { accent: string; tagline: string; cta: string; services: [string, string][] }> = {
  dental: {
    accent: "#0ea5e9", tagline: "Zdrav osmijeh bez straha — moderna stomatologija u vašem gradu.", cta: "Zakažite pregled",
    services: [["Pregled i savjetovanje", "Detaljan pregled i plan terapije bez žurbe."], ["Izbjeljivanje zuba", "Bjelji osmijeh već nakon jednog tretmana."], ["Implantati i protetika", "Trajna rješenja koja izgledaju prirodno."], ["Dječija stomatologija", "Nježan pristup za najmlađe pacijente."]],
  },
  beauty: {
    accent: "#ec4899", tagline: "Vaše vrijeme za sebe — stil i njega na jednom mjestu.", cta: "Rezervišite termin",
    services: [["Šišanje i styling", "Frizura koja odgovara vama i vašem stilu."], ["Bojenje", "Prirodni tonovi i moderne tehnike."], ["Njega", "Tretmani za zdravu kosu i kožu."], ["Posebne prilike", "Izgled za vjenčanja, mature i događaje."]],
  },
  food: {
    accent: "#f97316", tagline: "Domaći okusi, svježe namirnice i mjesto u koje se vraćate.", cta: "Rezervišite sto",
    services: [["Meni", "Jela pripremljena od svježih, lokalnih namirnica."], ["Dostava", "Naručite online, bez čekanja na telefonu."], ["Proslave", "Rođendani, poslovni ručkovi i okupljanja."], ["Doručak i kafa", "Savršen početak dana."]],
  },
  health: {
    accent: "#10b981", tagline: "Stručna njega i pažnja koju zaslužujete.", cta: "Zakažite termin",
    services: [["Pregledi", "Temeljni pregledi i jasna objašnjenja."], ["Dijagnostika", "Brzi rezultati i preporuke."], ["Terapija", "Plan prilagođen upravo vama."], ["Kontrole", "Praćenje napretka bez komplikacija."]],
  },
  fitness: {
    accent: "#ef4444", tagline: "Jači svaki dan — treninzi, zajednica i rezultati.", cta: "Prijavite se",
    services: [["Članarine", "Fleksibilni paketi za svaki raspored."], ["Personalni treninzi", "Program napravljen za vaš cilj."], ["Grupni treninzi", "Energija grupe i stručni treneri."], ["Savjeti o ishrani", "Podrška i izvan teretane."]],
  },
  generic: {
    accent: "#6366f1", tagline: "Kvalitetna usluga, jasne cijene i lako zakazivanje.", cta: "Kontaktirajte nas",
    services: [["Naše usluge", "Sve što vam treba, na jednom mjestu."], ["Online upiti", "Javite nam se u par klikova, bilo kada."], ["Iskustvo", "Stručnost i povjerenje naših klijenata."], ["Lokacija", "Lako nas pronađite i posjetite."]],
  },
};

export default async function DemoPage({ params }: Props) {
  const d = await demoBySlug((await params).slug);
  if (!d) notFound();
  const kind = kindOf(d.category, d.name);
  // Copy written for this business (an agent, grounded in what's known) replaces the generic copy.
  const own = d.content;
  const c = own ? { ...COPY[kind], tagline: own.headline, cta: own.cta, services: own.services.map((s) => [s.title, s.text] as [string, string]) } : COPY[kind];
  const tel = d.phone ? `tel:${d.phone}` : null;
  const wa = d.phone && d.channel === "whatsapp" ? `https://wa.me/${d.phone.replace(/\D/g, "")}` : null;
  const days = ["Pon", "Uto", "Sri", "Čet", "Pet"].map((day, i) => ({ day, slots: ["09:00", "10:30", "13:00", "15:30"].filter((_, j) => (i + j) % 3 !== 0) }));

  return (
    <div className="min-h-screen bg-white text-slate-900" style={{ ["--accent" as string]: c.accent }}>
      <div className="bg-slate-900 text-white text-center text-xs sm:text-sm px-4 py-2">
        ✨ Prijedlog dizajna za <b>{d.name}</b> · autor: {d.senderName}. Ovo nije službena stranica.
      </div>

      <header className="max-w-5xl mx-auto px-5 py-5 flex items-center justify-between">
        <p className="font-bold text-lg tracking-tight">{d.name}</p>
        <nav className="hidden sm:flex items-center gap-6 text-sm text-slate-600">
          <a href="#usluge">Usluge</a><a href="#termin">Termin</a><a href="#kontakt">Kontakt</a>
        </nav>
        {tel && <a href={tel} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white" style={{ background: c.accent }}><Phone className="w-4 h-4" /> Pozovite</a>}
      </header>

      <section className="max-w-5xl mx-auto px-5 pt-10 pb-16 grid md:grid-cols-2 gap-10 items-center">
        <div>
          {d.rating && (
            <p className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-800">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" /> {d.rating.toFixed(1)} na Googleu{d.reviewCount ? ` · ${d.reviewCount} recenzija` : ""}
            </p>
          )}
          <h1 className="mt-4 text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.05]">{d.name}</h1>
          <p className="mt-4 text-lg text-slate-600 leading-relaxed">{c.tagline}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="#termin" className="inline-flex items-center gap-2 rounded-xl px-5 py-3 font-semibold text-white shadow-lg" style={{ background: c.accent }}><CalendarCheck className="w-5 h-5" /> {c.cta}</a>
            {wa && <a href={wa} className="inline-flex items-center gap-2 rounded-xl px-5 py-3 font-semibold border border-slate-200"><MessageCircle className="w-5 h-5" /> WhatsApp</a>}
          </div>
          <p className="mt-6 flex items-center gap-2 text-sm text-slate-500"><ShieldCheck className="w-4 h-4" /> Online zakazivanje 24/7 · bez čekanja na telefonu</p>
        </div>
        <div className="relative">
          <div className="aspect-[4/3] rounded-3xl" style={{ background: `linear-gradient(135deg, ${c.accent}22, ${c.accent}55)` }} />
          <div className="absolute -bottom-6 -left-4 sm:left-6 rounded-2xl bg-white shadow-xl border border-slate-100 p-4 w-60">
            <p className="text-xs text-slate-500">Sljedeći slobodan termin</p>
            <p className="font-semibold mt-0.5">Sutra · 10:30</p>
            <a href="#termin" className="mt-3 block text-center rounded-lg py-2 text-sm font-semibold text-white" style={{ background: c.accent }}>Rezerviši</a>
          </div>
        </div>
      </section>

      <section id="usluge" className="bg-slate-50 py-16">
        <div className="max-w-5xl mx-auto px-5">
          <h2 className="text-2xl font-bold tracking-tight">Usluge</h2>
          <div className={`mt-6 grid sm:grid-cols-2 ${c.services.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"} gap-4`}>
            {c.services.map(([title, text]) => (
              <div key={title} className="rounded-2xl bg-white border border-slate-100 p-5">
                <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${c.accent}18`, color: c.accent }}><Sparkles className="w-5 h-5" /></span>
                <p className="mt-4 font-semibold">{title}</p>
                <p className="mt-1 text-sm text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {own?.about && (
        <section className="max-w-5xl mx-auto px-5 pt-16">
          <h2 className="text-2xl font-bold tracking-tight">O nama</h2>
          <p className="mt-3 text-slate-600 leading-relaxed max-w-3xl">{own.about}</p>
        </section>
      )}

      <section id="termin" className="max-w-5xl mx-auto px-5 py-16">
        <h2 className="text-2xl font-bold tracking-tight">Online zakazivanje</h2>
        <p className="mt-2 text-slate-600">Odaberite dan i vrijeme — potvrdu dobijate odmah. <span className="text-slate-400">(Primjer kako bi radilo na vašoj stranici.)</span></p>
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-5 gap-3">
          {days.map((d) => (
            <div key={d.day} className="rounded-2xl border border-slate-200 p-3">
              <p className="font-semibold text-sm">{d.day}</p>
              <div className="mt-2 flex flex-col gap-1.5">
                {d.slots.map((s) => <span key={s} className="rounded-lg py-1.5 text-center text-sm border" style={{ borderColor: `${c.accent}55`, color: c.accent }}>{s}</span>)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="kontakt" className="bg-slate-900 text-white py-14">
        <div className="max-w-5xl mx-auto px-5 grid sm:grid-cols-3 gap-6 text-sm">
          {d.address && <p className="flex gap-2"><MapPin className="w-5 h-5 shrink-0" /> {d.address}{d.city ? `, ${d.city}` : ""}</p>}
          {d.phone && <p className="flex gap-2"><Phone className="w-5 h-5 shrink-0" /> {formatPhone(d.phone)}</p>}
          {/* Written copy only shows hours that are actually known; the generic page keeps its example hours. */}
          {(own ? own.hours : "Pon–Pet 08:00–20:00") && <p className="flex gap-2"><Clock className="w-5 h-5 shrink-0" /> {own ? own.hours : "Pon–Pet 08:00–20:00"}</p>}
          {d.mapsUrl && <a href={d.mapsUrl} target="_blank" rel="noreferrer" className="underline sm:col-span-3">Pogledajte na mapi →</a>}
        </div>
      </section>

      <footer className="text-center text-xs text-slate-500 py-6 px-4">
        Ovo je demo prijedlog nove web stranice za {d.name}, napravljen od strane {d.senderName}. Nije službena stranica i nije povezan s vašim poslovanjem dok to ne dogovorimo.
      </footer>
    </div>
  );
}
