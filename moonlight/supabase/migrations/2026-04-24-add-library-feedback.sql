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
