import { describe, expect, it } from "vitest";
import { cleanDemoContent, demoPrompt, knownHours, leadColumns, needsDemoCopy, opsPlaceId, opsRowToLead, templateDemo } from "@/lib/outreach-bridge";

const HEADER = ["Name", "Category", "Address", "Phone", "WhatsApp", "Email", "Website", "Website status", "Source"];

describe("sheet rows → leads", () => {
  const cols = leadColumns(HEADER)!;

  it("maps the business-finder columns, normalises the phone and picks WhatsApp for a BiH mobile", () => {
    const l = opsRowToLead(cols, ["Dental Smile", "Dentists", "Ferhadija 5, Sarajevo", "061 123 456", "yes", "info@smile.ba", "", "No website", "OSM (https://www.openstreetmap.org/node/123)"], "Sarajevo", "mission #7")!;
    expect(l).toMatchObject({
      placeId: "osm:node/123", name: "Dental Smile", category: "Dentists", phone: "+38761123456", channel: "whatsapp",
      address: "Ferhadija 5, Sarajevo", city: "Sarajevo", website: null, mapsUrl: "https://www.openstreetmap.org/node/123", tags: ["ops"],
    });
    expect(l.notes).toContain("From Ops (mission #7)");
    expect(l.notes).toContain("Website status: No website");
    expect(l.notes).toContain("Email: info@smile.ba");
  });

  it("a landline is a call, a bare domain becomes a link, no source → a stable ops: id", () => {
    const row = ["Auto Servis Bašić", "Car repair", "Zmaja od Bosne 1", "+387 33 123 456", "no", "", "basic.ba", "Not mobile-friendly", ""];
    const a = opsRowToLead(cols, row, null, "mission #1")!;
    expect(a).toMatchObject({ phone: "+38733123456", channel: "call", website: "https://basic.ba", city: null, mapsUrl: null });
    expect(a.placeId).toMatch(/^ops:[0-9a-f]{16}$/);
    expect(opsRowToLead(cols, row, null, "mission #2")!.placeId).toBe(a.placeId); // same business, same id
    expect(opsPlaceId("Other", "Zmaja od Bosne 1", "")).not.toBe(a.placeId);
  });

  it("columns in any order; tables without a name or contact columns aren't lead lists", () => {
    const c = leadColumns(["Website", "Phone", "Name"])!;
    expect(opsRowToLead(c, ["https://x.ba", "062 000 111", "X"], "Mostar", "m")).toMatchObject({ name: "X", phone: "+38762000111", website: "https://x.ba" });
    expect(leadColumns(["Name", "Price"])).toBeNull();
    expect(leadColumns(["Phone", "Website"])).toBeNull();
    expect(opsRowToLead(cols, ["", "", "", "", "", "", "", "", ""], null, "m")).toBeNull();
  });

  it("an address that's just the city isn't an address", () => {
    expect(opsRowToLead(cols, ["A", "", "Sarajevo", "", "", "", "", "", ""], "Sarajevo", "m")!.address).toBeNull();
  });
});

describe("demo copy", () => {
  const facts = { name: "Frizerski salon Lana", category: "Hair salons & barbers", city: "Tuzla", address: "Trg slobode 3", notes: "From Ops\nWebsite status: Only Facebook/Instagram" };

  it("only ops leads without a real website", () => {
    expect(needsDemoCopy({ tags: ["ops"], website: null })).toBe(true);
    expect(needsDemoCopy({ tags: ["ops"], website: "https://facebook.com/lana" })).toBe(true);
    expect(needsDemoCopy({ tags: ["ops"], website: "https://lana.ba" })).toBe(false);
    expect(needsDemoCopy({ tags: [], website: null })).toBe(false);
    expect(needsDemoCopy({ tags: ["ops"], website: null, demoContent: { headline: "x" } })).toBe(false);
  });

  it("the template is grounded: category + name + city, no digits it wasn't given, hours only when known", () => {
    const t = templateDemo(facts, new Date("2026-10-15T00:00:00Z"));
    expect(t.headline).toBe("Frizerski salon Lana — Njega i uljepšavanje, Tuzla");
    expect(t.services).toHaveLength(3);
    expect(t.hours).toBeNull();
    expect(t.by).toBe("template");
    expect(JSON.stringify({ ...t, at: "" }).replace(/Trg slobode 3/, "")).not.toMatch(/\d/);
    expect(knownHours("Hours: Pon–Sub 08–20")).toBe("Pon–Sub 08–20");
    expect(templateDemo({ ...facts, notes: "Radno vrijeme: Pon–Pet 9–17" }).hours).toBe("Pon–Pet 9–17");
  });

  it("the prompt carries only known facts", () => {
    const p = demoPrompt(facts);
    expect(p).toContain("Business name: Frizerski salon Lana");
    expect(p).toContain("Their web presence today: Only Facebook/Instagram");
    expect(p).not.toContain("rating");
  });

  const good = {
    headline: "Frizerski salon Lana u Tuzli", about: "Salon u centru Tuzle. Javite nam se za više informacija.", cta: "Rezervišite termin",
    services: [{ title: "Šišanje", text: "Za žene i muškarce." }, { title: "Bojenje", text: "Boja po vašoj želji." }, { title: "Feniranje", text: "Za svaki dan." }],
  };

  it("accepts a clean reply", () => {
    expect(cleanDemoContent(good, facts, "Groq · llama")).toMatchObject({ headline: good.headline, by: "Groq · llama", hours: null });
  });

  it("rejects invented facts, malformed replies and markup", () => {
    expect(cleanDemoContent({ ...good, about: "Od 2005. godine uz vas." }, facts, "m")).toBeNull(); // a year
    expect(cleanDemoContent({ ...good, services: [...good.services.slice(0, 2), { title: "Šišanje", text: "Samo 15 KM" }] }, facts, "m")).toBeNull(); // a price
    expect(cleanDemoContent({ ...good, headline: "Najbolji salon u gradu" }, facts, "m")).toBeNull();
    expect(cleanDemoContent({ ...good, about: "Dobitnik nagrade za kvalitet." }, facts, "m")).toBeNull();
    expect(cleanDemoContent({ ...good, about: "Više od 300 zadovoljnih klijenata." }, facts, "m")).toBeNull(); // a number we weren't given
    expect(cleanDemoContent({ ...good, services: good.services.slice(0, 2) }, facts, "m")).toBeNull();
    expect(cleanDemoContent({ ...good, cta: "<b>Klik</b>" }, facts, "m")).toBeNull();
    expect(cleanDemoContent(null, facts, "m")).toBeNull();
    // A number that IS in the address is fine.
    expect(cleanDemoContent({ ...good, about: "Nalazimo se na Trgu slobode 3. Javite nam se." }, facts, "m")).not.toBeNull();
  });
});
