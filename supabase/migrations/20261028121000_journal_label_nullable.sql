-- Let AXE-only journal rows exist without a manual trader tag.
--
-- DO NOT apply this live from the agent. Companion code now also copies
-- axe_label into label so inserts succeed even before this runs. The
-- migration matches the CHECK constraint comment from
-- 20260613150000_fix_trade_journal_label_check.sql: NULL is allowed for
-- rows that only carry an AXE label. Production still has label NOT NULL,
-- which is why journal-sweep scored trades and wrote zero rows.

alter table public.trade_journal_labels
  alter column label drop not null;
