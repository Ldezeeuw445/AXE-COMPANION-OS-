create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  timezone text not null default 'Europe/Amsterdam',
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default 'AXE',
  pinned_context text not null default '',
  source_hint text,
  last_message_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  source text not null check (source in ('terminal', 'mobile', 'agent', 'system')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.assistant_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  key text,
  value jsonb not null default '{}'::jsonb,
  priority integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, kind, key)
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('price', 'news', 'risk', 'system')),
  title text not null,
  body text,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  read boolean not null default false,
  related_ref_type text,
  related_ref_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.action_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  action_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('draft', 'pending', 'approved', 'rejected', 'expired', 'cancelled', 'executed')),
  source text not null default 'agent'
    check (source in ('terminal', 'mobile', 'agent', 'system')),
  requested_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz,
  resolved_by_source text
    check (resolved_by_source in ('terminal', 'mobile', 'agent', 'system'))
);

create table if not exists public.vault_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('note', 'screenshot', 'chart_image', 'file', 'voice', 'link')),
  title text not null,
  content text,
  symbol text,
  storage_path text,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists conversations_user_id_last_message_at_idx
  on public.conversations (user_id, last_message_at desc);

create index if not exists messages_conversation_id_created_at_idx
  on public.messages (conversation_id, created_at asc);

create index if not exists messages_user_id_created_at_idx
  on public.messages (user_id, created_at desc);

create index if not exists assistant_memory_user_id_kind_priority_idx
  on public.assistant_memory (user_id, kind, priority desc, updated_at desc);

create index if not exists alerts_user_id_read_created_at_idx
  on public.alerts (user_id, read, created_at desc);

create index if not exists action_requests_user_id_status_requested_at_idx
  on public.action_requests (user_id, status, requested_at desc);

create index if not exists vault_items_user_id_kind_created_at_idx
  on public.vault_items (user_id, kind, created_at desc);

create index if not exists vault_items_tags_gin_idx
  on public.vault_items using gin (tags);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_conversations_updated_at on public.conversations;
create trigger set_conversations_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

drop trigger if exists set_assistant_memory_updated_at on public.assistant_memory;
create trigger set_assistant_memory_updated_at
before update on public.assistant_memory
for each row execute function public.set_updated_at();

drop trigger if exists set_vault_items_updated_at on public.vault_items;
create trigger set_vault_items_updated_at
before update on public.vault_items
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.assistant_memory enable row level security;
alter table public.alerts enable row level security;
alter table public.action_requests enable row level security;
alter table public.vault_items enable row level security;

create policy "profiles_select_own"
  on public.profiles
  for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles
  for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "conversations_own_all"
  on public.conversations
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "messages_own_all"
  on public.messages
  for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.conversations c
      where c.id = conversation_id
        and c.user_id = auth.uid()
    )
  );

create policy "assistant_memory_own_all"
  on public.assistant_memory
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "alerts_own_all"
  on public.alerts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "action_requests_own_all"
  on public.action_requests
  for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      conversation_id is null
      or exists (
        select 1
        from public.conversations c
        where c.id = conversation_id
          and c.user_id = auth.uid()
      )
    )
  );

create policy "vault_items_own_all"
  on public.vault_items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
