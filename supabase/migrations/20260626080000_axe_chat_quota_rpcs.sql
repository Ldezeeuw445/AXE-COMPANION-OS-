-- ============================================================
-- AXE Chat Quota RPCs
-- Provides: axe_chat_try_consume, axe_chat_quota_status, axe_chat_refund
-- All are per-user, RLS-safe, called with the user's anon key session.
-- Free tier: 20 messages / UTC day. Pro/exempt: unlimited (-1).
-- ============================================================

-- 1. Ensure quota table exists --------------------------------
create table if not exists public.axe_chat_quota (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  used_today integer   not null default 0,
  quota_date date      not null default (current_date at time zone 'utc'),
  updated_at timestamptz not null default now()
);

alter table public.axe_chat_quota enable row level security;

-- Users can only read/write their own row
drop policy if exists "own quota" on public.axe_chat_quota;
create policy "own quota" on public.axe_chat_quota
  for all using (user_id = auth.uid());

-- 2. Daily limit helper (override per user via profiles.plan) -
create or replace function public.axe_chat_daily_limit(p_user_id uuid)
returns integer
language sql stable security definer
as $$
  select coalesce(
    (select case
       when plan in ('pro','founder','exempt') then -1   -- unlimited
       else 20                                            -- free tier
     end
     from public.profiles
     where id = p_user_id
     limit 1),
    20  -- default when profile row missing
  );
$$;

-- 3. axe_chat_try_consume -------------------------------------
-- Returns: { allowed bool, reason text, remaining int }
-- remaining = -1 means unlimited (pro/exempt), nothing consumed.
create or replace function public.axe_chat_try_consume()
returns jsonb
language plpgsql security definer
as $$
declare
  v_user_id  uuid := auth.uid();
  v_limit    integer;
  v_used     integer;
  v_today    date := (current_timestamp at time zone 'utc')::date;
  v_row      public.axe_chat_quota%rowtype;
begin
  if v_user_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'unauthenticated', 'remaining', 0);
  end if;

  v_limit := public.axe_chat_daily_limit(v_user_id);

  -- Unlimited plan — don't touch quota row
  if v_limit = -1 then
    return jsonb_build_object('allowed', true, 'reason', 'unlimited', 'remaining', -1);
  end if;

  -- Upsert quota row (reset if date changed)
  insert into public.axe_chat_quota (user_id, used_today, quota_date)
  values (v_user_id, 0, v_today)
  on conflict (user_id) do update
    set used_today = case
          when axe_chat_quota.quota_date < v_today then 0
          else axe_chat_quota.used_today
        end,
        quota_date = v_today
  returning * into v_row;

  -- Re-fetch after upsert in case concurrent update
  select * into v_row from public.axe_chat_quota where user_id = v_user_id for update;

  -- Check limit
  if v_row.used_today >= v_limit then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'daily_limit',
      'remaining', 0
    );
  end if;

  -- Consume one slot
  update public.axe_chat_quota
  set used_today = used_today + 1, updated_at = now()
  where user_id = v_user_id;

  return jsonb_build_object(
    'allowed', true,
    'reason', 'ok',
    'remaining', v_limit - v_row.used_today - 1
  );
end;
$$;

-- 4. axe_chat_quota_status -----------------------------------
-- Non-destructive read; used by the quota display in the UI.
create or replace function public.axe_chat_quota_status()
returns jsonb
language plpgsql security definer
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit   integer;
  v_used    integer := 0;
  v_today   date := (current_timestamp at time zone 'utc')::date;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false);
  end if;

  v_limit := public.axe_chat_daily_limit(v_user_id);

  if v_limit = -1 then
    return jsonb_build_object(
      'ok', true, 'plan', 'pro', 'limit', -1,
      'used', 0, 'remaining', -1, 'skipped', false
    );
  end if;

  select coalesce(
    (select used_today from public.axe_chat_quota
     where user_id = v_user_id and quota_date = v_today),
    0
  ) into v_used;

  return jsonb_build_object(
    'ok', true,
    'plan', 'free',
    'limit', v_limit,
    'used', v_used,
    'remaining', greatest(v_limit - v_used, 0),
    'skipped', false
  );
end;
$$;

-- 5. axe_chat_refund -----------------------------------------
-- Gives back one slot when the AI call fails after quota consumed.
create or replace function public.axe_chat_refund()
returns void
language plpgsql security definer
as $$
declare
  v_user_id uuid := auth.uid();
  v_today   date := (current_timestamp at time zone 'utc')::date;
begin
  if v_user_id is null then return; end if;
  update public.axe_chat_quota
  set used_today = greatest(used_today - 1, 0), updated_at = now()
  where user_id = v_user_id and quota_date = v_today;
end;
$$;

-- Grants (anon key needs execute for RLS-gated calls)
grant execute on function public.axe_chat_try_consume()   to authenticated;
grant execute on function public.axe_chat_quota_status()  to authenticated;
grant execute on function public.axe_chat_refund()        to authenticated;
grant execute on function public.axe_chat_daily_limit(uuid) to authenticated;
