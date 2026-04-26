import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase";

let _admin: SupabaseClient<Database> | null = null;

/**
 * Server-only Supabase client using the service_role key. Bypasses RLS, so
 * this MUST never be imported from client components. `import "server-only"`
 * causes a build error if it leaks into a client bundle.
 */
export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (_admin) return _admin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Supabase admin not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) in .env.local."
    );
  }

  _admin = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "X-Client-Info": "moonlight-admin" } },
  });

  return _admin;
}
