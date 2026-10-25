import Stripe from "stripe";
import type { TenantPlan } from "@/lib/types";

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
    client = new Stripe(key);
  }
  return client;
}

/** Maps our plan enum to a Stripe recurring Price ID, configured per-environment. */
export function priceIdForPlan(plan: TenantPlan): string {
  const map: Record<TenantPlan, string | undefined> = {
    starter: process.env.STRIPE_PRICE_STARTER,
    pro: process.env.STRIPE_PRICE_PRO,
    premium: process.env.STRIPE_PRICE_PREMIUM,
  };
  const priceId = map[plan];
  if (!priceId) throw new Error(`No Stripe price configured for plan "${plan}"`);
  return priceId;
}
