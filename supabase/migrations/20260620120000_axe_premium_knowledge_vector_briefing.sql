-- AXE premium: knowledge base, vector RAG, daily briefings
-- Safe on fresh DBs and on projects where axe_knowledge_* already existed without embeddings.

create extension if not exists vector;

create table if not exists public.axe_knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  category text not null default 'general',
  content text not null default '',
  source_type text not null default 'seed',
  tags text[] not null default '{}'::text[],
  user_id uuid references auth.users (id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists axe_knowledge_documents_user_active_idx
  on public.axe_knowledge_documents (user_id, active);

alter table public.axe_knowledge_documents enable row level security;

drop policy if exists "axe_knowledge_documents_select" on public.axe_knowledge_documents;
create policy "axe_knowledge_documents_select"
  on public.axe_knowledge_documents for select
  using (user_id is null or auth.uid() = user_id);

create table if not exists public.axe_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.axe_knowledge_documents (id) on delete cascade,
  chunk_index integer not null default 0,
  chunk_text text not null,
  tags text[] not null default '{}'::text[],
  embedding vector(1536),
  created_at timestamptz not null default timezone('utc', now()),
  unique (document_id, chunk_index)
);

create index if not exists axe_knowledge_chunks_document_idx
  on public.axe_knowledge_chunks (document_id, chunk_index);

create index if not exists axe_knowledge_chunks_embedding_idx
  on public.axe_knowledge_chunks
  using hnsw (embedding vector_cosine_ops);

alter table public.axe_knowledge_chunks enable row level security;

drop policy if exists "axe_knowledge_chunks_select" on public.axe_knowledge_chunks;
create policy "axe_knowledge_chunks_select"
  on public.axe_knowledge_chunks for select
  using (
    exists (
      select 1
      from public.axe_knowledge_documents d
      where d.id = document_id
        and d.active = true
        and (d.user_id is null or d.user_id = auth.uid())
    )
  );

create table if not exists public.axe_strategy_playbooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  symbol text,
  timeframe text,
  rules text not null default '',
  invalidation text not null default '',
  checklist text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists axe_strategy_playbooks_user_active_idx
  on public.axe_strategy_playbooks (user_id, active);

alter table public.axe_strategy_playbooks enable row level security;

drop policy if exists "axe_strategy_playbooks_select" on public.axe_strategy_playbooks;
create policy "axe_strategy_playbooks_select"
  on public.axe_strategy_playbooks for select
  using (user_id is null or auth.uid() = user_id);

create table if not exists public.axe_user_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  rule_type text not null default 'risk',
  severity text not null default 'info',
  rule_text text not null,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists axe_user_rules_user_active_idx
  on public.axe_user_rules (user_id, active);

alter table public.axe_user_rules enable row level security;

drop policy if exists "axe_user_rules_select_own" on public.axe_user_rules;
create policy "axe_user_rules_select_own"
  on public.axe_user_rules for select
  using (auth.uid() = user_id);

drop policy if exists "axe_user_rules_insert_own" on public.axe_user_rules;
create policy "axe_user_rules_insert_own"
  on public.axe_user_rules for insert
  with check (auth.uid() = user_id);

drop policy if exists "axe_user_rules_update_own" on public.axe_user_rules;
create policy "axe_user_rules_update_own"
  on public.axe_user_rules for update
  using (auth.uid() = user_id);

create table if not exists public.axe_daily_briefings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  briefing_date date not null,
  title text not null,
  body text not null default '',
  highlights jsonb not null default '[]'::jsonb,
  chat_prefill text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, briefing_date)
);

create index if not exists axe_daily_briefings_user_date_idx
  on public.axe_daily_briefings (user_id, briefing_date desc);

alter table public.axe_daily_briefings enable row level security;

drop policy if exists "axe_daily_briefings_select_own" on public.axe_daily_briefings;
create policy "axe_daily_briefings_select_own"
  on public.axe_daily_briefings for select
  using (auth.uid() = user_id);

create or replace function public.match_axe_knowledge_chunks(
  query_embedding vector(1536),
  match_count integer default 12,
  match_user_id uuid default null
)
returns table (
  document_id uuid,
  slug text,
  title text,
  category text,
  chunk_text text,
  tags text[],
  similarity double precision
)
language sql
stable
as $$
  select
    c.document_id,
    d.slug,
    d.title,
    d.category,
    c.chunk_text,
    c.tags,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.axe_knowledge_chunks c
  join public.axe_knowledge_documents d on d.id = c.document_id
  where d.active = true
    and c.embedding is not null
    and (d.user_id is null or d.user_id = match_user_id)
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
