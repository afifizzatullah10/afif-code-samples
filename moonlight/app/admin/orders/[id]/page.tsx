import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdminCreditAdjuster } from "@/components/AdminCreditAdjuster";
import { AdminManualAudioTools } from "@/components/AdminManualAudioTools";
import { AdminOrderActions } from "@/components/AdminOrderActions";
import { requireAdmin } from "@/lib/admin";
import { formatDistanceToNow } from "@/lib/date";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const metadata: Metadata = {
  title: "Order · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminOrderDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const gate = await requireAdmin();
  if (!gate.ok) {
    if (gate.reason === "unauthenticated") redirect(`/login?next=/admin`);
    redirect("/admin");
  }

  const { id } = await params;
  const { data: order } = await getSupabaseAdmin()
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!order) notFound();
  let storyText = order.story_text as string | null;
  if (!storyText && order.story_slug) {
    const { data: story } = await getSupabaseAdmin()
      .from("stories")
      .select("story_text")
      .eq("slug", order.story_slug)
      .maybeSingle();
    storyText = (story?.story_text as string | null) ?? null;
  }

  const userCredits = order.user_id
    ? await getSupabaseAdmin()
        .from("subscriptions")
        .select("extra_story_credits")
        .eq("user_id", order.user_id)
        .maybeSingle()
    : null;
  const currentExtraCredits = Math.max(
    0,
    userCredits?.data?.extra_story_credits ?? 0
  );

  return (
    <main className="flex w-full min-h-0 flex-1 flex-col bg-[#0b0b23] text-amber-50">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs uppercase tracking-[0.3em] text-amber-200/70">
          <Link href="/" className="transition-colors hover:text-amber-100">
            Moonlight
          </Link>
          <span className="text-amber-200/35" aria-hidden>
            ·
          </span>
          <Link
            href="/admin"
            className="normal-case tracking-normal text-sm text-amber-200/80 hover:text-amber-100"
          >
            ← All orders
          </Link>
        </div>
        <h1 className="font-heading mt-3 text-2xl font-semibold">
          {order.form?.childName ?? "—"}&apos;s order
        </h1>
        <p className="mt-1 text-sm text-amber-100/60">
          {formatDistanceToNow(order.created_at)} · {order.parent_email}
        </p>
        {order.user_id ? (
          <form action="/api/admin/impersonate" method="post" className="mt-3">
            <input type="hidden" name="targetUserId" value={order.user_id} />
            <input type="hidden" name="next" value="/library" />
            <button
              type="submit"
              className="rounded-md border border-amber-300/35 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-400/20"
            >
              View as this user
            </button>
          </form>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <p className="text-xs text-amber-100/50">
              This order is not linked yet. Try finding a user by this email:
            </p>
            <form action="/api/admin/impersonate/by-email" method="post">
              <input type="hidden" name="targetEmail" value={order.parent_email} />
              <input type="hidden" name="next" value="/library" />
              <button
                type="submit"
                className="rounded-md border border-amber-300/35 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-400/20"
              >
                Find & view by email
              </button>
            </form>
          </div>
        )}

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <Field label="Status" value={order.status.replace(/_/g, " ")} />
          {order.admin_resolved_at && (
            <Field
              label="Admin fixed"
              value={`${formatDistanceToNow(order.admin_resolved_at)}${
                order.admin_resolved_by_email
                  ? ` by ${order.admin_resolved_by_email}`
                  : ""
              }`}
            />
          )}
          <Field label="Child age" value={order.form?.childAge} />
          <Field label="Islamic value" value={order.form?.islamicValue} />
          <Field label="Length" value={formatLengthLabel(order.form?.lengthMinutes)} />
          <Field label="Interests" value={order.form?.interests} full />
          {order.form?.note && (
            <Field label="Parent note" value={order.form.note} full />
          )}
        </section>

        {order.safety_reasons && Array.isArray(order.safety_reasons) && order.safety_reasons.length > 0 && (
          <section className="mt-6 rounded-xl border border-amber-400/30 bg-amber-500/5 p-4">
            <h2 className="text-sm font-semibold text-amber-200">
              Safety gate flagged this story
            </h2>
            <ul className="mt-2 list-disc pl-5 text-sm text-amber-100/80">
              {(order.safety_reasons as string[]).map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </section>
        )}

        {order.error && (
          <section className="mt-6 rounded-xl border border-red-400/30 bg-red-500/5 p-4 text-sm text-red-200">
            <h2 className="font-semibold">Error</h2>
            <pre className="mt-1 whitespace-pre-wrap text-xs">{order.error}</pre>
          </section>
        )}

        {order.user_id && (
          <AdminCreditAdjuster
            userId={order.user_id}
            currentCredits={currentExtraCredits}
          />
        )}

        {storyText && (
          <section
            id="story-text"
            className="mt-6 rounded-xl border border-white/12 bg-white/[0.03] p-4"
          >
            <h2 className="text-sm font-semibold text-amber-100">Generated story</h2>
            <pre className="mt-2 max-h-[60vh] overflow-auto whitespace-pre-wrap text-sm leading-relaxed text-amber-50/90">
              {storyText}
            </pre>
          </section>
        )}

        <section id="manual-upload">
          <AdminManualAudioTools orderId={order.id} storyText={storyText} />
        </section>

        <section className="mt-8">
          <AdminOrderActions
            orderId={order.id}
            status={order.status}
            storySlug={order.story_slug}
            adminResolvedAt={order.admin_resolved_at}
            adminResolvedByEmail={order.admin_resolved_by_email}
          />
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  full = false,
}: {
  label: string;
  value: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "md:col-span-2" : undefined}>
      <div className="text-xs uppercase tracking-wide text-amber-100/50">
        {label}
      </div>
      <div className="mt-1 text-sm capitalize text-amber-50">{value || "—"}</div>
    </div>
  );
}

function formatLengthLabel(length: string | undefined): string {
  if (!length) return "—";
  if (length === "test_5s") return "~5 sec (dev test)";
  return `${length} min`;
}
