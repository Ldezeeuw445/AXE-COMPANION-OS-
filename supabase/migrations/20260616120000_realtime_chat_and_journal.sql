-- Chat realtime sync + free-form journal entries for cockpit/calibration.

create table if not exists public.user_journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  symbol text not null default 'NOTE',
  notes text not null,
  rating text,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists user_journal_entries_user_id_created_at_idx
  on public.user_journal_entries (user_id, created_at desc);

alter table public.user_journal_entries enable row level security;

drop policy if exists "user_journal_entries_own_all" on public.user_journal_entries;
create policy "user_journal_entries_own_all"
  on public.user_journal_entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Enable Supabase Realtime for cross-device chat sync.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
