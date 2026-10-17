-- PHASE C6 — server-triggered push dedup / rate-limit.
-- Notification category + quiet-hour prefs live on the existing
-- public.profiles.preferences JSONB (key: "push") plus profiles.timezone.
-- This table is only the per-user+event delivery ledger.
--
-- MUST be applied to project pqnngpcgbdwxavbatbia before the C6 deploy.
-- Do not skip: dispatchPushEvent upserts into public.push_event_deliveries.

create table if not exists public.push_event_deliveries (
  user_id uuid not null references auth.users (id) on delete cascade,
  event_key text not null,
  category text not null
    check (category in (
      'price_alert',
      'risk_alert',
      'broker_disconnect',
      'economic_event',
      'axe_finding'
    )),
  last_sent_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, event_key)
);

comment on table public.push_event_deliveries is
  'Per-user+event push delivery ledger. Used to dedup and rate-limit server-triggered notifications. Written by the service role; owners may only read their own rows.';

comment on column public.push_event_deliveries.event_key is
  'Stable key for one logical event (alert id, news title+start, broker+day, …).';

comment on column public.push_event_deliveries.category is
  'Push category: price_alert, risk_alert, broker_disconnect, economic_event, axe_finding.';

create index if not exists push_event_deliveries_user_sent_idx
  on public.push_event_deliveries (user_id, last_sent_at desc);

alter table public.push_event_deliveries enable row level security;

-- Owner-only. Anon has no policies and is explicitly revoked.
drop policy if exists "push_event_deliveries_select_own" on public.push_event_deliveries;
create policy "push_event_deliveries_select_own"
  on public.push_event_deliveries
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on table public.push_event_deliveries from public;
revoke all on table public.push_event_deliveries from anon;
grant select on table public.push_event_deliveries to authenticated;
grant all on table public.push_event_deliveries to service_role;
