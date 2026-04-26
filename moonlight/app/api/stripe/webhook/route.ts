import { after, NextResponse } from "next/server";
import type Stripe from "stripe";

import { fulfillOrder } from "@/lib/fulfillOrder";
import { tierForPriceId } from "@/lib/plans";
import { grantOneTimeCredits } from "@/lib/quota";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Dashboard endpoint and `stripe listen` each use a different signing secret — allow comma-separated `whsec_...` values in STRIPE_WEBHOOK_SECRET. */
function parseStripeWebhookSecrets(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function constructStripeEvent(
  body: string,
  signature: string,
  secrets: string[]
): Stripe.Event {
  let lastErr: unknown;
  for (const secret of secrets) {
    try {
      return getStripe().webhooks.constructEvent(body, signature, secret);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(String(lastErr ?? "constructEvent failed"));
}

export async function POST(req: Request) {
  const webhookSecrets = parseStripeWebhookSecrets(
    process.env.STRIPE_WEBHOOK_SECRET
  );
  if (webhookSecrets.length === 0) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not set." },
      { status: 500 }
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = constructStripeEvent(body, signature, webhookSecrets);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      "[stripe/webhook] signature verification failed",
      msg,
      `tried ${webhookSecrets.length} secret(s)`
    );
    return NextResponse.json({ error: `Webhook error: ${msg}` }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.mode === "subscription") {
        await handleSubscriptionCheckout(session);
        break;
      }

      const orderId =
        session.client_reference_id ||
        (typeof session.metadata?.order_id === "string"
          ? session.metadata.order_id
          : null);

      if (!orderId) {
        console.warn(
          "[stripe/webhook] one-time session missing order id",
          session.id
        );
        break;
      }

      const { data: existingOrder } = await admin
        .from("orders")
        .select("id, status, user_id, stripe_session_id")
        .eq("id", orderId)
        .maybeSingle();

      const alreadyProcessed =
        existingOrder &&
        existingOrder.stripe_session_id === session.id &&
        existingOrder.status !== "awaiting_payment";
      if (alreadyProcessed) {
        break;
      }

      const { data: updatedRows, error: updateErr } = await admin
        .from("orders")
        .update({ status: "paid", stripe_session_id: session.id })
        .eq("id", orderId)
        .select("id, user_id");
      if (updateErr) {
        console.error("[stripe/webhook] mark paid failed", orderId, updateErr);
        return NextResponse.json({ error: "DB update failed" }, { status: 500 });
      }

      const rowCount = updatedRows?.length ?? 0;
      if (rowCount === 0) {
        console.error(
          "[stripe/webhook] mark paid matched 0 rows",
          orderId,
          session.id
        );
        break;
      }
      const userId = updatedRows?.[0]?.user_id ?? null;
      if (userId) {
        await grantOneTimeCredits(userId, 3);
      }

      after(async () => {
        try {
          await fulfillOrder(orderId);
        } catch (err) {
          console.error("[stripe/webhook] fulfillOrder threw", orderId, err);
        }
      });
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      await upsertSubscription(sub);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await admin
        .from("subscriptions")
        .update({ status: "canceled", plan: "free" })
        .eq("stripe_subscription_id", sub.id);
      break;
    }

    case "invoice.paid": {
      // Reset usage counter at start of each billing period.
      const invoice = event.data.object as Stripe.Invoice;
      const subId =
        typeof (invoice as { subscription?: string }).subscription === "string"
          ? (invoice as { subscription?: string }).subscription
          : null;
      if (subId) {
        await admin
          .from("subscriptions")
          .update({ stories_this_period: 0 })
          .eq("stripe_subscription_id", subId);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}

async function handleSubscriptionCheckout(session: Stripe.Checkout.Session) {
  const admin = getSupabaseAdmin();
  const userId =
    typeof session.metadata?.user_id === "string"
      ? session.metadata.user_id
      : null;
  if (!userId) {
    console.warn("[stripe/webhook] sub checkout missing user_id", session.id);
    return;
  }

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null;

  // Full subscription state arrives in subscription.created shortly after —
  // this just records the customer id up front.
  await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      status: "incomplete",
    },
    { onConflict: "user_id" }
  );
}

async function upsertSubscription(sub: Stripe.Subscription) {
  const admin = getSupabaseAdmin();
  const userId =
    typeof sub.metadata?.user_id === "string" ? sub.metadata.user_id : null;

  if (!userId) {
    console.warn(
      "[stripe/webhook] subscription has no user_id metadata",
      sub.id
    );
    return;
  }

  const priceId = sub.items.data[0]?.price?.id ?? null;
  const tier = tierForPriceId(priceId) || "free";

  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  // SDK types omit these, but subscription webhooks always include period bounds.
  const period = sub as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
  };
  const periodStart = period.current_period_start
    ? new Date(period.current_period_start * 1000).toISOString()
    : null;
  const periodEnd = period.current_period_end
    ? new Date(period.current_period_end * 1000).toISOString()
    : null;

  await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      plan: tier,
      status: sub.status,
      current_period_start: periodStart,
      current_period_end: periodEnd,
    },
    { onConflict: "user_id" }
  );
}
