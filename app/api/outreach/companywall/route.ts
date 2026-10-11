// Opens the business's real CompanyWall page: reads CompanyWall's own search
// results and redirects to the best /firma/ match (or to the search page).

import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth-session";

const slug = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "dj").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function GET(req: Request) {
  try {
    await requireUserId();
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const url = new URL(req.url);
  const name = (url.searchParams.get("name") ?? "").slice(0, 120);
  const city = (url.searchParams.get("city") ?? "").slice(0, 60);
  const search = `https://www.companywall.ba/pretraga?${new URLSearchParams({ n: name })}`;
  if (!name) return NextResponse.redirect("https://www.companywall.ba/");
  try {
    const res = await fetch(search, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Galaxus/1.0)" }, signal: AbortSignal.timeout(8_000), cache: "no-store" });
    const html = await res.text();
    const links = [...new Set([...html.matchAll(/href="(\/firma\/[a-z0-9-]+\/[A-Za-z0-9]+)"/g)].map((m) => m[1]))];
    if (links.length === 0) return NextResponse.redirect(search);
    // Prefer a result whose slug mentions the city, then the most name words.
    const words = slug(name).split("-").filter((w) => w.length > 2);
    const c = slug(city);
    const score = (l: string) => (c && l.includes(c) ? 5 : 0) + words.filter((w) => l.includes(w)).length;
    const best = links.sort((a, b) => score(b) - score(a))[0];
    return NextResponse.redirect(`https://www.companywall.ba${best}`);
  } catch {
    return NextResponse.redirect(search);
  }
}
