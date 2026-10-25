import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findAvailableNumber, purchaseNumber, attachToMessagingService } from "@/lib/twilio";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: tenant, error: fetchError } = await supabase
    .from("tenants")
    .select("id, phone_number, provisioning_status")
    .eq("owner_email", user.email)
    .maybeSingle();

  if (fetchError || !tenant) {
    return NextResponse.json({ error: "No business profile found" }, { status: 404 });
  }

  if (tenant.phone_number) {
    return NextResponse.json({ phoneNumber: tenant.phone_number, alreadyProvisioned: true });
  }

  if (tenant.provisioning_status === "provisioning") {
    return NextResponse.json({ error: "Provisioning already in progress" }, { status: 409 });
  }

  await supabase.from("tenants").update({ provisioning_status: "provisioning" }).eq("id", tenant.id);

  const engineUrl = process.env.ENGINE_PUBLIC_URL;
  if (!engineUrl) {
    await supabase.from("tenants").update({
      provisioning_status: "failed",
      provisioning_error: "ENGINE_PUBLIC_URL is not configured",
    }).eq("id", tenant.id);
    return NextResponse.json({ error: "Call engine is not configured" }, { status: 500 });
  }

  try {
    const available = await findAvailableNumber();
    const purchased = await purchaseNumber(available, `${engineUrl}/voice`);

    try {
      await attachToMessagingService(purchased.sid);
    } catch (smsError: unknown) {
      // Voice works without this — don't fail the whole provision over SMS setup.
      console.error("attachToMessagingService failed:", smsError);
    }

    await supabase.from("tenants").update({
      phone_number: purchased.phoneNumber,
      twilio_number_sid: purchased.sid,
      provisioning_status: "active",
      provisioning_error: null,
      status: "live",
    }).eq("id", tenant.id);

    return NextResponse.json({ phoneNumber: purchased.phoneNumber });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Provisioning failed";
    await supabase.from("tenants").update({
      provisioning_status: "failed",
      provisioning_error: message,
    }).eq("id", tenant.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
