-- Add briefing_type + feed_url to daily briefings table and update unique constraint.

alter table public.axe_daily_briefings
  add column if not exists briefing_type text not null default 'daily',
  add column if not exists feed_url text not null default '/feed';

-- Drop old single-constraint and recreate composite unique index if needed.
alter table public.axe_daily_briefings
  drop constraint if exists axe_daily_briefings_user_id_briefing_date_key;

alter table public.axe_daily_briefings
  add constraint axe_daily_briefings_user_date_type_key
    unique (user_id, briefing_date, briefing_type);
