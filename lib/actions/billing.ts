"use server";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getStripe } from "@/lib/stripe";
import { requireUserId } from "@/lib/auth-session";
import { SITE_URL } from "@/lib/site";

export async function createCheckoutSession() {
  const userId = await requireUserId();
  const [user] = await db
    .select({ id: users.id, email: users.email, plan: users.plan, stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return { error: "Account not found." };
  if (user.plan === "pro") return { error: "You're already on Pro — use Manage billing instead." };

  try {
    const stripe = getStripe();

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: String(userId) },
      });
      customerId = customer.id;
      // Persist before creating the Checkout Session — the customer-to-user
      // link must exist in our DB before Stripe can send a webhook about it.
      await db.update(users).set({ stripeCustomerId: customerId }).where(eq(users.id, userId));
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: String(userId),
      line_items: [{ price: process.env.STRIPE_PRO_PRICE_ID, quantity: 1 }],
      success_url: `${SITE_URL}/settings?checkout=success`,
      cancel_url: `${SITE_URL}/settings?checkout=cancelled`,
      subscription_data: { metadata: { userId: String(userId) } },
      allow_promotion_codes: true,
    });

    if (!session.url) return { error: "Could not start checkout. Please try again." };
    return { url: session.url };
  } catch (err) {
    console.error("[billing] createCheckoutSession failed", err);
    return { error: "Billing isn't set up yet. Please try again later." };
  }
}

export async function createPortalSession() {
  const userId = await requireUserId();
  const [user] = await db.select({ stripeCustomerId: users.stripeCustomerId }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.stripeCustomerId) return { error: "No billing account found yet." };

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${SITE_URL}/settings`,
    });
    return { url: session.url };
  } catch (err) {
    console.error("[billing] createPortalSession failed", err);
    return { error: "Billing isn't set up yet. Please try again later." };
  }
}
