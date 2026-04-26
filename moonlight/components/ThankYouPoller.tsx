"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/support";
import { cn } from "@/lib/utils";

type Status =
  | "awaiting_payment"
  | "paid"
  | "generating"
  | "pending_review"
  | "ready"
  | "audio_failed"
  | "failed";

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 80; // 4 minutes

type Props = {
  orderId: string;
  isSignedIn: boolean;
};

export function ThankYouPoller({ orderId, isSignedIn }: Props) {
  const [status, setStatus] = useState<Status | "loading">("loading");
  const [storySlug, setStorySlug] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let polls = 0;

    async function check() {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/orders/${orderId}/status`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("status fetch failed");
        const data = (await res.json()) as {
          status: Status;
          storySlug: string | null;
        };
        if (cancelled) return;
        setStatus(data.status);
        setStorySlug(data.storySlug);

        if (data.status === "ready" && data.storySlug) {
          // Give the user a breath before auto-redirecting so they see the
          // "Ready!" state.
          setTimeout(() => {
            if (!cancelled) window.location.assign(`/story/${data.storySlug}`);
          }, 1200);
          return;
        }
        // Text is readable even if audio failed — send them to the story page
        // so they can read it right away.
        if (data.status === "audio_failed" && data.storySlug) {
          setTimeout(() => {
            if (!cancelled)
              window.location.assign(`/story/${data.storySlug}#read`);
          }, 1500);
          return;
        }
        if (data.status === "failed" || data.status === "pending_review") {
          return;
        }
      } catch {
        // transient — keep polling
      }

      polls += 1;
      if (polls >= MAX_POLLS) {
        setGaveUp(true);
        return;
      }
      setTimeout(check, POLL_INTERVAL_MS);
    }

    check();
    const tick = setInterval(() => setElapsed((e) => e + 1), 1000);

    return () => {
      cancelled = true;
      clearInterval(tick);
    };
  }, [orderId]);

  if (status === "ready" && storySlug) {
    return (
      <div className="space-y-5 text-center">
        <p className="text-2xl">✨</p>
        <h2 className="font-heading text-2xl font-semibold text-amber-50">
          Your story is ready
        </h2>
        <p className="text-white/70">Taking you to the player…</p>
        <Link
          href={`/story/${storySlug}`}
          className={cn(buttonVariants({ size: "lg" }), "min-h-11")}
        >
          Play now
        </Link>
      </div>
    );
  }

  if (status === "pending_review") {
    return (
      <div className="space-y-4 text-center">
        <h2 className="font-heading text-2xl font-semibold text-amber-50">
          Almost there
        </h2>
        <p className="text-white/75">
          Our safety reviewer is giving this story a quick once-over. You&apos;ll
          see it here as soon as it&apos;s approved — usually within an hour.
        </p>
        <CreateAccountPrompt isSignedIn={isSignedIn} orderId={orderId} />
      </div>
    );
  }

  if (status === "audio_failed" && storySlug) {
    return (
      <div className="space-y-5 text-center">
        <p className="text-2xl">📖</p>
        <h2 className="font-heading text-2xl font-semibold text-amber-50">
          Your story is ready to read
        </h2>
        <p className="text-white/75">
          The narration is still cooking — we&apos;ll add the audio
          automatically when it&apos;s done. In the meantime, you can read the
          story now.
        </p>
        <Link
          href={`/story/${storySlug}#read`}
          className={cn(buttonVariants({ size: "lg" }), "min-h-11")}
        >
          Read now
        </Link>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="space-y-4 text-center">
        <h2 className="font-heading text-2xl font-semibold text-amber-50">
          Something went wrong
        </h2>
        <p className="text-white/75">
          We hit a snag making this story. Our team has been notified and will
          look into it. While we&apos;re in development we can&apos;t process
          refunds automatically yet — email{" "}
          <a
            href={SUPPORT_MAILTO}
            className="font-medium text-amber-100 underline-offset-4 hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>{" "}
          if you need help. In shaa Allah we&apos;ll have a clearer policy when
          we launch. Thank you for supporting us.
        </p>
        <div>
          <Link
            href="/library"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "border-white/20 bg-white/5 text-amber-50 hover:bg-white/10"
            )}
          >
            Back to library
          </Link>
        </div>
      </div>
    );
  }

  if (gaveUp) {
    return (
      <div className="space-y-4 text-center">
        <h2 className="font-heading text-2xl font-semibold text-amber-50">
          Still working on it
        </h2>
        <p className="text-white/75">
          This is taking longer than usual. Refresh in a minute, or come back
          later.
          {isSignedIn
            ? " Your story will also appear in your library when it's ready."
            : " Optional: create an account with the same email below so the story appears in your library when it's done."}
        </p>
        <p className="text-xs text-white/50">
          Concerns?{" "}
          <a
            href={SUPPORT_MAILTO}
            className="text-amber-100/80 underline-offset-4 hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
        </p>
        <CreateAccountPrompt isSignedIn={isSignedIn} orderId={orderId} />
      </div>
    );
  }

  // awaiting_payment / paid / generating / loading
  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full border border-white/15 bg-white/5">
        <Loader2 className="size-7 animate-spin text-amber-200" />
      </div>
      <div className="space-y-2">
        <h2 className="font-heading text-2xl font-semibold text-amber-50">
          Making your story
        </h2>
        <p className="text-white/75">
          Writing the words, then narrating. This takes about a minute.
        </p>
        <p className="text-sm text-amber-100/75">
          No signup required — we&apos;ll open the player here when it&apos;s
          ready.
        </p>
        <p className="text-xs text-white/50">Elapsed: {elapsed}s</p>
      </div>

      <CreateAccountPrompt isSignedIn={isSignedIn} orderId={orderId} />
    </div>
  );
}

function CreateAccountPrompt({
  isSignedIn,
  orderId,
}: {
  isSignedIn: boolean;
  orderId: string;
}) {
  if (isSignedIn) {
    return (
      <p className="text-sm text-white/55">
        You can find this story in your{" "}
        <Link href="/library" className="underline hover:text-amber-100">
          library
        </Link>{" "}
        too, once it&apos;s ready.
      </p>
    );
  }
  return (
    <div className="rounded-xl border border-amber-200/25 bg-amber-200/5 p-4 text-sm text-amber-100/90">
      <p className="font-medium">Unlock your remaining 2 story credits</p>
      <p className="mt-1 text-white/70">
        Create your account with the <strong>same email</strong> you used at
        checkout and your remaining 2 credits (plus this story) appear in your
        library automatically.
      </p>
      <Link
        href={`/login?next=${encodeURIComponent(`/thank-you?order_id=${orderId}`)}`}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "mt-3 border-white/20 bg-white/5 text-amber-50 hover:bg-white/10"
        )}
      >
        Create account
      </Link>
    </div>
  );
}
