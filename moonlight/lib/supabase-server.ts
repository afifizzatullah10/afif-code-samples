import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { isAdminEmail } from "@/lib/admin-emails";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { Database } from "@/lib/supabase";

const IMPERSONATE_COOKIE = "mm_impersonate_user_id";

function readPublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return { url, key };
}

/**
 * Server component / route handler Supabase client with user session cookies.
 * Use for anything that needs `auth.uid()` inside RLS (library, admin checks,
 * reading the current user). Writes still go through getSupabaseAdmin().
 */
export async function createSupabaseServerClient() {
  const { url, key } = readPublicConfig();
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
    );
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component — safe to ignore; middleware handles refresh.
        }
      },
    },
  });
}

export async function getCurrentUser() {
  try {
    const authUser = await getAuthenticatedUser();
    if (!authUser) return null;

    const targetUserId = await getImpersonationTargetUserId();
    if (!targetUserId || !isAdminEmail(authUser.email)) {
      return authUser;
    }

    // Safety: never "impersonate" yourself; keep base admin session identity.
    if (targetUserId === authUser.id) return authUser;

    const admin = getSupabaseAdmin();
    const { data, error } = await admin.auth.admin.getUserById(targetUserId);
    if (error || !data.user) {
      return authUser;
    }
    return data.user;
  } catch {
    return null;
  }
}

export async function getAuthenticatedUser(): Promise<User | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    return data.user;
  } catch {
    return null;
  }
}

async function getImpersonationTargetUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(IMPERSONATE_COOKIE)?.value?.trim();
  return value || null;
}

export async function getImpersonationContext(): Promise<{
  active: boolean;
  targetUserId: string | null;
}> {
  const targetUserId = await getImpersonationTargetUserId();
  return {
    active: Boolean(targetUserId),
    targetUserId,
  };
}

export { IMPERSONATE_COOKIE };
