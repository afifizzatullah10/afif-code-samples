import { NextResponse } from "next/server";

import { backfillGuestRowsForUser } from "@/lib/auth-backfill";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Magic-link callback. Kept for backward compatibility with older flows and
 * Supabase email-confirmation links. Password sign-in uses /api/auth/password
 * directly.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = safeNextPath(url.searchParams.get("next"));
  const origin = url.origin;

  const supabase = await createSupabaseServerClient();
  let user: { id: string; email: string | null } | null = null;
  let errorMessage: string | null = null;

  if (code) {
    const exchanged = await supabase.auth.exchangeCodeForSession(code);
    user = exchanged.data.user
      ? {
          id: exchanged.data.user.id,
          email: exchanged.data.user.email ?? null,
        }
      : null;
    errorMessage = exchanged.error?.message ?? null;
  } else if (tokenHash && (type === "signup" || type === "recovery" || type === "email_change")) {
    const verified = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    user = verified.data.user
      ? {
          id: verified.data.user.id,
          email: verified.data.user.email ?? null,
        }
      : null;
    errorMessage = verified.error?.message ?? null;
  } else {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  if (errorMessage || !user) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorMessage || "exchange_failed")}`
    );
  }

  if (user.email) {
    await backfillGuestRowsForUser({
      userId: user.id,
      email: user.email,
    }).catch((err) => console.error("[auth/callback] backfill", err));
  }

  return NextResponse.redirect(`${origin}${next}`);
}

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/library";
  }
  return value;
}
