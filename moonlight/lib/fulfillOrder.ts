import "server-only";

import { generateStory, safetyCheck } from "@/lib/openai-story";
import {
  isElevenLabsConfigured,
  textToSpeech,
  type NarratorVoice,
} from "@/lib/elevenlabs";
import { sendSafetyReviewEmail, sendStoryReadyEmail } from "@/lib/email";
import { consumeQuota } from "@/lib/quota";
import { buildStorySlug } from "@/lib/slugs";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { OrderForm, OrderRow } from "@/lib/supabase";

const STORY_BUCKET = "stories";

function parseBooleanLike(value: string | undefined): boolean | null {
  if (!value) return null;
  const raw = value.trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return null;
}

async function isStoryReviewEnabled(): Promise<boolean> {
  // Explicit env var overrides admin toggle when set.
  const envOverride = parseBooleanLike(process.env.ENABLE_STORY_REVIEW);
  if (envOverride !== null) return envOverride;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("admin_runtime_flags")
    .select("enable_story_review")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.warn("[fulfillOrder] story review flag fallback=false", error.message);
    return false;
  }

  return data?.enable_story_review ?? false;
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

/**
 * Idempotently send the "story is ready" email to the purchaser.
 *
 * Guests (orders with `user_id IS NULL` at the time this runs) get an extra
 * claim-your-credits block in the email so they know to create an account
 * with the same email to unlock their remaining 2 one-time credits.
 *
 * We stamp `orders.story_ready_email_sent_at` before sending to guarantee
 * at-most-once delivery across retries / concurrent webhook invocations.
 */
async function sendReadyEmailOnce(orderId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const { data: order, error } = await admin
    .from("orders")
    .select(
      "id, parent_email, form, story_slug, user_id, story_ready_email_sent_at"
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error || !order) return;
  if (order.story_ready_email_sent_at) return;
  if (!order.story_slug) return;
  const toEmail = order.parent_email || (order.form as OrderForm)?.parentEmail;
  if (!toEmail) return;

  // Reserve the slot first so concurrent callers don't double-send. This
  // condition-only-on-null update acts as a lightweight lock.
  const now = new Date().toISOString();
  const reservation = await admin
    .from("orders")
    .update({ story_ready_email_sent_at: now })
    .eq("id", orderId)
    .is("story_ready_email_sent_at", null)
    .select("id");
  if (reservation.error || !reservation.data || reservation.data.length === 0) {
    return;
  }

  try {
    await sendStoryReadyEmail({
      to: toEmail,
      childName: (order.form as OrderForm).childName,
      storyUrl: `${siteUrl().replace(/\/$/, "")}/story/${order.story_slug}`,
      includeGuestClaimCredits: !order.user_id,
    });
  } catch (err) {
    // Clear the stamp so a later retry can try again.
    console.error("[fulfillOrder] story-ready email failed", orderId, err);
    await admin
      .from("orders")
      .update({ story_ready_email_sent_at: null })
      .eq("id", orderId);
  }
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function requestedDurationSeconds(lengthMinutes: OrderForm["lengthMinutes"]): number {
  if (lengthMinutes === "test_5s") return 5;
  return Math.max(60, Math.round((Number(lengthMinutes) || 5) * 60));
}

/**
 * Two-phase, idempotent fulfillment for a paid order:
 *
 *   Phase 1 (text):   OpenAI generateStory → safetyCheck → insert stories row
 *                     with story_text (audio_url=null). The parent can now
 *                     read the story from their library immediately.
 *
 *   Phase 2 (audio):  ElevenLabs TTS → upload to storage → update the
 *                     stories row with audio_url. If ElevenLabs isn't
 *                     configured yet, we skip this step and mark the order
 *                     'ready' with a note — the story is still usable as text.
 *
 * Status transitions:
 *   paid/audio_failed → generating → (pending_review | failed | audio_failed | ready)
 *
 * Safe to call from a Stripe webhook and safe to call again (retry):
 *   - Skips work that's already done (won't regenerate text if story_slug
 *     already exists; won't upload audio twice).
 *   - Catches its own errors and writes them to orders.error.
 *
 * A story credit is consumed exactly once, at the moment the stories row is
 * first inserted (text success). Audio retries never double-charge.
 */
export async function fulfillOrder(orderId: string): Promise<void> {
  const admin = getSupabaseAdmin();

  const { data: order, error: fetchErr } = await admin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (fetchErr || !order) {
    console.error("[fulfillOrder] could not load order", orderId, fetchErr);
    return;
  }

  if (order.status === "ready") {
    console.log("[fulfillOrder] skipping, already ready", orderId);
    return;
  }
  if (order.status === "generating") {
    console.log("[fulfillOrder] skipping, already generating", orderId);
    return;
  }

  await admin
    .from("orders")
    .update({ status: "generating", error: null })
    .eq("id", orderId);

  const form = order.form as OrderForm;
  const narratorVoice: NarratorVoice =
    form.narratorVoice === "male" ? "male" : "female";
  // Remember whether the stories row existed *before* this run so we only
  // consume quota on the first-ever text success for this order.
  const storiesRowAlreadyExisted = order.story_slug !== null;

  // ---------- Phase 1: text + safety ----------
  let storyText = order.story_text;
  let slug = order.story_slug;

  try {
    if (!storyText) {
      storyText = await generateStory(form);
      await admin
        .from("orders")
        .update({ story_text: storyText })
        .eq("id", orderId);
    }

    if (!slug) {
      if (await isStoryReviewEnabled()) {
        const safety = await safetyCheck(storyText);
        if (!safety.safe) {
          await admin
            .from("orders")
            .update({
              status: "pending_review",
              safety_reasons: safety.reasons,
            })
            .eq("id", orderId);

          await sendSafetyReviewEmail({
            childName: form.childName,
            reasons: safety.reasons,
            orderId,
          }).catch((err) =>
            console.error("[fulfillOrder] admin email failed", err)
          );
          return;
        }
      }

      slug = buildStorySlug(form.childName, form.islamicValue);
      const durationSeconds = requestedDurationSeconds(form.lengthMinutes);

      const insertStory = await admin.from("stories").insert({
        slug,
        child_name: form.childName,
        theme: form.islamicValue,
        duration_seconds: durationSeconds,
        audio_url: null,
        story_text: storyText,
        user_id: order.user_id,
      });
      if (insertStory.error) {
        throw new Error(`Story row insert failed: ${insertStory.error.message}`);
      }

      await admin
        .from("orders")
        .update({ story_slug: slug })
        .eq("id", orderId);

      // Any credit-funded order consumes exactly one credit when text is first
      // published (extra one-time credits first, then subscription allowance).
      if (order.user_id && !storiesRowAlreadyExisted) {
        try {
          await consumeQuota(order.user_id);
        } catch (err) {
          console.warn(
            "[fulfillOrder] credit consumption failed (non-fatal)",
            orderId,
            err
          );
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[fulfillOrder] text phase failed", orderId, message);
    await admin
      .from("orders")
      .update({ status: "failed", error: message })
      .eq("id", orderId);
    return;
  }

  // ---------- Phase 2: audio ----------

  // If ElevenLabs isn't configured, publish the order as text-only and stop.
  // This is the intended path during development when the voice isn't wired
  // up yet — parents still get a readable story in their library.
  if (!isElevenLabsConfigured()) {
    await admin
      .from("orders")
      .update({
        status: "ready",
        error:
          "Audio skipped: ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID not set. Story is text-only.",
      })
      .eq("id", orderId);
    await sendReadyEmailOnce(orderId);
    return;
  }

  try {
    // Non-null assertion safe here: we guarantee slug & storyText after Phase 1.
    const text = storyText as string;
    const objectPath = `${slug}.mp3`;
    const words = countWords(text);
    const chars = text.length;
    console.info("[fulfillOrder] tts_request", {
      orderId,
      slug,
      narratorVoice,
      words,
      chars,
    });
    await admin
      .from("orders")
      .update({
        tts_word_count: words,
        tts_char_count: chars,
      })
      .eq("id", orderId);

    const tts = await textToSpeech(text, narratorVoice);
    console.info("[fulfillOrder] tts_response", {
      orderId,
      slug,
      requestId: tts.requestId,
      billedCharacters: tts.billedCharacters,
      words,
      chars,
    });
    await admin
      .from("orders")
      .update({
        elevenlabs_request_id: tts.requestId,
        elevenlabs_billed_characters: tts.billedCharacters,
      })
      .eq("id", orderId);

    const uploadResult = await admin.storage
      .from(STORY_BUCKET)
      .upload(objectPath, tts.buffer, {
        contentType: tts.contentType,
        upsert: true, // allow retries to overwrite a prior partial upload
      });
    if (uploadResult.error) {
      throw new Error(`Storage upload failed: ${uploadResult.error.message}`);
    }

    const { data: publicUrlData } = admin.storage
      .from(STORY_BUCKET)
      .getPublicUrl(objectPath);
    const baseUrl = publicUrlData.publicUrl;
    const sep = baseUrl.includes("?") ? "&" : "?";
    const audioUrl = `${baseUrl}${sep}v=${Date.now()}`;

    const updateStory = await admin
      .from("stories")
      .update({ audio_url: audioUrl })
      .eq("slug", slug);
    if (updateStory.error) {
      throw new Error(`Story row update failed: ${updateStory.error.message}`);
    }

    await admin
      .from("orders")
      .update({ status: "ready", error: null })
      .eq("id", orderId);
    await sendReadyEmailOnce(orderId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[fulfillOrder] audio phase failed", orderId, message);
    await admin
      .from("orders")
      .update({
        status: "audio_failed",
        error: `Audio: ${message}`,
      })
      .eq("id", orderId);
  }
}

export type OrderSafeView = Pick<OrderRow, "id" | "status">;
