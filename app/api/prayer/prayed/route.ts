// "Prayed ✓" from a notification button: the service worker posts here with
// the session cookie (same origin), so no token is involved.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { logPrayerFor } from "@/lib/services/activity";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = Number(session?.user?.id);
  if (!userId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  try {
    const { prayer, date } = (await req.json()) as { prayer?: string; date?: string };
    return NextResponse.json(await logPrayerFor(userId, String(prayer ?? ""), date));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
