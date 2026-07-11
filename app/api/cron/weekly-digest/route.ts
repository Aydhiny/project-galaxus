import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, userSettings, notifications } from "@/lib/db/schema";
import { eq, isNotNull } from "drizzle-orm";
import { subDays, format } from "date-fns";
import { sendWeeklyDigestEmail } from "@/lib/email";
import { getWeeklyStats } from "@/lib/reports";

/**
 * Triggered weekly by Vercel Cron (see vercel.json). Protected by a shared
 * secret rather than a session — there is no logged-in user for a scheduled
 * server-to-server call. Excluded from proxy.ts's session-based auth guard.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = format(subDays(new Date(), 7), "yyyy-MM-dd");

  // Only verified emails; a NULL notifyWeeklyDigest (no settings row yet) defaults to opted-in.
  const recipients = await db
    .select({ id: users.id, name: users.name, email: users.email, digestPref: userSettings.notifyWeeklyDigest })
    .from(users)
    .leftJoin(userSettings, eq(userSettings.userId, users.id))
    .where(isNotNull(users.emailVerified));

  let sent = 0;
  for (const user of recipients) {
    if (user.digestPref === false) continue;

    const stats = await getWeeklyStats(user.id, since);
    if (stats.daysLogged === 0) continue; // nothing to report — don't send a hollow email

    await sendWeeklyDigestEmail(user.email, user.name, stats);
    await db.insert(notifications).values({
      userId: user.id,
      type: "digest",
      title: "Your weekly digest is ready",
      body: `${stats.daysLogged} days logged this week — ${stats.perfectPrayerDays} perfect prayer days, ${stats.trainingDays} training days.`,
    });
    sent++;
  }

  return NextResponse.json({ success: true, sent, candidates: recipients.length });
}
