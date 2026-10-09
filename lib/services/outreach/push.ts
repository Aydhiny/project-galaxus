// Web Push (the standard behind phone/desktop notifications for installed
// PWAs — on iPhone it needs iOS 16.4+ and Galaxus added to the Home Screen).
// VAPID keys are generated once and stored encrypted in app_secrets, so
// there's no env var to set anywhere.

import webpush from "web-push";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { appSecrets, notifications, pushSubscriptions } from "@/lib/db/schema";
import { decrypt, encrypt } from "@/lib/crypto-box";
import { SITE_URL } from "@/lib/site";

type Vapid = { publicKey: string; privateKey: string };
let cached: Vapid | null = null;

export async function getVapidKeys(): Promise<Vapid> {
  if (cached) return cached;
  const read = async () => {
    const [row] = await db.select().from(appSecrets).where(eq(appSecrets.name, "vapid")).limit(1);
    return row ? (JSON.parse(decrypt(row.value)) as Vapid) : null;
  };
  let keys = await read();
  if (!keys) {
    // Two instances may race here; the loser's insert is ignored and both
    // then read the winner's keys, so every subscription uses one key pair.
    const fresh = webpush.generateVAPIDKeys();
    await db.insert(appSecrets).values({ name: "vapid", value: encrypt(JSON.stringify(fresh)) }).onConflictDoNothing();
    keys = await read();
  }
  cached = keys!;
  return cached;
}

export async function saveSubscriptionFor(
  userId: number,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent?: string | null
) {
  if (!/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("Invalid push subscription.");
  await db
    .insert(pushSubscriptions)
    .values({ userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 255) ?? null })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
}

export async function removeSubscriptionFor(userId: number, endpoint: string) {
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

export async function countSubscriptionsFor(userId: number) {
  return (await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))).length;
}

/**
 * Notify every device the user enabled, plus the in-app bell (so nothing is
 * lost if push isn't set up). Dead subscriptions (404/410) are removed.
 */
export async function notifyUser(userId: number, msg: { title: string; body: string; url: string; tag?: string }) {
  await db.insert(notifications).values({ userId, type: "outreach", title: msg.title, body: msg.body });

  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  if (subs.length === 0) return { delivered: 0 };
  const { publicKey, privateKey } = await getVapidKeys();
  webpush.setVapidDetails(SITE_URL.startsWith("https://") ? SITE_URL : "mailto:noreply@galaxus.app", publicKey, privateKey);

  let delivered = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(msg),
          { TTL: 60 * 60 * 3, urgency: "high" }
        );
        delivered++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
        else console.error("[push] send failed:", code, e instanceof Error ? e.message : e);
      }
    })
  );
  return { delivered };
}
