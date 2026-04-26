import { after, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { fulfillOrder } from "@/lib/fulfillOrder";
import { buildStorySlug } from "@/lib/slugs";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Admin override: bypass the safety gate on a pending_review order.
 *
 * We accept the existing story_text as-is, publish a stories row immediately
 * (so the parent's library shows the readable text right away), and then
 * let fulfillOrder run Phase 2 to generate the audio. If the audio step
 * later fails, the order lands in 'audio_failed' — the text is still readable.
 */
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

  const { data: order } = await admin
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.status !== "pending_review") {
    return NextResponse.json(
      {
        error: `Can only approve orders in 'pending_review' (got '${order.status}')`,
      },
      { status: 400 }
    );
  }
  if (!order.story_text) {
    return NextResponse.json(
      { error: "Order has no story_text to publish. Retry instead." },
      { status: 400 }
    );
  }

  // Publish the text story now so the parent can read it immediately.
  let slug = order.story_slug;
  if (!slug) {
    slug = buildStorySlug(order.form.childName, order.form.islamicValue);
    const durationSeconds =
      order.form.lengthMinutes === "test_5s"
        ? 5
        : Math.max(60, Math.round((Number(order.form.lengthMinutes) || 5) * 60));

    const insertStory = await admin.from("stories").insert({
      slug,
      child_name: order.form.childName,
      theme: order.form.islamicValue,
      duration_seconds: durationSeconds,
      audio_url: null,
      story_text: order.story_text,
      user_id: order.user_id,
    });
    if (insertStory.error) {
      return NextResponse.json(
        { error: `Story row insert failed: ${insertStory.error.message}` },
        { status: 500 }
      );
    }

    await admin
      .from("orders")
      .update({ story_slug: slug })
      .eq("id", id);
  }

  // Re-arm fulfillment so it picks up at Phase 2 (audio) — Phase 1 is already
  // done (story_slug is set and story_text is stored).
  await admin
    .from("orders")
    .update({
      status: "paid",
      error: null,
      safety_reasons: null,
      admin_resolved_at: null,
      admin_resolved_by_email: null,
    })
    .eq("id", id);

  after(async () => {
    try {
      await fulfillOrder(id);
    } catch (err) {
      console.error("[admin approve] fulfillOrder threw", id, err);
    }
  });

  return NextResponse.json({ ok: true, storySlug: slug });
}
