import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, userSettings, dailyCheckins } from "@/lib/db/schema";
import { eq, and, gte, isNotNull } from "drizzle-orm";
import { subDays, format } from "date-fns";
import { sendWeeklyDigestEmail } from "@/lib/email";

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

    const checkins = await db
      .select()
      .from(dailyCheckins)
      .where(and(eq(dailyCheckins.userId, user.id), gte(dailyCheckins.date, since)));

    if (checkins.length === 0) continue; // nothing to report — don't send a hollow email

    await sendWeeklyDigestEmail(user.email, user.name, {
      daysLogged: checkins.length,
      perfectPrayerDays: checkins.filter((c) => c.fajr && c.dhuhr && c.asr && c.maghrib && c.isha).length,
      trainingDays: checkins.filter((c) => c.training).length,
      gratitudeDays: checkins.filter((c) => c.gratitude).length,
    });
    sent++;
  }

  return NextResponse.json({ success: true, sent, candidates: recipients.length });
}
