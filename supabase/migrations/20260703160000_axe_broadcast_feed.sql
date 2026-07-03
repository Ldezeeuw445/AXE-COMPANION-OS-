-- Global broadcast feed items (Daily News, Market Recap) — same content for all users.
-- Ingested via Vercel cron (/api/cron/krater-feed-sync) or manual webhook.

create table if not exists public.axe_broadcast_feed (
  id uuid primary key default gen_random_uuid(),
  broadcast_type text not null check (broadcast_type in ('daily_news', 'market_recap')),
  title text not null,
  body text not null default '',
  content_date date not null,
  source text not null default 'krater',
  external_key text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint axe_broadcast_feed_type_date_key unique (broadcast_type, content_date)
);

create index if not exists axe_broadcast_feed_created_idx
  on public.axe_broadcast_feed (created_at desc);

create index if not exists axe_broadcast_feed_type_date_idx
  on public.axe_broadcast_feed (broadcast_type, content_date desc);

alter table public.axe_broadcast_feed enable row level security;

drop policy if exists "axe_broadcast_feed_select_authenticated" on public.axe_broadcast_feed;
create policy "axe_broadcast_feed_select_authenticated"
  on public.axe_broadcast_feed for select
  to authenticated
  using (true);
