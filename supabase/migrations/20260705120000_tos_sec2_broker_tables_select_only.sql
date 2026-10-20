-- TOS-SEC-2: authenticated users keep SELECT on own rows only.
-- INSERT / UPDATE / DELETE on broker_trades + user_broker_accounts must go
-- through the service-role write client (resolveMt5SyncWriteClient).
-- Service role bypasses RLS; ownership stays enforced by caller userId filters.
--
-- Prep only until ops applies this migration — do not run against prod from agents.

alter table public.user_broker_accounts enable row level security;
alter table public.broker_trades enable row level security;

do $$
declare
  r record;
  has_select boolean;
begin
  -- Drop write (and ALL) policies. ALL would also cover SELECT, so we
  -- re-ensure a SELECT-own policy below when none remain.
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('user_broker_accounts', 'broker_trades')
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;

  select exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_broker_accounts'
      and cmd = 'SELECT'
  ) into has_select;
  if not has_select then
    execute $p$
      create policy "user_broker_accounts_select_own"
        on public.user_broker_accounts
        for select
        to authenticated
        using (auth.uid() = user_id)
    $p$;
  end if;

  select exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'broker_trades'
      and cmd = 'SELECT'
  ) into has_select;
  if not has_select then
    execute $p$
      create policy "broker_trades_select_own"
        on public.broker_trades
        for select
        to authenticated
        using (auth.uid() = user_id)
    $p$;
  end if;
end $$;

comment on table public.user_broker_accounts is
  'TOS-SEC-2: authenticated SELECT own rows; mutations via service role (resolveMt5SyncWriteClient).';

comment on table public.broker_trades is
  'TOS-SEC-2: authenticated SELECT own rows; mutations via service role (resolveMt5SyncWriteClient).';
