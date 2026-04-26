import { formatDistanceToNow } from "@/lib/date";
import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthNav } from "@/components/AuthNav";
import { FeedbackForm } from "@/components/FeedbackForm";
import { TwinklingStars } from "@/components/TwinklingStars";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PLAN_DISPLAY } from "@/lib/plans";
import { computeQuotaForUser } from "@/lib/quota";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/support";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentUser } from "@/lib/supabase-server";
import type { OrderStatus } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Library",
  description: "Your saved Moonlight bedtime stories.",
};

export const dynamic = "force-dynamic";

const IN_PROGRESS_STATUSES: OrderStatus[] = [
  "awaiting_payment",
  "paid",
  "generating",
  "pending_review",
  "audio_failed",
  "failed",
];

export default async function LibraryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/library");

  const admin = getSupabaseAdmin();

  const { data: stories } = await admin
    .from("stories")
    .select(
      "slug, child_name, theme, duration_seconds, created_at, audio_url, story_text"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const { data: pendingOrders } = await admin
    .from("orders")
    .select("id, status, form, created_at, safety_reasons, story_slug, story_text, error")
    .eq("user_id", user.id)
    .in("status", IN_PROGRESS_STATUSES)
    .order("created_at", { ascending: false });

  const quota = await computeQuotaForUser(user.id);

  return (
    <main className="relative isolate flex w-full min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-[#0b0b23] via-[#1a1340] to-[#2a1659] text-amber-50">
      <TwinklingStars />
      <div className="relative mx-auto flex max-w-4xl flex-col gap-10 px-4 py-12">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/"
              className="inline-block text-xs uppercase tracking-[0.3em] text-amber-200/70 transition-colors hover:text-amber-100"
            >
              Moonlight
            </Link>
            <h1 className="font-heading mt-1 text-3xl font-semibold">
              {user.email?.split("@")[0]}&apos;s library
            </h1>
            <p className="mt-2 text-sm text-amber-100/70">
              Plan: <strong>{PLAN_DISPLAY[quota.plan]}</strong>
              {user.email && (
                <>
                  {" "}
                  · <span className="break-all text-amber-50/90">{user.email}</span>
                </>
              )}
              {quota.remaining > 0 && (
                <>
                  {" "}· Story credits: {quota.remaining} remaining
                  {quota.plan !== "free" && (
                    <>
                      {" "}({quota.used} used of {quota.limit} this month)
                    </>
                  )}
                </>
              )}
            </p>
            {quota.plan === "free" && quota.remaining === 0 && (
              <p className="mt-2 text-xs text-amber-100/60">
                You currently have 0 story credits. Buy the $4.99 pack to get 3
                story credits.
              </p>
            )}
          </div>
          <AuthNav />
        </header>

        <section className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold">Your stories</h2>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {quota.plan !== "free" && (
                <form action="/api/subscriptions/portal" method="post">
                  <button
                    type="submit"
                    className="text-amber-200/80 underline-offset-4 hover:text-amber-100 hover:underline"
                  >
                    Cancel / manage subscription
                  </button>
                </form>
              )}
              <Link
                href="/#pricing"
                className="text-amber-200/80 hover:text-amber-100"
              >
                Change plan
              </Link>
              <Link
                href="/#order"
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "shadow-lg shadow-amber-900/20"
                )}
              >
                New story
              </Link>
            </div>
          </div>

          {stories && stories.length > 0 ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {stories.map((s) => {
                const hasAudio = !!s.audio_url;
                const hasText = !!s.story_text;
                return (
                  <li
                    key={s.slug}
                    className="rounded-2xl border border-white/12 bg-white/[0.05] p-5 backdrop-blur-md"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="font-heading text-lg font-medium">
                        {s.child_name}&apos;s story
                      </h3>
                      {s.duration_seconds && (
                        <span className="text-xs text-amber-100/60">
                          ~{Math.round(s.duration_seconds / 60)} min
                        </span>
                      )}
                    </div>
                    {s.theme && (
                      <p className="mt-1 text-sm capitalize text-amber-100/70">
                        {s.theme}
                      </p>
                    )}
                    <p className="mt-3 text-xs text-amber-100/50">
                      {formatDistanceToNow(s.created_at)}
                    </p>

                    {!hasAudio && hasText && (
                      <p className="mt-3 rounded-md border border-amber-300/20 bg-amber-400/10 px-2.5 py-1 text-[11px] leading-relaxed text-amber-100/90">
                        Audio still cooking — read the text below in the meantime.
                      </p>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {hasAudio ? (
                        <Link
                          href={`/story/${s.slug}`}
                          className={cn(
                            buttonVariants({ size: "sm" }),
                            "shadow-lg shadow-amber-900/20"
                          )}
                        >
                          Play
                        </Link>
                      ) : (
                        <span
                          className={cn(
                            buttonVariants({ size: "sm", variant: "outline" }),
                            "cursor-not-allowed border-white/15 bg-white/[0.03] text-white/40 hover:bg-white/[0.03]"
                          )}
                          aria-disabled
                        >
                          Play (soon)
                        </span>
                      )}
                      {hasText && (
                        <Link
                          href={`/story/${s.slug}#read`}
                          className={cn(
                            buttonVariants({ size: "sm", variant: "outline" }),
                            "border-white/20 bg-white/5 text-amber-50 hover:bg-white/10"
                          )}
                        >
                          Read
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-6 text-sm text-amber-100/70">
              No stories yet. Head to{" "}
              <Link href="/#order" className="underline">
                the order form
              </Link>{" "}
              to create one.
            </p>
          )}
        </section>

        {pendingOrders && pendingOrders.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-heading text-xl font-semibold">In progress</h2>
            <ul className="space-y-2 text-sm">
              {pendingOrders.map((o) => (
                <li
                  key={o.id}
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">
                      {o.form?.childName || "—"}
                    </span>
                    <span className="text-xs text-amber-100/50">
                      {formatDistanceToNow(o.created_at)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <StepBadge
                      label="Story"
                      state={stepStates(o).text}
                    />
                    <StepBadge
                      label="Voice"
                      state={stepStates(o).audio}
                    />
                  </div>
                  {o.status === "audio_failed" && o.story_slug && (
                    <p className="mt-2 text-xs text-amber-100/75">
                      Text is ready —{" "}
                      <Link
                        href={`/story/${o.story_slug}#read`}
                        className="underline hover:text-amber-100"
                      >
                        read it now
                      </Link>
                      . We&apos;ll retry the voice soon.
                    </p>
                  )}
                  {o.status === "pending_review" && (
                    <p className="mt-2 text-xs text-amber-100/75">
                      A reviewer is giving this one a quick check. We&apos;ll
                      publish it here shortly.
                    </p>
                  )}
                  {o.status === "failed" && (
                    <p className="mt-2 text-xs text-red-200/80">
                      Something went wrong while writing this story. Our team
                      has been notified. For help, email{" "}
                      <a
                        href={SUPPORT_MAILTO}
                        className="font-medium text-amber-100 underline-offset-2 hover:underline"
                      >
                        {SUPPORT_EMAIL}
                      </a>
                      .
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <FeedbackForm />

        <p className="text-center text-xs leading-relaxed text-white/45">
          Concerns or feedback?{" "}
          <a
            href={SUPPORT_MAILTO}
            className="text-amber-100/70 underline-offset-4 hover:text-amber-50 hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
        </p>
      </div>
    </main>
  );
}

// Derive the two-step state from a row in the `orders` table.
// Step 1 (text)  → done once story_text exists or the stories row was linked.
// Step 2 (audio) → done once the order flips to 'ready'; failed on
//                  'audio_failed'; skipped if text failed.
function stepStates(order: {
  status: OrderStatus;
  story_text: string | null;
  story_slug: string | null;
}): { text: StepState; audio: StepState } {
  const textDone = !!order.story_text || !!order.story_slug;

  let textState: StepState;
  if (order.status === "failed" && !textDone) textState = "failed";
  else if (order.status === "pending_review") textState = "flagged";
  else if (textDone) textState = "done";
  else textState = "pending";

  let audioState: StepState;
  if (order.status === "ready") audioState = "done";
  else if (order.status === "audio_failed") audioState = "failed";
  else if (order.status === "failed") audioState = "skipped";
  else if (order.status === "pending_review") audioState = "skipped";
  else audioState = "pending";

  return { text: textState, audio: audioState };
}

type StepState = "pending" | "done" | "failed" | "skipped" | "flagged";

function StepBadge({
  label,
  state,
}: {
  label: string;
  state: StepState;
}) {
  const cfg: Record<StepState, { icon: string; className: string; text: string }> = {
    pending: {
      icon: "⏳",
      className: "border-white/15 bg-white/5 text-amber-100/75",
      text: "working",
    },
    done: {
      icon: "✓",
      className:
        "border-emerald-400/30 bg-emerald-500/15 text-emerald-100",
      text: "ready",
    },
    failed: {
      icon: "✕",
      className: "border-red-400/30 bg-red-500/15 text-red-100",
      text: "failed",
    },
    skipped: {
      icon: "—",
      className: "border-white/10 bg-white/[0.02] text-white/40",
      text: "skipped",
    },
    flagged: {
      icon: "!",
      className: "border-amber-400/30 bg-amber-500/15 text-amber-100",
      text: "under review",
    },
  };
  const c = cfg[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5",
        c.className
      )}
    >
      <span aria-hidden>{c.icon}</span>
      <span>
        {label}: {c.text}
      </span>
    </span>
  );
}
