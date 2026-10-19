-- Applied live on pqnngpcgbdwxavbatbia on 2026-10-17 (approved by Luka, 20:46 CEST).
-- Removes TRUNCATE/REFERENCES/TRIGGER from anon+authenticated on all public tables
-- except core_* (owned by AXE Core). Idempotent. Does not touch SELECT/INSERT/UPDATE/DELETE.
do $$
declare r record;
begin
  for r in select tablename from pg_tables
           where schemaname = 'public' and tablename not like 'core\_%' escape '\'
  loop
    execute format('revoke truncate, references, trigger on public.%I from anon, authenticated', r.tablename);
  end loop;
end $$;

alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
