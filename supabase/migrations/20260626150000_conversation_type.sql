-- Add conversation_type to support persistent AXE Intelligence chat threads.

alter table public.conversations
  add column if not exists conversation_type text not null default 'axe'
  constraint conversations_type_check check (conversation_type in ('axe', 'intel'));

create index if not exists conversations_user_type_last_message_idx
  on public.conversations (user_id, conversation_type, last_message_at desc);

-- Update existing rows to 'axe' (already the default, but explicit is safe).
update public.conversations
  set conversation_type = 'axe'
  where conversation_type is null;
