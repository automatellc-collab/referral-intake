import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client for server contexts with no user session — currently
 * only the Stripe webhook, which Stripe calls directly (no cookies, no RLS
 * identity to act as). Never import this into anything a browser can reach.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
