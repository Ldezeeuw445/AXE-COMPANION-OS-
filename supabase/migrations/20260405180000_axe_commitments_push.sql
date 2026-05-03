-- AXE commitments: tracks promises AXE makes ("I'll monitor this", "I'll alert you")
create table if not exists public.axe_commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  symbol text,
  description text not null,
  status text not null default 'open'
    check (status in ('open', 'done', 'cancelled')),
  created_at timestamptz not null default timezone('utc', now()),
  last_checked timestamptz,
  resolved_at timestamptz
);

create index if not exists axe_commitments_user_id_status_idx
  on public.axe_commitments (user_id, status, created_at desc);

alter table public.axe_commitments enable row level security;

create policy "axe_commitments_own_all"
  on public.axe_commitments
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Push notification subscriptions per user/device
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Users can manage their own subscriptions; server uses service role
create policy "push_subscriptions_own_all"
  on public.push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
