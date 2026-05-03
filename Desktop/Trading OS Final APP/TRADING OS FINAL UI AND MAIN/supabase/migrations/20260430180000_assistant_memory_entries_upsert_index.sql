-- Companion + Trading OS: upserts use ON CONFLICT (user_id, scope, entry_key) on assistant_memory_entries.
-- Postgres requires a matching unique index; without it PostgREST returns:
-- "there is no unique or exclusion constraint matching the ON CONFLICT specification"

DO $migration$
BEGIN
  IF to_regclass('public.assistant_memory_entries') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS assistant_memory_entries_user_scope_key_uidx
      ON public.assistant_memory_entries (user_id, scope, entry_key);
  END IF;
END;
$migration$;
