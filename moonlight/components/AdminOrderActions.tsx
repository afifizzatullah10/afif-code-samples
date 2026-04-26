"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { OrderStatus } from "@/lib/supabase";

export function AdminOrderActions({
  orderId,
  status,
  storySlug,
  adminResolvedAt,
  adminResolvedByEmail,
}: {
  orderId: string;
  status: OrderStatus;
  storySlug: string | null;
  adminResolvedAt?: string | null;
  adminResolvedByEmail?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(
    action: "retry" | "approve" | "reconcile-credits" | "mark-fixed"
  ) {
    if (
      action === "mark-fixed" &&
      !window.confirm(
        "Mark this order issue as fixed? It will disappear from the priority queue, but the order status will stay the same."
      )
    ) {
      return;
    }

    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/${action}`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Action failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(null);
    }
  }

  const canRetry = [
    "failed",
    "audio_failed",
    "pending_review",
    "paid",
    /** Stuck mid-fulfillment (e.g. TTS error left the row in this state). */
    "generating",
  ].includes(status);
  const canApprove = status === "pending_review";
  const canMarkFixed =
    !adminResolvedAt && ["failed", "audio_failed", "pending_review"].includes(status);

  return (
    <div className="flex flex-wrap items-center gap-3">
      {adminResolvedAt && (
        <p className="w-full rounded-lg border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
          Marked fixed {adminResolvedByEmail ? `by ${adminResolvedByEmail}` : "by admin"}.
        </p>
      )}
      {canApprove && (
        <Button
          onClick={() => act("approve")}
          disabled={busy !== null}
          className="bg-emerald-500 text-white hover:bg-emerald-400"
        >
          {busy === "approve" ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Approving…
            </>
          ) : (
            "Approve & generate audio"
          )}
        </Button>
      )}
      {canRetry && (
        <Button
          onClick={() => act("retry")}
          variant="outline"
          disabled={busy !== null}
          className="border-white/20 bg-white/5 text-amber-50 hover:bg-white/10"
        >
          {busy === "retry" ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Re-running…
            </>
          ) : (
            "Retry fulfillment"
          )}
        </Button>
      )}
      <Button
        onClick={() => act("reconcile-credits")}
        variant="outline"
        disabled={busy !== null}
        className="border-amber-300/35 bg-amber-400/10 text-amber-100 hover:bg-amber-400/20"
      >
        {busy === "reconcile-credits" ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Reconciling credits...
          </>
        ) : (
          "Reconcile credits"
        )}
      </Button>
      {canMarkFixed && (
        <Button
          onClick={() => act("mark-fixed")}
          variant="outline"
          disabled={busy !== null}
          className="border-emerald-300/35 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20"
        >
          {busy === "mark-fixed" ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Marking fixed...
            </>
          ) : (
            "Mark as fixed"
          )}
        </Button>
      )}
      {storySlug && (
        <Link
          href={`/story/${storySlug}`}
          className="rounded-md bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
        >
          Open story page
        </Link>
      )}
      {error && (
        <p className="w-full rounded-lg border border-red-400/40 bg-red-950/40 px-3 py-2 text-sm text-red-100">
          {error}
        </p>
      )}
    </div>
  );
}
