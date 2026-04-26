import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminSortForm } from "@/components/AdminSortForm";
import { AuthNav } from "@/components/AuthNav";
import { SyncedXScroll } from "@/components/SyncedXScroll";
import { requireAdmin } from "@/lib/admin";
import {
  ADMIN_SORT_OPTIONS,
  parseAdminSort,
  type AdminSortKey,
} from "@/lib/admin-sort";
import { formatDistanceToNow } from "@/lib/date";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { OrderStatus } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const STATUS_ORDER: OrderStatus[] = [
  "pending_review",
  "audio_failed",
  "failed",
  "generating",
  "paid",
  "awaiting_payment",
  "ready",
];

const ATTENTION_STATUSES: OrderStatus[] = [
  "pending_review",
  "audio_failed",
  "failed",
];

const IN_PROGRESS_STATUSES: OrderStatus[] = [
  "generating",
  "paid",
  "awaiting_payment",
];

const STATUS_META: Record<
  OrderStatus,
  { label: string; short: string; help: string; badgeClass: string; rowClass: string }
> = {
  awaiting_payment: {
    label: "Awaiting payment",
    short: "Payment",
    help: "Checkout started, payment not complete yet.",
    badgeClass: "border-gray-300/25 bg-gray-500/15 text-gray-100",
    rowClass: "",
  },
  paid: {
    label: "Paid",
    short: "Paid",
    help: "Paid and waiting for fulfillment.",
    badgeClass: "border-blue-300/25 bg-blue-500/15 text-blue-100",
    rowClass: "",
  },
  generating: {
    label: "Generating",
    short: "Generating",
    help: "Story or audio is currently being created.",
    badgeClass: "border-purple-300/25 bg-purple-500/15 text-purple-100",
    rowClass: "",
  },
  pending_review: {
    label: "Pending review",
    short: "Review",
    help: "Needs admin approval before audio is generated.",
    badgeClass: "border-amber-300/35 bg-amber-500/20 text-amber-100",
    rowClass: "bg-amber-500/[0.06]",
  },
  ready: {
    label: "Ready",
    short: "Ready",
    help: "Story is published for the user.",
    badgeClass: "border-emerald-300/25 bg-emerald-500/15 text-emerald-100",
    rowClass: "",
  },
  audio_failed: {
    label: "Audio failed",
    short: "Audio",
    help: "Text is ready, but audio needs retry or manual upload.",
    badgeClass: "border-orange-300/35 bg-orange-500/20 text-orange-100",
    rowClass: "bg-orange-500/[0.06]",
  },
  failed: {
    label: "Failed",
    short: "Failed",
    help: "Fulfillment failed and needs investigation.",
    badgeClass: "border-red-300/35 bg-red-500/20 text-red-100",
    rowClass: "bg-red-500/[0.06]",
  },
};

function buildAdminHref(parts: {
  status?: OrderStatus;
  q?: string;
  sort?: AdminSortKey;
}): string {
  const p = new URLSearchParams();
  if (parts.status) p.set("status", parts.status);
  const q = parts.q?.trim();
  if (q) p.set("q", q);
  if (parts.sort && parts.sort !== "newest") p.set("sort", parts.sort);
  const s = p.toString();
  return s ? `/admin?${s}` : "/admin";
}

function escapeIlikePattern(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; sort?: string }>;
}) {
  const gate = await requireAdmin();
  if (!gate.ok) {
    if (gate.reason === "unauthenticated") redirect("/login?next=/admin");
    return (
      <main className="flex w-full min-h-0 flex-1 flex-col bg-[#0b0b23] p-10 text-amber-50">
        <h1 className="font-heading text-2xl">Admin</h1>
        <p className="mt-2 text-sm text-amber-100/70">
          {gate.reason === "unconfigured"
            ? "Set ADMIN_EMAIL in .env.local to enable this dashboard."
            : "You don't have access. Ask the team owner to add your email to ADMIN_EMAIL."}
        </p>
      </main>
    );
  }

  const params = await searchParams;
  const filter = params.status as OrderStatus | undefined;
  const qRaw = (params.q ?? "").trim();
  const sort = parseAdminSort(params.sort);

  const admin = getSupabaseAdmin();

  let query = admin
    .from("orders")
    .select(
      "id, status, parent_email, form, story_slug, story_text, user_id, tts_word_count, tts_char_count, elevenlabs_request_id, elevenlabs_billed_characters, safety_reasons, error, admin_resolved_at, admin_resolved_by_email, created_at"
    )
    .limit(200);

  if (filter) {
    query = query.eq("status", filter);
  }

  if (qRaw) {
    // Commas break PostgREST `or=(...)` parsing; strip for search.
    const normalized = qRaw.replace(/,/g, " ").trim();
    const safe = escapeIlikePattern(normalized);
    const pattern = `%${safe}%`;
    query = query.or(
      `parent_email.ilike.${pattern},form->>childName.ilike.${pattern}`
    );
  }

  switch (sort) {
    case "oldest":
      query = query.order("created_at", { ascending: true });
      break;
    case "email_az":
      query = query
        .order("parent_email", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      break;
    case "email_za":
      query = query
        .order("parent_email", { ascending: false, nullsFirst: true })
        .order("created_at", { ascending: false });
      break;
    case "status_az":
      query = query
        .order("status", { ascending: true })
        .order("created_at", { ascending: false });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  const { data: orders } = await query;

  const counts = await Promise.all(
    STATUS_ORDER.map(async (status) => {
      const { count } = await admin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      return { status, count: count || 0 };
    })
  );

  const { data: feedback } = await admin
    .from("library_feedback")
    .select("id, email, message, page_url, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: reviewFlags } = await admin
    .from("admin_runtime_flags")
    .select("enable_story_review, updated_at")
    .eq("id", 1)
    .maybeSingle();
  const isStoryReviewEnabled = reviewFlags?.enable_story_review ?? false;

  const ordersList = orders || [];
  const feedbackList = feedback || [];
  const countFor = (status: OrderStatus) =>
    counts.find((item) => item.status === status)?.count || 0;
  const totalOrders = counts.reduce((sum, item) => sum + item.count, 0);
  const inProgress = IN_PROGRESS_STATUSES.reduce(
    (sum, status) => sum + countFor(status),
    0
  );
  const readyCount = countFor("ready");
  const attentionOrders = ordersList
    .filter(
      (order) =>
        ATTENTION_STATUSES.includes(order.status) && !order.admin_resolved_at
    )
    .slice(0, 5);
  const unresolvedAttentionCount = ordersList.filter(
    (order) => ATTENTION_STATUSES.includes(order.status) && !order.admin_resolved_at
  ).length;
  const currentFilterLabel = filter ? STATUS_META[filter]?.label : "All orders";

  return (
    <main className="flex w-full min-h-0 flex-1 flex-col bg-gradient-to-b from-[#08081f] via-[#10102d] to-[#0b0b23] text-amber-50">
      <div className="mx-auto max-w-7xl flex-1 px-4 py-10">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/"
              className="inline-block text-xs uppercase tracking-[0.3em] text-amber-200/70 transition-colors hover:text-amber-100"
            >
              Moonlight
            </Link>
            <h1 className="font-heading mt-2 text-3xl font-semibold">
              Admin command center
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-amber-100/65">
              Monitor orders, spot issues quickly, review feedback, and jump into
              the exact action needed.
            </p>
            <p className="mt-2 text-xs text-amber-100/45">
              Signed in as <span className="text-amber-100/80">{gate.email}</span>
            </p>
          </div>
          <AuthNav compactAdminMobileMenu />
        </header>

        <nav className="mt-6 flex flex-wrap gap-2 text-sm">
          <a href="#orders" className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-amber-100/80 hover:bg-white/10">
            Orders
          </a>
          <a href="#feedback" className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-amber-100/80 hover:bg-white/10">
            Feedback
          </a>
          <Link href="/admin" className="rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1.5 text-amber-100 hover:bg-amber-400/20">
            Refresh dashboard
          </Link>
        </nav>

        <section className="mt-6 rounded-2xl border border-white/12 bg-white/[0.04] p-4 shadow-xl shadow-black/15">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg font-semibold">Story review mode</h2>
              <p className="mt-1 text-sm text-amber-100/65">
                Control whether new stories go through safety review or ship directly.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                  isStoryReviewEnabled
                    ? "border-amber-300/35 bg-amber-500/15 text-amber-100"
                    : "border-emerald-300/35 bg-emerald-500/15 text-emerald-100"
                }`}
              >
                {isStoryReviewEnabled ? "Review ON" : "Review OFF (beta)"}
              </span>
              <form action="/api/admin/settings/story-review" method="post">
                <input
                  type="hidden"
                  name="enabled"
                  value={isStoryReviewEnabled ? "false" : "true"}
                />
                <button
                  type="submit"
                  className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-white/15"
                >
                  {isStoryReviewEnabled ? "Turn OFF review" : "Turn ON review"}
                </button>
              </form>
            </div>
          </div>
          {reviewFlags?.updated_at && (
            <p className="mt-2 text-xs text-amber-100/45">
              Last changed {formatDistanceToNow(reviewFlags.updated_at)}
            </p>
          )}
        </section>

        <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard
            label="Needs attention"
            value={unresolvedAttentionCount}
            detail="Unfixed review/audio/failed"
            tone={unresolvedAttentionCount > 0 ? "danger" : "calm"}
            href={buildAdminHref({ status: "pending_review", q: qRaw, sort })}
          />
          <MetricCard
            label="In progress"
            value={inProgress}
            detail="Paid or generating"
            tone="working"
            href={buildAdminHref({ status: "generating", q: qRaw, sort })}
          />
          <MetricCard
            label="Ready"
            value={readyCount}
            detail="Published stories"
            tone="success"
            href={buildAdminHref({ status: "ready", q: qRaw, sort })}
          />
          <MetricCard
            label="Feedback"
            value={feedbackList.length}
            detail="Latest messages"
            tone="neutral"
            href="#feedback"
          />
          <MetricCard
            label="Total orders"
            value={totalOrders}
            detail="All statuses"
            tone="neutral"
            href={buildAdminHref({ q: qRaw, sort })}
          />
        </section>

        {attentionOrders.length > 0 && (
          <section className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-400/[0.06] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-heading text-xl font-semibold text-amber-50">
                  Priority queue
                </h2>
                <p className="mt-1 text-sm text-amber-100/65">
                  These orders most likely need your next admin action.
                </p>
              </div>
              <Link
                href={buildAdminHref({ status: "pending_review", q: qRaw, sort })}
                className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-300/20"
              >
                Filter review items
              </Link>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {attentionOrders.map((order) => (
                <PriorityOrderCard key={order.id} order={order} />
              ))}
            </div>
          </section>
        )}

        <nav className="mt-8 flex flex-wrap gap-2 text-sm" aria-label="Order status filters">
          <Link
            href={buildAdminHref({ q: qRaw, sort })}
            className={filterLinkClass(!filter)}
          >
            All
          </Link>
          {counts.map(({ status, count }) => (
            <Link
              key={status}
              href={buildAdminHref({ status, q: qRaw, sort })}
              className={filterLinkClass(filter === status)}
            >
              {STATUS_META[status].label} ({count})
            </Link>
          ))}
        </nav>

        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-white/12 bg-white/[0.04] p-4 shadow-xl shadow-black/15 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <form method="get" className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-end">
            {filter ? <input type="hidden" name="status" value={filter} /> : null}
            <input type="hidden" name="sort" value={sort} />
            <label className="block min-w-0 flex-1">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-amber-100/50">
                Search
              </span>
              <input
                type="search"
                name="q"
                defaultValue={qRaw}
                placeholder="Parent email or child name…"
                className="h-10 w-full min-w-0 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-amber-50 placeholder:text-amber-100/40 outline-none focus-visible:border-amber-200/50 focus-visible:ring-2 focus-visible:ring-amber-200/30"
              />
            </label>
            <div className="flex shrink-0 gap-2">
              <button
                type="submit"
                className="h-10 rounded-lg bg-amber-200 px-4 text-sm font-medium text-[#1a1340] hover:bg-amber-100"
              >
                Search
              </button>
              {qRaw ? (
                <Link
                  href={buildAdminHref({ status: filter, sort })}
                  className="inline-flex h-10 items-center rounded-lg border border-white/20 px-3 text-sm text-amber-100 hover:bg-white/10"
                >
                  Clear
                </Link>
              ) : null}
            </div>
          </form>

          <AdminSortForm
            status={filter}
            q={qRaw}
            sort={sort}
          />
        </div>

        <p className="mt-2 text-xs text-amber-100/50">
          Showing up to 200 orders · view: {currentFilterLabel}
          {qRaw ? " matching your search" : ""}
          {sort !== "newest"
            ? ` · sorted: ${ADMIN_SORT_OPTIONS.find((o) => o.value === sort)?.label ?? sort}`
            : ""}
        </p>

        <section id="orders" className="mt-4 rounded-2xl border border-white/12 bg-white/[0.035] p-2 shadow-2xl shadow-black/20">
          <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-3 pt-1">
            <div>
              <h2 className="font-heading text-xl font-semibold">Orders</h2>
              <p className="mt-1 text-xs text-amber-100/50">
                Open an order for approve, retry, manual audio upload, credit fixes, or user view.
              </p>
            </div>
          </div>
          <SyncedXScroll minWidthClassName="min-w-[1180px]">
          <table className="w-full min-w-[1180px] table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[20%]" />
              <col className="w-[22%]" />
              <col className="w-[16%]" />
              <col className="w-[20%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
            </colgroup>
            <thead className="bg-white/5 text-xs uppercase tracking-wide text-amber-100/60">
              <tr>
                <th className="px-3 py-3">Order</th>
                <th className="px-3 py-3">Parent / user</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Story snapshot</th>
                <th className="px-3 py-3">Usage</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {ordersList.map((o) => (
                <tr
                  key={o.id}
                  className={`border-t border-white/10 align-top transition-colors hover:bg-white/[0.035] ${STATUS_META[o.status].rowClass}`}
                >
                  <td className="px-3 py-3">
                    <div className="font-medium text-amber-50">
                      {o.form?.childName || "—"}&apos;s story
                    </div>
                    <div className="text-xs text-amber-100/60">
                      {formatDistanceToNow(o.created_at)}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-amber-100/70">
                        Age {o.form?.childAge || "—"}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-amber-100/70">
                        {formatLengthLabel(o.form?.lengthMinutes)}
                      </span>
                    </div>
                  </td>
                  <td className="min-w-0 px-3 py-3 align-top leading-snug">
                    <div className="text-amber-50/95 [overflow-wrap:anywhere]">
                      {o.parent_email}
                    </div>
                    <div className="mt-2 text-xs text-amber-100/50">
                      {o.user_id ? "Linked account" : "Guest / not linked"}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={o.status} />
                    {o.admin_resolved_at && (
                      <p className="mt-2 rounded-md border border-emerald-300/20 bg-emerald-500/10 px-2 py-1 text-[11px] leading-relaxed text-emerald-100">
                        Fixed by admin
                        {o.admin_resolved_by_email
                          ? ` (${o.admin_resolved_by_email})`
                          : ""}
                      </p>
                    )}
                    <p className="mt-2 text-xs leading-relaxed text-amber-100/55">
                      {STATUS_META[o.status].help}
                    </p>
                    {o.elevenlabs_request_id && (
                      <div className="mt-2 break-all text-[11px] text-amber-100/45">
                        req: {o.elevenlabs_request_id}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-amber-100/75">
                    <div className="font-medium text-amber-50/90">
                      {o.form?.islamicValue || "—"}
                    </div>
                    <p className="mt-1 line-clamp-3 break-words">
                      {o.story_text
                        ? `${String(o.story_text).slice(0, 180)}${String(o.story_text).length > 180 ? "..." : ""}`
                        : o.form?.interests || "No story text yet."}
                    </p>
                    {o.safety_reasons && Array.isArray(o.safety_reasons) && (
                      <ul className="mt-2 list-disc break-words pl-4 text-amber-200">
                        {(o.safety_reasons as string[]).slice(0, 3).map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    )}
                    {o.error && (
                      <div className="mt-2 line-clamp-4 break-words rounded-md border border-red-300/20 bg-red-500/10 px-2 py-1.5 text-red-200">
                        {o.error}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-amber-100/75">
                    <MetricLine label="Words" value={o.tts_word_count} />
                    <MetricLine label="Chars" value={o.tts_char_count} />
                    <MetricLine label="Billed" value={o.elevenlabs_billed_characters} />
                  </td>
                  <td className="min-w-0 px-3 py-3 text-right align-top">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="rounded-md bg-amber-200 px-3 py-1.5 text-xs font-semibold text-[#1a1340] hover:bg-amber-100"
                      >
                        Open
                      </Link>
                      {o.user_id ? (
                        <form action="/api/admin/impersonate" method="post">
                          <input type="hidden" name="targetUserId" value={o.user_id} />
                          <input type="hidden" name="next" value="/library" />
                          <button
                            type="submit"
                            className="rounded-md border border-amber-300/35 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/20"
                          >
                            View user
                          </button>
                        </form>
                      ) : (
                        <form action="/api/admin/impersonate/by-email" method="post">
                          <input type="hidden" name="targetEmail" value={o.parent_email} />
                          <input type="hidden" name="next" value="/library" />
                          <button
                            type="submit"
                            className="rounded-md border border-amber-300/35 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/20"
                          >
                            Find user
                          </button>
                        </form>
                      )}
                      <Link
                        href={`/admin/orders/${o.id}#manual-upload`}
                        className="rounded-md border border-emerald-300/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-500/20"
                      >
                        Manual upload
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {ordersList.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-sm text-amber-100/50"
                  >
                    No orders
                    {filter ? ` with status "${filter.replace(/_/g, " ")}"` : ""}
                    {qRaw ? " matching your search" : ""}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </SyncedXScroll>
        </section>

        <section id="feedback" className="mt-8 rounded-2xl border border-white/12 bg-white/[0.035] p-2 shadow-2xl shadow-black/20">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-2 pb-3 pt-1">
            <h2 className="font-heading text-xl font-semibold">User feedback</h2>
            <p className="text-xs text-amber-100/50">
              {feedbackList.length} latest message{feedbackList.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[14%]" />
                <col className="w-[24%]" />
                <col className="w-[48%]" />
                <col className="w-[14%]" />
              </colgroup>
              <thead className="bg-white/5 text-xs uppercase tracking-wide text-amber-100/60">
                <tr>
                  <th className="px-3 py-3">When</th>
                  <th className="px-3 py-3">User</th>
                  <th className="px-3 py-3">Feedback</th>
                  <th className="px-3 py-3">Page</th>
                </tr>
              </thead>
              <tbody>
                {feedbackList.map((f) => (
                  <tr
                    key={f.id}
                    className="border-t border-white/10 align-top hover:bg-white/[0.03]"
                  >
                    <td className="px-3 py-3 text-amber-100/70">
                      {formatDistanceToNow(f.created_at)}
                    </td>
                    <td className="min-w-0 px-3 py-3 text-amber-50/95 [overflow-wrap:anywhere]">
                      {f.email || "—"}
                    </td>
                    <td className="px-3 py-3 text-amber-100/80">
                      <p className="whitespace-pre-wrap break-words">{f.message}</p>
                    </td>
                    <td className="px-3 py-3 text-xs text-amber-100/60">
                      {f.page_url || "—"}
                    </td>
                  </tr>
                ))}
                {feedbackList.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-10 text-center text-sm text-amber-100/50"
                    >
                      No feedback yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function formatLengthLabel(length: string | undefined): string {
  if (!length) return "—";
  if (length === "test_5s") return "~5 sec (dev test)";
  return `${length} min`;
}

function filterLinkClass(active: boolean) {
  return active
    ? "rounded-full bg-amber-200 px-3 py-1.5 text-xs font-medium text-[#1a1340]"
    : "rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-amber-100/80 hover:bg-white/10";
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${meta.badgeClass}`}
    >
      {meta.short}
    </span>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone,
  href,
}: {
  label: string;
  value: number;
  detail: string;
  tone: "calm" | "danger" | "working" | "success" | "neutral";
  href: string;
}) {
  const toneClass = {
    calm: "border-emerald-300/20 bg-emerald-400/[0.06]",
    danger: "border-red-300/25 bg-red-400/[0.08]",
    working: "border-purple-300/20 bg-purple-400/[0.07]",
    success: "border-emerald-300/20 bg-emerald-400/[0.07]",
    neutral: "border-white/12 bg-white/[0.04]",
  }[tone];

  return (
    <Link
      href={href}
      className={`rounded-2xl border p-4 shadow-xl shadow-black/10 transition hover:-translate-y-0.5 hover:bg-white/[0.07] ${toneClass}`}
    >
      <div className="text-xs uppercase tracking-wide text-amber-100/50">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold text-amber-50">{value}</div>
      <div className="mt-1 text-xs text-amber-100/60">{detail}</div>
    </Link>
  );
}

function PriorityOrderCard({
  order,
}: {
  order: {
    id: string;
    status: OrderStatus;
    parent_email: string;
    created_at: string;
    error?: string | null;
    admin_resolved_at?: string | null;
    admin_resolved_by_email?: string | null;
    form?: {
      childName?: string;
      islamicValue?: string;
      lengthMinutes?: string;
    } | null;
    safety_reasons?: unknown;
  };
}) {
  return (
    <article className="rounded-xl border border-white/12 bg-black/15 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium text-amber-50">
            {order.form?.childName || "Unknown child"}&apos;s story
          </h3>
          <p className="mt-1 text-xs text-amber-100/55">
            {formatDistanceToNow(order.created_at)} · {order.parent_email}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>
      {order.admin_resolved_at && (
        <p className="mt-3 rounded-md border border-emerald-300/20 bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-100">
          Fixed by admin
          {order.admin_resolved_by_email ? ` (${order.admin_resolved_by_email})` : ""}
        </p>
      )}
      <p className="mt-3 text-sm leading-relaxed text-amber-100/70">
        {STATUS_META[order.status].help}
      </p>
      {Array.isArray(order.safety_reasons) && order.safety_reasons.length > 0 && (
        <p className="mt-2 line-clamp-2 text-xs text-amber-200">
          Flag: {String(order.safety_reasons[0])}
        </p>
      )}
      {order.error && (
        <p className="mt-2 line-clamp-2 rounded-md border border-red-300/20 bg-red-500/10 px-2 py-1.5 text-xs text-red-200">
          {order.error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/admin/orders/${order.id}`}
          className="rounded-md bg-amber-200 px-3 py-1.5 text-xs font-semibold text-[#1a1340] hover:bg-amber-100"
        >
          Open action page
        </Link>
        <Link
          href={`/admin/orders/${order.id}#manual-upload`}
          className="rounded-md border border-emerald-300/35 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-500/20"
        >
          Manual audio
        </Link>
      </div>
    </article>
  );
}

function MetricLine({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-white/5 py-1 last:border-b-0">
      <span className="text-amber-100/45">{label}</span>
      <span className="font-medium text-amber-50/90">{value ?? "—"}</span>
    </div>
  );
}
