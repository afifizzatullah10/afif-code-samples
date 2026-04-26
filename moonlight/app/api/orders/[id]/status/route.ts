import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public status lookup for the /thank-you poller. Order IDs are UUIDs, so
 * they act as an unguessable access token. We only return non-sensitive
 * fields (status + resulting story slug); parent_email and form contents
 * are never exposed here.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || !/^[0-9a-f-]{10,}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  const { data: order } = await getSupabaseAdmin()
    .from("orders")
    .select("status, story_slug")
    .eq("id", id)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    status: order.status,
    storySlug: order.story_slug,
  });
}
