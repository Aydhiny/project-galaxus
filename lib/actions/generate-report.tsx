"use server";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { format, subDays, startOfMonth } from "date-fns";
import { requireUserId } from "@/lib/auth-session";
import { getWeeklyStats, getAllTimeStats } from "@/lib/reports";
import { renderToBuffer } from "@react-pdf/renderer";
import { ReportDocument } from "@/components/pdf/report-document";

export async function generateReportPdf(range: "week" | "month" | "all") {
  const userId = await requireUserId();
  const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return { error: "Account not found." };

  const now = new Date();
  const since =
    range === "week" ? format(subDays(now, 7), "yyyy-MM-dd")
    : range === "month" ? format(startOfMonth(now), "yyyy-MM-dd")
    : format(subDays(now, 36500), "yyyy-MM-dd"); // effectively "no floor"

  const [stats, allTime] = await Promise.all([
    getWeeklyStats(userId, since),
    getAllTimeStats(),
  ]);

  const buffer = await renderToBuffer(
    <ReportDocument userName={user.name} range={range} generatedAt={format(now, "MMM d, yyyy")} stats={stats} allTime={allTime} />
  );

  return {
    base64: buffer.toString("base64"),
    filename: `galaxus-report-${range}-${format(now, "yyyy-MM-dd")}.pdf`,
  };
}
