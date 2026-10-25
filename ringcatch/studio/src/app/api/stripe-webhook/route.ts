import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/** Pull the tenant id we stamped onto the subscription/session, from either shape. */
function tenantIdFrom(obj: { metadata?: Stripe.Metadata | null; client_reference_id?: string | null }): string | null {
  return obj.metadata?.tenant_id || obj.client_reference_id || null;
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const supabase = createAdminClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const tenantId = tenantIdFrom(session);
      if (tenantId) {
        await supabase.from("tenants").update({
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
          subscription_status: "active",
        }).eq("id", tenantId);
      }
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const tenantId = tenantIdFrom(subscription);
      const status = subscription.status === "active" ? "active"
        : subscription.status === "past_due" ? "past_due"
        : "canceled";

      if (tenantId) {
        await supabase.from("tenants").update({ subscription_status: status }).eq("id", tenantId);
      } else {
        // Fallback for events without our metadata (e.g. dashboard-initiated changes).
        await supabase.from("tenants")
          .update({ subscription_status: status })
          .eq("stripe_subscription_id", subscription.id);
      }
      break;
    }

    default:
      break; // ignore everything else
  }

  return NextResponse.json({ received: true });
}
