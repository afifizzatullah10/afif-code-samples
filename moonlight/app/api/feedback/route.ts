import { NextResponse } from "next/server";
import { z } from "zod";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  message: z.string().trim().min(5).max(2000),
  pageUrl: z.string().trim().max(500).optional(),
});

export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin.from("library_feedback").insert({
    user_id: user.id,
    email: user.email,
    message: parsed.data.message,
    page_url: parsed.data.pageUrl || null,
  });

  if (error) {
    console.error("[feedback] insert", error);
    return NextResponse.json({ error: "Could not save feedback." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
