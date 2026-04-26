import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const raw = String(formData.get("enabled") || "").toLowerCase();
  const enabled = raw === "true" || raw === "1" || raw === "on" || raw === "yes";

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("admin_runtime_flags")
    .upsert({
      id: 1,
      enable_story_review: enabled,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.redirect(new URL("/admin", req.url), { status: 303 });
}
