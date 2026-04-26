import "server-only";

import { grantOneTimeCredits } from "@/lib/quota";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const PAID_ONE_TIME_STATUSES = [
  "paid",
  "generating",
  "pending_review",
  "ready",
  "audio_failed",
  "failed",
] as const;

/**
 * One-time order credit reconciliation for already-linked users.
 *
 * Product rule: one paid one-time checkout should leave 2 remaining credits
 * after the first purchased story is consumed.
 * We mark each credited order with `one_time_credits_backfilled=true` so this
 * function stays idempotent.
 */
export async function reconcileOneTimeCreditsForUser(userId: string): Promise<number> {
  const admin = getSupabaseAdmin();
  const { data: eligibleOrders, error } = await admin
    .from("orders")
    .select("id")
    .eq("user_id", userId)
    .not("stripe_session_id", "is", null)
    .in("status", [...PAID_ONE_TIME_STATUSES])
    .eq("one_time_credits_backfilled", false);

  if (error) {
    console.warn("[backfill] one-time credit scan failed", error.message);
    return 0;
  }

  const orderIds = (eligibleOrders || []).map((o) => o.id);
  if (orderIds.length === 0) return 0;

  const creditsToGrant = orderIds.length * 2;
  await grantOneTimeCredits(userId, creditsToGrant);

  await admin
    .from("orders")
    .update({ one_time_credits_backfilled: true })
    .in("id", orderIds);

  return creditsToGrant;
}

/**
 * When a user first signs up / signs in, attach any guest orders and stories
 * that were placed under the same email before the account existed. Safe to
 * call on every login — it's a no-op once rows already have user_id set.
 */
export async function backfillGuestRowsForUser(args: {
  userId: string;
  email: string;
}) {
  const { userId, email } = args;
  const admin = getSupabaseAdmin();

  const { data: claimedGuestOrders, error: orderErr } = await admin
    .from("orders")
    .update({ user_id: userId })
    .ilike("parent_email", email)
    .is("user_id", null)
    .select("id, status, stripe_session_id, story_slug, one_time_credits_backfilled");

  if (orderErr) {
    console.warn("[backfill] orders update failed", orderErr.message);
    return;
  }

  // Reconciliation runs after linking. It scans all not-yet-backfilled one-time
  // orders now owned by this user (including rows claimed above) and grants
  // the starter credits exactly once per order.
  if ((claimedGuestOrders || []).length > 0) {
    await reconcileOneTimeCreditsForUser(userId);
  }

  const { data: ownedOrders } = await admin
    .from("orders")
    .select("story_slug")
    .eq("user_id", userId)
    .not("story_slug", "is", null);

  const slugs = (ownedOrders || [])
    .map((o) => o.story_slug)
    .filter((s): s is string => typeof s === "string");

  if (slugs.length === 0) return;

  await admin
    .from("stories")
    .update({ user_id: userId })
    .in("slug", slugs)
    .is("user_id", null);
}
