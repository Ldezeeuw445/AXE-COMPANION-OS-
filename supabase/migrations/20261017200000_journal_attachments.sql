-- Quick-journal attachments (voice / photo / screenshot / chart snapshot).
-- MUST be applied to project pqnngpcgbdwxavbatbia before the feature can store files.
-- Private bucket. Owner-only policies keyed by the first path segment = auth.uid().
-- Anon has no policies and is explicitly revoked — no anonymous access.

create table if not exists public.journal_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  trade_id uuid not null,
  account_id uuid not null,
  kind text not null check (kind in ('voice', 'photo', 'screenshot', 'chart')),
  storage_path text not null,
  mime_type text not null,
  byte_size integer not null default 0 check (byte_size >= 0),
  transcript text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, storage_path)
);

comment on table public.journal_attachments is
  'Metadata for files attached to a trade journal entry. Bytes live in the private journal-attachments bucket.';

comment on column public.journal_attachments.storage_path is
  'Object key: {user_id}/{trade_id}/{attachment_id}.{ext}. First segment is auth.uid().';

comment on column public.journal_attachments.transcript is
  'Optional STT text for voice notes. Null when no model is configured or transcription failed.';

create index if not exists journal_attachments_user_trade_idx
  on public.journal_attachments (user_id, trade_id, created_at desc);

alter table public.journal_attachments enable row level security;

drop policy if exists "journal_attachments_select_own" on public.journal_attachments;
create policy "journal_attachments_select_own"
  on public.journal_attachments
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "journal_attachments_insert_own" on public.journal_attachments;
create policy "journal_attachments_insert_own"
  on public.journal_attachments
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and split_part(storage_path, '/', 1) = auth.uid()::text
  );

drop policy if exists "journal_attachments_update_own" on public.journal_attachments;
create policy "journal_attachments_update_own"
  on public.journal_attachments
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and split_part(storage_path, '/', 1) = auth.uid()::text
  );

drop policy if exists "journal_attachments_delete_own" on public.journal_attachments;
create policy "journal_attachments_delete_own"
  on public.journal_attachments
  for delete
  to authenticated
  using (auth.uid() = user_id);

revoke all on table public.journal_attachments from public;
revoke all on table public.journal_attachments from anon;
grant select, insert, update, delete on table public.journal_attachments to authenticated;
grant all on table public.journal_attachments to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'journal-attachments',
  'journal-attachments',
  false,
  12582912,
  array[
    'audio/webm',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/x-m4a',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage: authenticated owner only. Path prefix = auth.uid(). No anon policies.
drop policy if exists "journal_attachments_storage_select_own" on storage.objects;
create policy "journal_attachments_storage_select_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'journal-attachments'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "journal_attachments_storage_insert_own" on storage.objects;
create policy "journal_attachments_storage_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'journal-attachments'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "journal_attachments_storage_update_own" on storage.objects;
create policy "journal_attachments_storage_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'journal-attachments'
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'journal-attachments'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "journal_attachments_storage_delete_own" on storage.objects;
create policy "journal_attachments_storage_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'journal-attachments'
    and split_part(name, '/', 1) = auth.uid()::text
  );
