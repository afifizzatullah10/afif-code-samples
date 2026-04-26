import { after, NextResponse } from "next/server";

import { fulfillOrder } from "@/lib/fulfillOrder";
import { orderSchema } from "@/lib/order";
import { computeQuotaForUser } from "@/lib/quota";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentUser } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = orderSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid form data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const form = parsed.data;
  const fiveMinuteComingSoon = true;
  if (fiveMinuteComingSoon && form.lengthMinutes === "5") {
    return NextResponse.json(
      { error: "5-minute stories are coming soon. Please choose 2 or 3 minutes for now." },
      { status: 503 }
    );
  }

  const user = await getCurrentUser();
  const admin = getSupabaseAdmin();
  // If the customer is signed in, always trust their auth email over client input.
  const parentEmail = user?.email || form.parentEmail;

  // Subscription path: authenticated + active plan with remaining quota →
  // create a 'paid' order immediately and kick off fulfillment. No Stripe
  // checkout redirect.
  if (user) {
    const quota = await computeQuotaForUser(user.id);
    if (quota.canGenerate) {
      const { data: order, error } = await admin
        .from("orders")
        .insert({
          user_id: user.id,
          parent_email: parentEmail,
          form: {
            childName: form.childName,
            childAge: form.childAge,
            interests: form.interests,
            islamicValue: form.islamicValue,
            lengthMinutes: form.lengthMinutes,
            narratorVoice: form.narratorVoice,
            parentEmail,
            note: form.note,
          },
          status: "paid",
        })
        .select("id")
        .single();

      if (error || !order) {
        console.error("[api/orders] subscription insert failed", error);
        return NextResponse.json(
          { error: "Could not queue order. Try again." },
          { status: 500 }
        );
      }

      after(async () => {
        try {
          await fulfillOrder(order.id);
        } catch (err) {
          console.error("[api/orders] fulfillOrder threw", order.id, err);
        }
      });

      return NextResponse.json({
        checkoutUrl: null,
        orderId: order.id,
        source: "subscription",
      });
    }
  }

  // Guest or out-of-quota path: create pending order + Stripe checkout URL.
  const { data: order, error: insertErr } = await admin
    .from("orders")
    .insert({
      user_id: user?.id ?? null,
      parent_email: parentEmail,
      form: {
        childName: form.childName,
        childAge: form.childAge,
        interests: form.interests,
        islamicValue: form.islamicValue,
        lengthMinutes: form.lengthMinutes,
        narratorVoice: form.narratorVoice,
        parentEmail,
        note: form.note,
      },
    })
    .select("id")
    .single();

  if (insertErr || !order) {
    console.error("[api/orders] insert failed", insertErr);
    return NextResponse.json(
      { error: "Could not save order. Try again in a moment." },
      { status: 500 }
    );
  }

  const origin = new URL(req.url).origin;

  if (isStripeConfigured() && process.env.STRIPE_PRICE_ID) {
    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        allow_promotion_codes: true,
        payment_method_types: ["card"],
        customer_email: parentEmail,
        client_reference_id: order.id,
        metadata: { order_id: order.id },
        line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
        success_url: `${origin}/thank-you?order_id=${order.id}`,
        cancel_url: `${origin}/#order`,
      });

      await admin
        .from("orders")
        .update({ stripe_session_id: session.id })
        .eq("id", order.id);

      return NextResponse.json({
        checkoutUrl: session.url,
        orderId: order.id,
        source: "stripe_checkout",
      });
    } catch (err) {
      console.error("[api/orders] Stripe session failed", err);
      return NextResponse.json(
        { error: "Could not start checkout. Try again in a moment." },
        { status: 500 }
      );
    }
  }

  const paymentLink = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK;
  if (paymentLink) {
    const url = new URL(paymentLink);
    url.searchParams.set("client_reference_id", order.id);
    url.searchParams.set("prefilled_email", parentEmail);
    return NextResponse.json({
      checkoutUrl: url.toString(),
      orderId: order.id,
      source: "payment_link",
    });
  }

  return NextResponse.json(
    {
      error:
        "Payments not configured. Set STRIPE_SECRET_KEY + STRIPE_PRICE_ID (recommended) or NEXT_PUBLIC_STRIPE_PAYMENT_LINK in .env.local.",
    },
    { status: 503 }
  );
}
