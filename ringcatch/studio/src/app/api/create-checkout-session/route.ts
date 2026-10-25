import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe, priceIdForPlan } from "@/lib/stripe";
import type { TenantPlan } from "@/lib/types";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, plan, stripe_customer_id, subscription_status")
    .eq("owner_email", user.email)
    .maybeSingle();

  if (!tenant) {
    return NextResponse.json({ error: "No business profile found" }, { status: 404 });
  }

  if (tenant.subscription_status === "active") {
    return NextResponse.json({ error: "Already subscribed" }, { status: 409 });
  }

  const origin = new URL(request.url).origin;

  try {
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer: tenant.stripe_customer_id || undefined,
      customer_email: tenant.stripe_customer_id ? undefined : user.email,
      line_items: [{ price: priceIdForPlan(tenant.plan as TenantPlan), quantity: 1 }],
      client_reference_id: tenant.id,
      metadata: { tenant_id: tenant.id },
      subscription_data: { metadata: { tenant_id: tenant.id } },
      success_url: `${origin}/wizard?checkout=success`,
      cancel_url: `${origin}/wizard?checkout=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
