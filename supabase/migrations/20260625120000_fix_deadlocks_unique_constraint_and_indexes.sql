-- Migration: 20260625120000_fix_deadlocks_unique_constraint_and_indexes.sql
-- Purpose: Fix the deadlock storm caused by SELECT→INSERT/UPDATE race conditions
--          and add missing user_id indexes to reduce full table scans (Disk IO).
--
-- Root cause: upsertCockpitLearningMetrics was doing SELECT→INSERT/UPDATE per metric row.
--             Multiple concurrent users would race through the SELECT gap and all try to
--             INSERT the same (user_id, metric_key) row simultaneously, causing deadlocks.
--             Fix: replace with a proper ON CONFLICT DO UPDATE upsert (already done in code).
--             This migration adds the required UNIQUE constraint to support that upsert.

-- Step 1: Remove duplicate rows first (keep only the latest per user+metric_key)
-- so the unique constraint can be added cleanly.
DELETE FROM public.assistant_learning_metrics a
USING public.assistant_learning_metrics b
WHERE a.id < b.id
  AND a.user_id = b.user_id
  AND a.metric_key = b.metric_key;

-- Step 2: Add UNIQUE constraint on (user_id, metric_key) — required for the upsert.
ALTER TABLE public.assistant_learning_metrics
  ADD CONSTRAINT assistant_learning_metrics_user_metric_unique
  UNIQUE (user_id, metric_key);

-- Step 3: Add missing user_id indexes to eliminate full table scans.
-- Each missing index forces Postgres to scan the whole table on every query,
-- which amplifies Disk IO and makes locks take longer (increasing deadlock window).

CREATE INDEX IF NOT EXISTS idx_messages_user_id
  ON public.messages(user_id);

CREATE INDEX IF NOT EXISTS idx_assistant_memory_entries_user_id
  ON public.assistant_memory_entries(user_id);

CREATE INDEX IF NOT EXISTS idx_user_journal_entries_user_id
  ON public.user_journal_entries(user_id);

CREATE INDEX IF NOT EXISTS idx_broker_trades_user_id
  ON public.broker_trades(user_id);

CREATE INDEX IF NOT EXISTS idx_assistant_learning_signals_user_id
  ON public.assistant_learning_signals(user_id);

CREATE INDEX IF NOT EXISTS idx_assistant_cockpit_snapshots_user_id
  ON public.assistant_cockpit_snapshots(user_id);

CREATE INDEX IF NOT EXISTS idx_assistant_cockpit_snapshots_user_captured
  ON public.assistant_cockpit_snapshots(user_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_assistant_learning_arc_user_id
  ON public.assistant_learning_arc(user_id);
