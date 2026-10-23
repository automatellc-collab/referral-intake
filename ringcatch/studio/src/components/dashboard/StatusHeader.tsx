"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Tenant } from "@/lib/types";
import { PLAN_LABELS } from "@/lib/types";

const STATUS_STYLES: Record<Tenant["status"], string> = {
  live: "bg-green-100 text-green-800",
  draft: "bg-yellow-100 text-yellow-800",
  paused: "bg-neutral-200 text-neutral-700",
};

export default function StatusHeader({ tenant }: { tenant: Tenant }) {
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
  }

  return (
    <header className="flex items-center justify-between border-b border-neutral-200 pb-4">
      <div>
        <h1 className="text-2xl font-semibold">{tenant.business_name}</h1>
        <div className="mt-1 flex items-center gap-2 text-sm text-neutral-500">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[tenant.status]}`}>
            {tenant.status}
          </span>
          <span>{PLAN_LABELS[tenant.plan]}</span>
          {tenant.phone_number && <span>· {tenant.phone_number}</span>}
        </div>
      </div>
      <div className="flex gap-3">
        <Link href="/wizard" className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium">
          Edit configuration
        </Link>
        <button onClick={signOut} className="text-sm text-neutral-500 underline">
          Sign out
        </button>
      </div>
    </header>
  );
}
