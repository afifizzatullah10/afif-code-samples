create table if not exists public.admin_runtime_flags (
  id                    int primary key default 1 check (id = 1),
  enable_story_review   boolean not null default false,
  updated_at            timestamptz not null default now()
);

insert into public.admin_runtime_flags (id, enable_story_review)
values (1, false)
on conflict (id) do nothing;

alter table public.admin_runtime_flags enable row level security;
