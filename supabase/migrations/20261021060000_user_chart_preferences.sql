-- How a trader reads a chart, held server-side instead of only in one browser.
--
-- Until now every chart preference lived in localStorage: indicator toggles,
-- SMC tools, MA period and type, pane heights and order, fib mode, theme. That
-- cost three things, and the third is the one that mattered:
--
--   1. A new phone, a cleared browser or a second device started from nothing.
--   2. Companion and Trading OS run on one Supabase project and share one
--      account, and shared nothing about how the trader looks at a chart.
--   3. AXE could not see it. learningArcService used to tell the model
--      "Key indicators they use: RSI, MACD, MA" for every trader alike, from a
--      constant in the source. This is what makes that real.
--
-- One row per (user, account, symbol). The absence of an account or a symbol is
-- the literal '*', not null: Postgres will not enforce a primary key across
-- nullable columns, and "is null" special cases spread through every query.
--
-- Applied to the live project 2026-10-21 and verified: four policies, and
-- only `authenticated` and `service_role` hold grants.

create table if not exists public.user_chart_preferences (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  -- A broker account id, or '*' for demo mode and account-independent keys.
  account_key text        not null default '*',
  -- An uppercased symbol, or '*' for preferences that are not per symbol.
  symbol_key  text        not null default '*',
  -- Flat map of preference key -> string value. The API allowlists the keys
  -- and caps each value (src/lib/chart/chartPrefs.ts), so this is not an open
  -- key/value store under the trader's own row.
  prefs       jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (user_id, account_key, symbol_key),
  constraint user_chart_preferences_prefs_is_object
    check (jsonb_typeof(prefs) = 'object'),
  constraint user_chart_preferences_account_key_len check (length(account_key) between 1 and 64),
  constraint user_chart_preferences_symbol_key_len  check (length(symbol_key)  between 1 and 32)
);

comment on table public.user_chart_preferences is
  'Per-user chart setup, synced across devices and readable by AXE. Keys are allowlisted in src/lib/chart/chartPrefs.ts.';

-- The common read is "everything for this user", on page load.
create index if not exists user_chart_preferences_user_idx
  on public.user_chart_preferences (user_id, updated_at desc);

alter table public.user_chart_preferences enable row level security;

-- A chart setup is personal. Per command rather than one blanket `for all`, so
-- a later change to one policy cannot silently widen the others.
drop policy if exists user_chart_preferences_select_own on public.user_chart_preferences;
create policy user_chart_preferences_select_own
  on public.user_chart_preferences for select
  using (auth.uid() = user_id);

drop policy if exists user_chart_preferences_insert_own on public.user_chart_preferences;
create policy user_chart_preferences_insert_own
  on public.user_chart_preferences for insert
  with check (auth.uid() = user_id);

drop policy if exists user_chart_preferences_update_own on public.user_chart_preferences;
create policy user_chart_preferences_update_own
  on public.user_chart_preferences for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists user_chart_preferences_delete_own on public.user_chart_preferences;
create policy user_chart_preferences_delete_own
  on public.user_chart_preferences for delete
  using (auth.uid() = user_id);

-- anon has no business here; the app reads this as the signed-in user.
revoke all on table public.user_chart_preferences from public;
revoke all on table public.user_chart_preferences from anon;
grant select, insert, update, delete on table public.user_chart_preferences to authenticated;
grant all on table public.user_chart_preferences to service_role;
