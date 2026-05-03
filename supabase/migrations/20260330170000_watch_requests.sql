create table if not exists public.watch_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  kind text not null check (kind in ('price', 'news', 'event', 'level', 'custom')),
  symbol text,
  condition_type text not null
    check (
      condition_type in (
        'price_above',
        'price_below',
        'price_touch',
        'headline_match',
        'economic_event',
        'custom'
      )
    ),
  condition_payload jsonb not null default '{}'::jsonb,
  status text not null default 'active'
    check (status in ('active', 'triggered', 'cancelled', 'expired', 'resolved')),
  message text,
  source text not null default 'agent'
    check (source in ('terminal', 'mobile', 'agent', 'system')),
  created_at timestamptz not null default timezone('utc', now()),
  triggered_at timestamptz,
  resolved_at timestamptz
);

create index if not exists watch_requests_user_id_status_created_at_idx
  on public.watch_requests (user_id, status, created_at desc);

create index if not exists watch_requests_status_kind_idx
  on public.watch_requests (status, kind);

create index if not exists watch_requests_condition_payload_gin_idx
  on public.watch_requests using gin (condition_payload);

alter table public.watch_requests enable row level security;

create policy "watch_requests_own_all"
  on public.watch_requests
  for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      conversation_id is null
      or exists (
        select 1
        from public.conversations c
        where c.id = conversation_id
          and c.user_id = auth.uid()
      )
    )
  );
