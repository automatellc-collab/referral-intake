import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import WizardForm from "@/components/wizard/WizardForm";
import type { IndustryTemplate, Tenant } from "@/lib/types";

export default async function WizardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const [{ data: templates }, { data: tenant }] = await Promise.all([
    supabase.from("industry_templates").select("*").order("sort_order"),
    supabase.from("tenants").select("*").eq("owner_email", user.email).maybeSingle(),
  ]);

  return (
    <WizardForm
      templates={(templates as IndustryTemplate[]) || []}
      tenant={tenant as Tenant | null}
      ownerEmail={user.email}
    />
  );
}
