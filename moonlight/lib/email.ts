import "server-only";

import { Resend } from "resend";

let _client: Resend | null = null;

function getClient(): Resend {
  if (_client) return _client;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set.");
  _client = new Resend(apiKey);
  return _client;
}

function fromAddress(): string {
  return (
    process.env.RESEND_FROM_EMAIL ||
    "Moonlight <bedtime@yourdomain.com>"
  );
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

/**
 * Story-ready notification for the purchaser.
 *
 * Always contains a direct link to the story so buyers can find it from the
 * inbox. When `includeGuestClaimCredits` is true we also include a clear
 * reminder that signing up with this same email unlocks the 2 remaining
 * one-time credits — the companion to the in-product CTA for guest buyers.
 */
export async function sendStoryReadyEmail(args: {
  to: string;
  childName: string;
  storyUrl: string;
  includeGuestClaimCredits?: boolean;
}) {
  const { to, childName, storyUrl, includeGuestClaimCredits = false } = args;

  const claimUrl = `${siteUrl().replace(/\/$/, "")}/login?next=${encodeURIComponent(
    "/library"
  )}`;

  const claimTextBlock = includeGuestClaimCredits
    ? `\n\nCreate your account with this same email to unlock your remaining 2 story credits:\n${claimUrl}\n`
    : "";

  const claimHtmlBlock = includeGuestClaimCredits
    ? `<div style="margin-top:28px;padding-top:24px;border-top:1px solid #edf2f7;text-align:center;">
        <p style="color:#1a202c;font-size:18px;font-weight:600;margin:0 0 12px 0;">Claim your remaining 2 story credits</p>
        <p style="color:#4a5568;font-size:16px;line-height:1.5;margin:0 0 24px 0;">Create your account with <strong>this same email</strong> and your remaining 2 credits will appear in your library automatically.</p>
        <a href="${escapeAttr(claimUrl)}" style="display:inline-block;background-color:#1a202c;color:#ffffff;font-weight:600;font-size:16px;text-decoration:none;padding:14px 32px;border-radius:6px;">Create account</a>
      </div>`
    : "";

  const text = `Assalamu alaikum,

${childName}'s bedtime story is ready:

${storyUrl}

Open the link at bedtime and press play. Bookmark it so you can replay it any night.${claimTextBlock}

We're still in development — we can't take revision requests through email yet. In shaa Allah we'll offer a simple way to tweak stories when we're ready. Thank you for supporting Moonlight.

Would love to hear how bedtime goes tonight.

— Moonlight`;

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background-color:#edf2f7;">
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background-color:#f9fafb;border-radius:8px;">
    <div style="text-align:center;padding-bottom:20px;">
      <h1 style="color:#1a202c;font-size:24px;margin:0 0 4px 0;">${escapeHtml(
        childName
      )}&apos;s story is ready 🌙</h1>
    </div>
    <div style="background-color:#ffffff;padding:30px;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.05);text-align:center;">
      <p style="color:#4a5568;font-size:16px;line-height:1.5;margin:0 0 16px 0;">Assalamu alaikum! <strong>${escapeHtml(
        childName
      )}</strong>&apos;s bedtime story is ready — open the link at bedtime, press play, and bookmark it so you can replay it any night.</p>
      <p style="color:#4a5568;font-size:16px;line-height:1.5;margin:0 0 30px 0;">Tap the button below to play.</p>
      <a href="${escapeAttr(
        storyUrl
      )}" style="display:inline-block;background-color:#1a202c;color:#ffffff;font-weight:600;font-size:16px;text-decoration:none;padding:14px 32px;border-radius:6px;">Play the story</a>
      <p style="color:#718096;font-size:13px;margin:35px 0 0 0;border-top:1px solid #edf2f7;padding-top:20px;">
        If the button doesn&apos;t work, copy and paste this link into your browser:<br />
        <a href="${escapeAttr(
          storyUrl
        )}" style="color:#3182ce;word-break:break-all;text-decoration:underline;margin-top:8px;display:inline-block;">${escapeHtml(
    storyUrl
  )}</a>
      </p>
      ${claimHtmlBlock}
      <p style="color:#718096;font-size:14px;line-height:1.55;margin:28px 0 0 0;border-top:1px solid #edf2f7;padding-top:20px;">
        We&apos;re still in development — we can&apos;t take revision requests through email yet. In shaa Allah we&apos;ll offer a simple way to tweak stories when we&apos;re ready. Thank you for supporting Moonlight.
      </p>
      <p style="color:#4a5568;font-size:16px;margin:20px 0 0 0;">Would love to hear how bedtime goes tonight.</p>
      <p style="color:#1a202c;font-size:15px;font-weight:600;margin:16px 0 0 0;">— Moonlight</p>
    </div>
  </div>
</body>
</html>`;

  return getClient().emails.send({
    from: fromAddress(),
    to,
    subject: `${childName}'s bedtime story is ready`,
    text,
    html,
  });
}

export async function sendSafetyReviewEmail(args: {
  childName: string;
  reasons: string[];
  orderId: string;
}) {
  const adminTo = process.env.ADMIN_EMAIL;
  if (!adminTo) return;
  const { childName, reasons, orderId } = args;

  const body = `Safety check flagged an order.

Order: ${orderId}
Child: ${childName}
Reasons:
- ${reasons.join("\n- ")}

Review in Supabase → Table Editor → orders (status = pending_review).`;

  return getClient().emails.send({
    from: fromAddress(),
    to: adminTo,
    subject: `[Moonlight] Safety review needed — ${childName}`,
    text: body,
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function escapeAttr(s: string) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
