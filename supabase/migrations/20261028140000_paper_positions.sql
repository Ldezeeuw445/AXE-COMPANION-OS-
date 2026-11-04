-- Open paper positions: where practice trades live until they close.
--
-- Build-list item 10. Closed paper trades go to `broker_trades`, because that
-- is what the journal, playbookEdge and the learning arc already read — a
-- paper trade landing there makes the whole chain work with no changes. What
-- had nowhere to live is the *open* position.
--
-- Why not reuse `mt5_positions`: its `account_id` is `text` while
-- `user_broker_accounts.id` is `uuid`, and it is fed from MetaApi rather than
-- written by us. Inheriting that mismatch to save a table would cost more
-- than it saves.
--
-- `quote_origin` is the column that matters. A fill priced from the demo
-- generator is not evidence about the trader, and if that fact is not carried
-- on the row it is gone by the time the position closes — at which point
-- playbookEdge counts it like any other trade and reports a random walk back
-- to someone as their edge. See src/lib/trading/paperQuoteSource.ts.
--
-- RLS: own rows only, checked on both sides. Written deliberately after
-- finding 34 policies on this project that were `to anon using (true)`.

create table if not exists public.paper_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.user_broker_accounts (id) on delete cascade,
  symbol text not null,
  side text not null check (side in ('buy', 'sell')),
  volume numeric not null check (volume > 0),
  open_price numeric not null check (open_price > 0),
  stop_loss numeric check (stop_loss is null or stop_loss > 0),
  take_profit numeric check (take_profit is null or take_profit > 0),
  opened_at timestamptz not null default now(),
  -- 'live' or 'simulated'. Never null: an unknown origin must not be able to
  -- pass as a real one, so the row cannot exist without saying which it was.
  quote_origin text not null check (quote_origin in ('live', 'simulated')),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.paper_positions is
  'Open paper-trading positions. Closed ones move to broker_trades with external_trade_id ''paper:<id>''. quote_origin says whether the fill price was real; only ''live'' counts as evidence about the trader.';

comment on column public.paper_positions.quote_origin is
  'live = filled at a real broker bid/ask; simulated = filled at generated demo prices and must never count towards playbookEdge or the learning arc.';

create index if not exists paper_positions_user_account_idx
  on public.paper_positions (user_id, account_id);

create index if not exists paper_positions_open_symbol_idx
  on public.paper_positions (account_id, symbol);

alter table public.paper_positions enable row level security;

drop policy if exists paper_positions_owner_select on public.paper_positions;
create policy paper_positions_owner_select on public.paper_positions
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists paper_positions_owner_insert on public.paper_positions;
create policy paper_positions_owner_insert on public.paper_positions
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists paper_positions_owner_update on public.paper_positions;
create policy paper_positions_owner_update on public.paper_positions
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists paper_positions_owner_delete on public.paper_positions;
create policy paper_positions_owner_delete on public.paper_positions
  for delete to authenticated
  using (auth.uid() = user_id);

revoke truncate on public.paper_positions from authenticated;
