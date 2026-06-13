-- AXE auto-journal alignment columns on trade_journal_labels.
-- These already exist in the production database (added manually), but were
-- never captured in a committed migration. Add them idempotently so a fresh
-- database built from migrations matches production and the /api/axe-journal
-- + cockpit code paths work.

ALTER TABLE public.trade_journal_labels
  ADD COLUMN IF NOT EXISTS axe_label text,
  ADD COLUMN IF NOT EXISTS axe_note text,
  ADD COLUMN IF NOT EXISTS alignment_score real,
  ADD COLUMN IF NOT EXISTS axe_journal jsonb;

COMMENT ON COLUMN public.trade_journal_labels.alignment_score IS
  'AXE per-trade alignment score 0-100 (how well the trade matched the trader''s rules/playbooks).';
COMMENT ON COLUMN public.trade_journal_labels.axe_journal IS
  'AXE per-trade scoring breakdown JSON (rule_adherence, playbook_alignment, risk_management, emotional_discipline, explanation).';
