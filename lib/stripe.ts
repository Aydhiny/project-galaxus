import Stripe from "stripe";

// Lazy singleton — constructing with an undefined key should only fail when a
// billing action is actually invoked, not at module load/build time (same
// reasoning as getResend() in lib/email.ts).
let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set.");
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}
