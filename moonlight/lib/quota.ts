import "server-only";

import { planForTier } from "@/lib/plans";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { PlanTier } from "@/lib/supabase";

export type QuotaInfo = {
  plan: PlanTier;
  limit: number;
  used: number;
  extra: number;
  remaining: number;
  canGenerate: boolean;
};

/**
 * Returns the user's current subscription plan and story credit usage for the
 * current billing period. Used by /api/orders to gate subscription-funded
 * generation; one-time purchases skip this check.
 */
export async function computeQuotaForUser(userId: string): Promise<QuotaInfo> {
  const admin = getSupabaseAdmin();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("plan, status, stories_this_period, extra_story_credits")
    .eq("user_id", userId)
    .maybeSingle();

  const extra = Math.max(0, sub?.extra_story_credits ?? 0);
  const hasActivePlan = Boolean(sub && sub.status === "active" && sub.plan !== "free");
  const plan = hasActivePlan ? planForTier(sub!.plan) : undefined;
  const limit = plan?.monthlyStories ?? 0;
  const used = hasActivePlan ? (sub?.stories_this_period ?? 0) : 0;
  const subscriptionRemaining = Math.max(0, limit - used);
  const remaining = subscriptionRemaining + extra;

  return {
    plan: hasActivePlan ? sub!.plan : "free",
    limit,
    used,
    extra,
    remaining,
    canGenerate: remaining > 0,
  };
}

export async function consumeQuota(userId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("plan, status, stories_this_period, extra_story_credits")
    .eq("user_id", userId)
    .maybeSingle();

  if (!sub) {
    throw new Error("No subscription/credit wallet found for user.");
  }

  const extra = Math.max(0, sub.extra_story_credits ?? 0);
  if (extra > 0) {
    await admin
      .from("subscriptions")
      .update({ extra_story_credits: extra - 1 })
      .eq("user_id", userId);
    return;
  }

  if (sub.status === "active" && sub.plan !== "free") {
    await admin.rpc("increment_subscription_usage", { p_user_id: userId });
    return;
  }

  throw new Error("No remaining credits to consume.");
}

export async function grantOneTimeCredits(
  userId: string,
  creditsToAdd: number
): Promise<void> {
  const admin = getSupabaseAdmin();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("extra_story_credits")
    .eq("user_id", userId)
    .maybeSingle();

  const currentExtra = Math.max(0, sub?.extra_story_credits ?? 0);
  await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      plan: "free",
      status: "inactive",
      extra_story_credits: currentExtra + creditsToAdd,
    },
    { onConflict: "user_id" }
  );
}
