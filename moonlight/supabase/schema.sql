-- Moonlight — Parts 2 and 3 schema (copy-paste into Supabase SQL Editor).
-- Idempotent: safe to re-run after schema changes.

-- =============================================================
-- Part 2 — public playback
-- =============================================================

-- stories: publicly-readable (by unguessable slug) playback rows.
-- audio_url is nullable so we can publish a text-only row as soon as OpenAI
-- finishes (parents can read), and backfill audio when ElevenLabs finishes.
create table if not exists public.stories (
  slug              text primary key,
  child_name        text not null,
  theme             text,
  duration_seconds  integer,
  audio_url         text,
  story_text        text,
  created_at        timestamptz not null default now(),
  play_count        integer not null default 0
);

-- Migrations for existing databases (additive, safe to re-run):
alter table public.stories add column if not exists story_text text;
alter table public.stories alter column audio_url drop not null;

alter table public.stories enable row level security;

drop policy if exists "public read stories" on public.stories;
create policy "public read stories"
  on public.stories
  for select
  to anon, authenticated
  using (true);

-- Public storage bucket for audio
insert into storage.buckets (id, name, public)
values ('stories', 'stories', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "public read audio" on storage.objects;
create policy "public read audio"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'stories');

-- =============================================================
-- Part 3 — automated fulfillment
-- =============================================================

-- Enum for order lifecycle.
-- 'ready' = text + audio both done (or text-only + audio intentionally skipped).
-- 'audio_failed' = text succeeded and is readable; audio step blew up and
--                  can be retried by admin. Parents can still read the story.
-- 'pending_review' = safety gate flagged; admin must approve.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type order_status as enum (
      'awaiting_payment',
      'paid',
      'generating',
      'pending_review',
      'ready',
      'audio_failed',
      'failed'
    );
  end if;
end $$;

-- Ensure 'audio_failed' exists on enums created before this migration.
do $$
begin
  if not exists (
    select 1 from pg_enum
    where enumlabel = 'audio_failed'
      and enumtypid = (select oid from pg_type where typname = 'order_status')
  ) then
    alter type order_status add value 'audio_failed';
  end if;
end $$;

create table if not exists public.orders (
  id                 uuid primary key default gen_random_uuid(),
  status             order_status not null default 'awaiting_payment',
  parent_email       text not null,
  form               jsonb not null,
  story_slug         text references public.stories(slug) on delete set null,
  story_text         text,
  tts_word_count     integer,
  tts_char_count     integer,
  elevenlabs_request_id text,
  elevenlabs_billed_characters integer,
  one_time_credits_backfilled boolean not null default false,
  safety_reasons     jsonb,
  error              text,
  stripe_session_id  text unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.orders add column if not exists tts_word_count integer;
alter table public.orders add column if not exists tts_char_count integer;
alter table public.orders add column if not exists elevenlabs_request_id text;
alter table public.orders add column if not exists elevenlabs_billed_characters integer;
alter table public.orders add column if not exists one_time_credits_backfilled boolean not null default false;
alter table public.orders add column if not exists admin_resolved_at timestamptz;
alter table public.orders add column if not exists admin_resolved_by_email text;

create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_admin_resolved_at_idx on public.orders (admin_resolved_at);

-- Lock orders down: only service_role (server-side) can read/write.
alter table public.orders enable row level security;

drop policy if exists "no public access to orders" on public.orders;
-- By default, with RLS enabled and no policies, anon/authenticated get nothing.
-- service_role bypasses RLS entirely, which is what our server code uses.

-- Keep updated_at current
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
  before update on public.orders
  for each row execute function public.touch_updated_at();

-- =============================================================
-- Part 3B — user accounts (Supabase Auth magic links) + library
-- =============================================================

-- Link orders & stories to the parent's auth user (nullable; guest purchases
-- are still supported — a later login backfills these by email).
alter table public.orders
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.stories
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists orders_user_id_idx on public.orders (user_id);
create index if not exists stories_user_id_idx on public.stories (user_id);

-- Stories stay publicly readable (slug is the access token). Library pages
-- just filter by user_id via the admin client or via auth.uid() on a view —
-- we use the admin path so no new policy is needed.

-- Orders policy: authenticated users read their own (service_role bypasses).
drop policy if exists "users read own orders" on public.orders;
create policy "users read own orders"
  on public.orders for select
  to authenticated
  using (user_id = auth.uid());

-- =============================================================
-- Part 3C — subscriptions
-- =============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'plan_tier') then
    create type plan_tier as enum ('free', 'monthly', 'unlimited');
  end if;
end $$;

create table if not exists public.subscriptions (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  plan                   plan_tier not null default 'free',
  status                 text not null default 'inactive',
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  stories_this_period    int not null default 0,
  extra_story_credits    int not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table public.subscriptions
  add column if not exists extra_story_credits int not null default 0;

alter table public.subscriptions enable row level security;
drop policy if exists "users read own subscription" on public.subscriptions;
create policy "users read own subscription"
  on public.subscriptions for select
  to authenticated
  using (user_id = auth.uid());

drop trigger if exists subscriptions_touch_updated_at on public.subscriptions;
create trigger subscriptions_touch_updated_at
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- Helper: increment usage counter when a subscription-funded order ships.
create or replace function public.increment_subscription_usage(p_user_id uuid)
returns void
language sql
as $$
  update public.subscriptions
  set stories_this_period = stories_this_period + 1
  where user_id = p_user_id;
$$;

-- =============================================================
-- Part 3D — library feedback
-- =============================================================

create table if not exists public.library_feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  email       text,
  message     text not null check (char_length(message) between 5 and 2000),
  page_url    text,
  created_at  timestamptz not null default now()
);

create index if not exists library_feedback_created_at_idx
  on public.library_feedback (created_at desc);

create index if not exists library_feedback_user_id_idx
  on public.library_feedback (user_id);

alter table public.library_feedback enable row level security;

drop policy if exists "users insert own library feedback" on public.library_feedback;
create policy "users insert own library feedback"
  on public.library_feedback for insert
  to authenticated
  with check (user_id = auth.uid());

-- =============================================================
-- Part 3E — admin runtime flags
-- =============================================================

create table if not exists public.admin_runtime_flags (
  id                    int primary key default 1 check (id = 1),
  enable_story_review   boolean not null default false,
  updated_at            timestamptz not null default now()
);

insert into public.admin_runtime_flags (id, enable_story_review)
values (1, false)
on conflict (id) do nothing;

alter table public.admin_runtime_flags enable row level security;

drop policy if exists "no public access to admin_runtime_flags" on public.admin_runtime_flags;
-- service_role bypasses RLS; no anon/auth policies needed.
