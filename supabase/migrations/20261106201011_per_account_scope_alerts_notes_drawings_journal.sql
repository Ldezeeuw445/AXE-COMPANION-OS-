-- Everything per trading account (Luka, 6 Nov 2026). Additive only:
-- a nullable account_id on rows that were per user. NULL keeps today's
-- meaning (applies to every account), so existing rows and existing
-- Companion / Trading OS code keep working unchanged. If an account is
-- removed its rows stay and fall back to NULL (never deleted).
-- Applied to prod (pqnngpcgbdwxavbatbia) as version 20261106201011.
alter table public.user_alerts
  add column if not exists account_id uuid references public.user_broker_accounts(id) on delete set null;
alter table public.notes
  add column if not exists account_id uuid references public.user_broker_accounts(id) on delete set null;
alter table public.chart_drawings
  add column if not exists account_id uuid references public.user_broker_accounts(id) on delete set null;
alter table public.user_journal_entries
  add column if not exists account_id uuid references public.user_broker_accounts(id) on delete set null;

create index if not exists user_alerts_user_account_idx on public.user_alerts (user_id, account_id);
create index if not exists notes_user_account_idx on public.notes (user_id, account_id);
create index if not exists chart_drawings_user_account_idx on public.chart_drawings (user_id, account_id);
create index if not exists user_journal_entries_user_account_idx on public.user_journal_entries (user_id, account_id);

comment on column public.user_alerts.account_id is 'Trading account this alert belongs to; NULL = every account.';
comment on column public.notes.account_id is 'Trading account this note belongs to; NULL = every account.';
comment on column public.chart_drawings.account_id is 'Trading account this drawing belongs to; NULL = every account.';
comment on column public.user_journal_entries.account_id is 'Trading account this journal entry belongs to; NULL = every account.';
