-- Seed AXE capability roadmap into assistant_memory for all existing users.
-- New users receive this via axeContextBuilder on first chat context build.

INSERT INTO public.assistant_memory_entries (user_id, scope, entry_key, content)
SELECT
  u.id,
  'axe',
  'capability_roadmap',
  'AXE CAPABILITY ROADMAP (active focus): Real-time broker pricing · Journal pattern recognition · Sentiment/intel when live · News tied to active symbols · Broker symbol universe beyond watchlist · Historical pattern insights · Per-account personalization.'
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1
  FROM public.assistant_memory_entries e
  WHERE e.user_id = u.id
    AND e.scope = 'axe'
    AND e.entry_key = 'capability_roadmap'
);
