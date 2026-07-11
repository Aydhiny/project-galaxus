import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { users, notifications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getStripe } from "@/lib/stripe";
import { planFromSubscriptionStatus } from "@/lib/plan";

/**
 * Server-to-server call from Stripe — no session cookie, authenticated
 * instead by an HMAC signature over the raw request body. Excluded from
 * proxy.ts's session-based auth guard, same treatment as api/cron.
 */
export async function POST(req: Request) {
  const body = await req.text(); // raw text, NOT req.json() — signature verification needs the exact bytes Stripe sent
  const signature = req.headers.get("stripe-signature");
  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return new Response("Missing signature", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[stripe webhook] signature verification failed", err);
    return new Response("Invalid signature", { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = session.customer as string;
      const subscriptionId = session.subscription as string;
      if (!customerId || !subscriptionId) break;

      const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
      await syncSubscription(customerId, subscription);
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      await syncSubscription(subscription.customer as string, subscription);
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.stripeCustomerId, customerId)).limit(1);
      await db
        .update(users)
        .set({ subscriptionStatus: "canceled", plan: "free" })
        .where(eq(users.stripeCustomerId, customerId));
      if (existing) {
        await db.insert(notifications).values({
          userId: existing.id,
          type: "billing_canceled",
          title: "Subscription canceled",
          body: "Your Pro subscription has ended. You're now on the Free plan.",
        });
      }
      break;
    }

    default:
      // Any event type we don't handle still must return 200, or Stripe will
      // retry it repeatedly for up to 3 days.
      break;
  }

  return NextResponse.json({ received: true });
}

async function syncSubscription(customerId: string, subscription: Stripe.Subscription) {
  const [existing] = await db
    .select({ id: users.id, subscriptionStatus: users.subscriptionStatus })
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1);

  const currentPeriodEnd = subscription.items.data[0]?.current_period_end;
  await db
    .update(users)
    .set({
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
      plan: planFromSubscriptionStatus(subscription.status),
    })
    .where(eq(users.stripeCustomerId, customerId));

  if (!existing) return;
  const wasPro = existing.subscriptionStatus === "active" || existing.subscriptionStatus === "trialing";
  const isPro = subscription.status === "active" || subscription.status === "trialing";

  if (!wasPro && isPro) {
    await db.insert(notifications).values({
      userId: existing.id,
      type: "billing_upgraded",
      title: "You're now on Pro!",
      body: "Your subscription is active — enjoy unlimited history and more streak freezes.",
    });
  } else if (subscription.status === "past_due" && existing.subscriptionStatus !== "past_due") {
    await db.insert(notifications).values({
      userId: existing.id,
      type: "billing_past_due",
      title: "Payment failed",
      body: "Your last payment didn't go through — update your card to keep your Pro plan active.",
    });
  }
}
