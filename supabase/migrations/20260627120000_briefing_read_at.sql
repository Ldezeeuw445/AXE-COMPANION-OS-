-- Persist weekly brief visibility until the user reads it
ALTER TABLE axe_daily_briefings
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_axe_daily_briefings_unread_weekly
  ON axe_daily_briefings (user_id, briefing_type, read_at)
  WHERE briefing_type = 'weekly' AND read_at IS NULL;
