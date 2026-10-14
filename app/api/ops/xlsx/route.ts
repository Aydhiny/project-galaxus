// Download a result as Excel: ?project=ID → every table row the crew delivered,
// merged and deduplicated; ?mission=ID → that result's table(s).
// Your own data only (session user); nothing is written.

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireUserId } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { opsMissions } from "@/lib/db/schema";
import { mergeTables } from "@/lib/ops";
import { xlsxFromRows } from "@/lib/xlsx";

export const dynamic = "force-dynamic";

const fileName = (s: string) => `${s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w -]+/g, "").trim().slice(0, 60) || "galaxus"}.xlsx`;

export async function GET(req: Request) {
  let userId: number;
  try { userId = await requireUserId(); } catch { return NextResponse.json({ error: "Not signed in." }, { status: 401 }); }
  const url = new URL(req.url);
  const projectId = Number(url.searchParams.get("project")), missionId = Number(url.searchParams.get("mission"));
  let title = "", rows: string[][] = [];
  try {
    if (Number.isInteger(projectId) && projectId > 0) {
      const { projectSheetFor } = await import("@/lib/services/ops-projects");
      ({ title, rows } = await projectSheetFor(userId, projectId));
    } else if (Number.isInteger(missionId) && missionId > 0) {
      const [m] = await db.select({ title: opsMissions.title, deliverableTitle: opsMissions.deliverableTitle, deliverable: opsMissions.deliverable })
        .from(opsMissions).where(and(eq(opsMissions.id, missionId), eq(opsMissions.userId, userId))).limit(1);
      if (!m) return NextResponse.json({ error: "Not found." }, { status: 404 });
      title = m.deliverableTitle || m.title;
      rows = mergeTables([m.deliverable ?? ""]);
    } else return NextResponse.json({ error: "Pass ?project= or ?mission=." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 404 });
  }
  if (rows.length < 2) return NextResponse.json({ error: "There's no table in this result yet." }, { status: 404 });
  const bytes = xlsxFromRows(rows, title || "Galaxus");
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName(title)}"`,
      "Cache-Control": "no-store",
    },
  });
}
