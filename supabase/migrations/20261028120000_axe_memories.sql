-- AXE Companion long-term trader memories.
--
-- DO NOT apply this live from the agent. The table is missing on
-- pqnngpcgbdwxavbatbia, which is why GET/POST /api/axe-memory returns 500.
-- Apply from the Supabase SQL editor (or `supabase db push`) after review.
--
-- /api/axe-memory reads and writes public.axe_memories. The older public.axe_memory
-- table is a different shape and is unused by that route.

create table if not exists public.axe_memories (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  memory_type  text not null
                 check (memory_type in (
                   'observation',
                   'pattern',
                   'preference',
                   'weakness',
                   'strength',
                   'rule',
                   'context'
                 )),
  content      text not null check (char_length(content) between 1 and 500),
  symbol       text,
  confidence   real not null default 0.6
                 check (confidence >= 0 and confidence <= 1),
  created_at   timestamptz not null default timezone('utc', now()),
  updated_at   timestamptz not null default timezone('utc', now())
);

create index if not exists axe_memories_user_created_idx
  on public.axe_memories (user_id, created_at desc);

create index if not exists axe_memories_user_type_idx
  on public.axe_memories (user_id, memory_type);

comment on table public.axe_memories is
  'Per-trader observations extracted from AXE chat. Owned by the Companion /api/axe-memory route.';

alter table public.axe_memories enable row level security;

drop policy if exists axe_memories_select_own on public.axe_memories;
create policy axe_memories_select_own
  on public.axe_memories for select
  using (auth.uid() = user_id);

drop policy if exists axe_memories_insert_own on public.axe_memories;
create policy axe_memories_insert_own
  on public.axe_memories for insert
  with check (auth.uid() = user_id);

drop policy if exists axe_memories_update_own on public.axe_memories;
create policy axe_memories_update_own
  on public.axe_memories for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists axe_memories_delete_own on public.axe_memories;
create policy axe_memories_delete_own
  on public.axe_memories for delete
  using (auth.uid() = user_id);

revoke all on table public.axe_memories from public;
revoke all on table public.axe_memories from anon;
grant select, insert, update, delete on table public.axe_memories to authenticated;
grant all on table public.axe_memories to service_role;
