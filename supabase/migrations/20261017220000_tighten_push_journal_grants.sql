-- Already applied live on pqnngpcgbdwxavbatbia (2026-10-17, version 20261017184504).
-- REVOKE is idempotent; safe to re-run.
revoke insert, update, delete, truncate, references, trigger on public.push_event_deliveries from authenticated;
revoke truncate, references, trigger on public.journal_attachments from authenticated;
