import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import StatusHeader from "@/components/dashboard/StatusHeader";
import CallLogList from "@/components/dashboard/CallLogList";
import BookingList from "@/components/dashboard/BookingList";
import type { Booking, CallLog, Tenant } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const { data: tenant } = await supabase
    .from("tenants")
    .select("*")
    .eq("owner_email", user.email)
    .maybeSingle();

  if (!tenant) redirect("/wizard");

  const [{ data: calls }, { data: bookings }] = await Promise.all([
    supabase
      .from("call_logs")
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("started_at", { ascending: false })
      .limit(20),
    supabase
      .from("bookings")
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10">
      <StatusHeader tenant={tenant as Tenant} />

      <section>
        <h2 className="mb-3 text-lg font-semibold">Recent calls</h2>
        <CallLogList calls={(calls as CallLog[]) || []} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Upcoming bookings</h2>
        <BookingList bookings={(bookings as Booking[]) || []} />
      </section>
    </div>
  );
}
