import { after, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { fulfillOrder } from "@/lib/fulfillOrder";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const admin = getSupabaseAdmin();

  // Reset state so fulfillOrder's idempotency guard doesn't skip. We keep
  // story_text and story_slug intact — fulfillOrder will resume from wherever
  // the previous run got to (e.g. re-run audio only if text already landed).
  const { error } = await admin
    .from("orders")
    .update({
      status: "paid",
      error: null,
      safety_reasons: null,
      admin_resolved_at: null,
      admin_resolved_by_email: null,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  after(async () => {
    try {
      await fulfillOrder(id);
    } catch (err) {
      console.error("[admin retry] fulfillOrder threw", id, err);
    }
  });

  return NextResponse.json({ ok: true });
}
