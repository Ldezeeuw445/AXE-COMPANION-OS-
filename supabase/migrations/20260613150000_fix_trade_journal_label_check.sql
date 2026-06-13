-- The `label` CHECK constraint on trade_journal_labels still used an old tag
-- vocabulary ('PerfectlyExecuted','Good','Impatient','EmotionalWreck','VeryStupid')
-- that no longer matches the app's preset tags (Perfect, Good, OK, Impatient,
-- Poor, Emotional — see src/lib/journal/tradeTags.ts). Manual labels other than
-- 'Good'/'Impatient' therefore violated the constraint and silently failed to
-- save. Replace it with the current tag set (NULL still allowed for rows that
-- only carry an AXE label).

ALTER TABLE public.trade_journal_labels
  DROP CONSTRAINT IF EXISTS trade_journal_labels_label_check;

ALTER TABLE public.trade_journal_labels
  ADD CONSTRAINT trade_journal_labels_label_check
  CHECK (label IS NULL OR label = ANY (ARRAY['Perfect','Good','OK','Impatient','Poor','Emotional']));
