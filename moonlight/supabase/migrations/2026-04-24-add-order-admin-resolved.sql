alter table public.orders add column if not exists admin_resolved_at timestamptz;
alter table public.orders add column if not exists admin_resolved_by_email text;

create index if not exists orders_admin_resolved_at_idx
  on public.orders (admin_resolved_at);
