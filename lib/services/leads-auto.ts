// Outreach automations that run on the daily scheduler — no clicks needed:
//   demo sites · "their site just broke" · new businesses on the map ·
//   follow-ups · client uptime + monthly reports.
// Nothing here SENDS anything: it prepares leads and messages; you press send.

import { randomBytes } from "crypto";
import { safeFetch } from "@/lib/safe-fetch";
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { leadSearches, leads, siteChecks, type Lead } from "@/lib/db/schema";
import {
  demoUrl, followUpMessage, isMobileBA, normalizePhone, scoreLead, templateMessage, withDemoLink,
} from "@/lib/outreach";
import { getConfigFor } from "@/lib/services/outreach/engine";
import { cityBox, overpass } from "@/lib/services/outreach/osm";
import { notifyUser } from "@/lib/services/outreach/push";

const UA = "Mozilla/5.0 (compatible; GalaxusSiteCheck/1.0; uptime check)";
const newSlug = () => randomBytes(8).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10).padEnd(10, "x");

// ─── Demo sites ───────────────────────────────────────────────────────────────

/** Every audited/ready/queued lead gets a demo page, and its message gets the link. */
export async function ensureDemosFor(userId: number) {
  const todo = await db.select().from(leads)
    .where(and(eq(leads.userId, userId), inArray(leads.status, ["audited", "ready", "queued"]), isNull(leads.demoSlug)))
    .limit(60);
  for (const l of todo) {
    const slug = newSlug();
    const message = l.message ? withDemoLink(l.message, demoUrl(slug)) : l.message;
    await db.update(leads).set({ demoSlug: slug, message, updatedAt: new Date() }).where(eq(leads.id, l.id));
  }
  return todo.length;
}

/** Public demo page data (no private fields). Expired / opted-out → null. */
export async function demoBySlug(slug: string) {
  if (!/^[a-z0-9]{6,24}$/.test(slug)) return null;
  const [l] = await db.select().from(leads).where(eq(leads.demoSlug, slug)).limit(1);
  if (!l || ["do_not_contact", "not_interested", "skipped"].includes(l.status)) return null;
  if (l.createdAt && Date.now() - l.createdAt.getTime() > 60 * 86_400_000) return null; // 60-day life
  const cfg = await getConfigFor(l.userId);
  return {
    name: l.name, category: l.category, city: l.city, address: l.address, phone: l.phone, channel: l.channel,
    rating: l.rating, reviewCount: l.reviewCount, mapsUrl: l.mapsUrl, senderName: cfg.senderName,
    content: l.demoContent ?? null, // copy written for this business (lib/services/outreach-bridge.ts), else the page's generic copy
  };
}

// ─── "Their site just broke" ──────────────────────────────────────────────────

async function checkUrl(url: string): Promise<{ ok: boolean; ms: number; status: number | null }> {
  const t0 = Date.now();
  try {
    const res = await safeFetch(url, { method: "GET", headers: { "User-Agent": UA }, cache: "no-store" }, { timeoutMs: 10_000 }); // SSRF guard: lead websites come from maps data and agents
    res.body?.cancel().catch(() => {});
    return { ok: res.status < 500 && res.status !== 404 && res.status !== 410, ms: Date.now() - t0, status: res.status };
  } catch {
    return { ok: false, ms: Date.now() - t0, status: null }; // DNS, timeout, expired certificate…
  }
}

/** Re-check lead websites (oldest-checked first). Newly broken → top of the queue + alert. */
export async function checkLeadSitesFor(userId: number, limit = 40) {
  const rows = await db.select().from(leads)
    .where(and(eq(leads.userId, userId), isNotNull(leads.website), inArray(leads.status, ["audited", "ready", "queued", "sent", "replied", "meeting"])))
    .orderBy(sql`${leads.siteCheckedAt} asc nulls first`)
    .limit(limit);
  const cfg = await getConfigFor(userId);
  const broke: Lead[] = [];
  for (let i = 0; i < rows.length; i += 8) {
    await Promise.all(rows.slice(i, i + 8).map(async (l) => {
      if (!l.website || /facebook\.com|instagram\.com/.test(l.website)) {
        await db.update(leads).set({ siteCheckedAt: new Date() }).where(eq(leads.id, l.id));
        return;
      }
      const r = await checkUrl(l.website);
      const now = new Date();
      if (!r.ok && !l.siteDownSince) {
        const tags = [...new Set([...l.tags, "site_broke"])];
        const gaps = ["site_down", ...l.gaps.filter((g) => g !== "site_down")];
        const patch: Partial<Lead> = { siteCheckedAt: now, siteDownSince: now, tags, gaps, score: scoreLead({ ...l, gaps, tags }) };
        // Not sent yet → rewrite the message around the outage (with the demo link).
        if (["audited", "ready", "queued"].includes(l.status)) {
          const { text, variant } = templateMessage({ ...l, gaps }, cfg.senderName);
          patch.message = l.demoSlug ? withDemoLink(text, demoUrl(l.demoSlug)) : text;
          patch.messageVariant = variant;
          if (l.status === "audited") patch.status = "ready";
        }
        await db.update(leads).set(patch).where(eq(leads.id, l.id));
        broke.push(l);
      } else if (r.ok && l.siteDownSince) {
        await db.update(leads).set({ siteCheckedAt: now, siteDownSince: null, tags: l.tags.filter((t) => t !== "site_broke") }).where(eq(leads.id, l.id));
      } else {
        await db.update(leads).set({ siteCheckedAt: now }).where(eq(leads.id, l.id));
      }
    }));
  }
  if (broke.length) {
    await notifyUser(userId, {
      title: `⚠️ ${broke.length} lead website${broke.length === 1 ? "" : "s"} just went down`,
      body: `${broke.slice(0, 3).map((b) => b.name).join(", ")} — the best moment to reach out. Messages are ready.`,
      url: "/outreach",
      tag: "site-broke",
    }).catch(() => {});
  }
  return { checked: rows.length, broke: broke.length };
}

// ─── New businesses on the map ────────────────────────────────────────────────

const NEW_BIZ_FILTERS = [
  'nwr["shop"]',
  'nwr["amenity"~"^(restaurant|cafe|dentist|clinic|doctors|pharmacy|veterinary|fast_food|bar|kindergarten|driving_school)$"]',
  'nwr["craft"]',
  'nwr["office"]',
  'nwr["healthcare"]',
  'nwr["leisure"="fitness_centre"]',
  'nwr["tourism"~"^(hotel|guest_house|apartment|hostel)$"]',
];

const label = (t: Record<string, string>) => {
  const v = t.shop ?? t.amenity ?? t.craft ?? t.office ?? t.healthcare ?? t.leisure ?? t.tourism ?? "business";
  return v.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()).slice(0, 60);
};

/** Businesses ADDED to OpenStreetMap since the last run (version 1 = newly created). */
export async function findNewBusinessesFor(userId: number, since: Date | null) {
  const [search] = await db.select({ city: leadSearches.city }).from(leadSearches).where(eq(leadSearches.userId, userId)).limit(1);
  const city = search?.city ?? "Sarajevo";
  const from = (since ?? new Date(Date.now() - 7 * 86_400_000)).toISOString().slice(0, 19) + "Z";
  const [s, w, n, e] = await cityBox(city);
  const bbox = `${s},${w},${n},${e}`;
  const q = `[out:json][timeout:40];(${NEW_BIZ_FILTERS.map((f) => `${f}(newer:"${from}")(${bbox});`).join("")});out tags center meta;`;
  const { elements = [] } = (await overpass(q)) as { elements?: { type: string; id: number; version?: number; tags?: Record<string, string> }[] };
  const fresh = elements.filter((el) => el.version === 1 && el.tags?.name);
  if (fresh.length === 0) return { found: 0, added: 0 };
  const rows = fresh.slice(0, 80).map((el) => {
    const t = el.tags!;
    const phones = [t["contact:mobile"], t.mobile, t.phone, t["contact:phone"]].filter(Boolean).flatMap((v) => v!.split(/[;,]/))
      .map((v) => (v.trim().startsWith("+") ? normalizePhone(v, null) : normalizePhone(null, v))).filter((v): v is string => !!v);
    const phone = phones.find(isMobileBA) ?? phones[0] ?? null;
    return {
      userId, searchId: null, placeId: `osm:${el.type}/${el.id}`, name: t.name.slice(0, 255), category: label(t), phone,
      channel: isMobileBA(phone) ? "whatsapp" : "call", address: [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ") || null,
      city, website: t.website ?? t["contact:website"] ?? null, mapsUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      rating: null, reviewCount: null, tags: ["new_business"], notes: `New on the map since ${from.slice(0, 10)}`,
    };
  });
  const inserted = await db.insert(leads).values(rows).onConflictDoNothing({ target: [leads.userId, leads.placeId] }).returning({ id: leads.id });
  if (inserted.length) {
    await notifyUser(userId, {
      title: `🆕 ${inserted.length} new business${inserted.length === 1 ? "" : "es"} in ${city}`,
      body: `${rows.slice(0, 3).map((r) => r.name).join(", ")} — just opened, likely need a website. Added to Outreach.`,
      url: "/outreach",
      tag: "new-business",
    }).catch(() => {});
  }
  return { found: fresh.length, added: inserted.length };
}

// ─── Follow-ups ───────────────────────────────────────────────────────────────

/** Sent ≥ 4 days ago, no answer, never followed up → one polite follow-up in today's send list. */
export async function queueFollowUpsFor(userId: number, localDay: string) {
  const cutoff = new Date(Date.now() - 4 * 86_400_000);
  const rows = await db.select().from(leads)
    .where(and(eq(leads.userId, userId), eq(leads.status, "sent"), eq(leads.followUpCount, 0), eq(leads.channel, "whatsapp"), lt(leads.sentAt, cutoff)))
    .orderBy(asc(leads.sentAt))
    .limit(10);
  const cfg = await getConfigFor(userId);
  for (const l of rows) {
    await db.update(leads).set({
      status: "queued",
      queuedFor: localDay,
      followUpCount: 1,
      tags: [...new Set([...l.tags, "follow_up"])],
      message: followUpMessage({ name: l.name, senderName: cfg.senderName, demo: l.demoSlug ? demoUrl(l.demoSlug) : null }),
      updatedAt: new Date(),
    }).where(eq(leads.id, l.id));
  }
  return rows.length;
}

// ─── Client uptime ────────────────────────────────────────────────────────────

export async function checkClientSitesFor(userId: number) {
  const clients = await db.select().from(leads).where(and(eq(leads.userId, userId), eq(leads.status, "client"), isNotNull(leads.clientSiteUrl)));
  const down: string[] = [];
  for (const c of clients) {
    const r = await checkUrl(c.clientSiteUrl!);
    await db.insert(siteChecks).values({ userId, leadId: c.id, ok: r.ok, ms: r.ms, httpStatus: r.status });
    if (!r.ok) down.push(c.name);
  }
  if (down.length) {
    await notifyUser(userId, {
      title: `🚨 Client site down: ${down.join(", ")}`,
      body: "Fix it before they notice — that's what the maintenance fee is for.",
      url: "/outreach",
      tag: "client-down",
    }).catch(() => {});
  }
  return { checked: clients.length, down: down.length };
}

/** Last N days of checks for a client (for the lead sheet + monthly report). */
export async function clientChecksFor(userId: number, leadId: number, days = 31) {
  return db.select({ ok: siteChecks.ok, ms: siteChecks.ms, checkedAt: siteChecks.checkedAt }).from(siteChecks)
    .where(and(eq(siteChecks.userId, userId), eq(siteChecks.leadId, leadId), gte(siteChecks.checkedAt, new Date(Date.now() - days * 86_400_000))));
}

/** On the 1st: tell the user the monthly client reports are ready to send. */
export async function monthlyReportsReadyFor(userId: number) {
  const clients = await db.select({ id: leads.id, name: leads.name }).from(leads)
    .where(and(eq(leads.userId, userId), eq(leads.status, "client"), isNotNull(leads.clientSiteUrl)));
  if (clients.length === 0) return 0;
  await notifyUser(userId, {
    title: `📊 Monthly uptime reports ready (${clients.length})`,
    body: "One tap each in Outreach → client → Send report.",
    url: "/outreach",
    tag: "client-reports",
  }).catch(() => {});
  return clients.length;
}
