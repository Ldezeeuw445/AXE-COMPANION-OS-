-- AXE Color System + Auto-Tagging
-- 1. Add axe_label & axe_note columns to trade_journal_labels
-- 2. Create axe_color_system table for AXE Core context

-- ── 1. AXE Auto-Tagging columns ─────────────────────────────────

ALTER TABLE trade_journal_labels
  ADD COLUMN IF NOT EXISTS axe_label text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS axe_note  text DEFAULT NULL;

COMMENT ON COLUMN trade_journal_labels.axe_label IS 'AXE Core auto-generated trade tag (e.g. Perfect, Good, Impatient)';
COMMENT ON COLUMN trade_journal_labels.axe_note  IS 'AXE Core reasoning for the auto-tag';

-- ── 2. AXE Color System table ───────────────────────────────────

CREATE TABLE IF NOT EXISTS axe_color_system (
  term     text PRIMARY KEY,
  hex      text NOT NULL,
  category text NOT NULL
);

COMMENT ON TABLE axe_color_system IS 'Semantic color map for AXE chat rendering — 7 categories, 100+ terms';

-- Enable RLS (read-only for authenticated users, admin-write)
ALTER TABLE axe_color_system ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read color system"
  ON axe_color_system FOR SELECT
  TO authenticated
  USING (true);

-- ── 3. Seed color data ──────────────────────────────────────────

INSERT INTO axe_color_system (term, hex, category) VALUES
  -- Bullish Green
  ('support',       '#4ECBA0', 'bullish'),
  ('bullish',       '#4ECBA0', 'bullish'),
  ('long',          '#4ECBA0', 'bullish'),
  ('buy',           '#4ECBA0', 'bullish'),
  ('take profit',   '#4ECBA0', 'bullish'),
  ('tp',            '#4ECBA0', 'bullish'),
  ('higher high',   '#4ECBA0', 'bullish'),
  ('hh',            '#4ECBA0', 'bullish'),
  ('higher low',    '#4ECBA0', 'bullish'),
  ('hl',            '#4ECBA0', 'bullish'),
  ('demand zone',   '#4ECBA0', 'bullish'),
  ('demand',        '#4ECBA0', 'bullish'),
  ('dovish',        '#4ECBA0', 'bullish'),
  ('uptrend',       '#4ECBA0', 'bullish'),
  ('accumulation',  '#4ECBA0', 'bullish'),
  ('oversold',      '#4ECBA0', 'bullish'),
  ('entry',         '#4ECBA0', 'bullish'),
  -- Bearish Rose
  ('resistance',    '#F07080', 'bearish'),
  ('bearish',       '#F07080', 'bearish'),
  ('short',         '#F07080', 'bearish'),
  ('sell',          '#F07080', 'bearish'),
  ('stop loss',     '#F07080', 'bearish'),
  ('sl',            '#F07080', 'bearish'),
  ('lower high',    '#F07080', 'bearish'),
  ('lh',            '#F07080', 'bearish'),
  ('lower low',     '#F07080', 'bearish'),
  ('ll',            '#F07080', 'bearish'),
  ('supply zone',   '#F07080', 'bearish'),
  ('supply',        '#F07080', 'bearish'),
  ('hawkish',       '#F07080', 'bearish'),
  ('downtrend',     '#F07080', 'bearish'),
  ('rejection',     '#F07080', 'bearish'),
  ('distribution',  '#F07080', 'bearish'),
  ('overbought',    '#F07080', 'bearish'),
  -- Neutral Blue
  ('neutral',       '#7B93DB', 'neutral'),
  ('consolidation', '#7B93DB', 'neutral'),
  ('range',         '#7B93DB', 'neutral'),
  ('sideways',      '#7B93DB', 'neutral'),
  ('equilibrium',   '#7B93DB', 'neutral'),
  ('indecision',    '#7B93DB', 'neutral'),
  -- Catalyst Amber
  ('catalysts',     '#E8B84B', 'catalyst'),
  ('catalyst',      '#E8B84B', 'catalyst'),
  ('fomc',          '#E8B84B', 'catalyst'),
  ('core pce',      '#E8B84B', 'catalyst'),
  ('gdp',           '#E8B84B', 'catalyst'),
  ('nfp',           '#E8B84B', 'catalyst'),
  ('cpi',           '#E8B84B', 'catalyst'),
  ('ism',           '#E8B84B', 'catalyst'),
  ('adp',           '#E8B84B', 'catalyst'),
  ('big 3',         '#E8B84B', 'catalyst'),
  ('high-impact',   '#E8B84B', 'catalyst'),
  ('news impact',   '#E8B84B', 'catalyst'),
  ('ppi',           '#E8B84B', 'catalyst'),
  ('interest rate', '#E8B84B', 'catalyst'),
  ('fed',           '#E8B84B', 'catalyst'),
  ('ecb',           '#E8B84B', 'catalyst'),
  ('risk/reward',   '#E8B84B', 'catalyst'),
  ('r:r',           '#E8B84B', 'catalyst'),
  -- Section Purple
  ('market structure',       '#B18CFF', 'section'),
  ('outlook',                '#B18CFF', 'section'),
  ('key levels',             '#B18CFF', 'section'),
  ('key level',              '#B18CFF', 'section'),
  ('action points',          '#B18CFF', 'section'),
  ('opportunities',          '#B18CFF', 'section'),
  ('considerations',         '#B18CFF', 'section'),
  ('bias drivers',           '#B18CFF', 'section'),
  ('next steps',             '#B18CFF', 'section'),
  ('current context',        '#B18CFF', 'section'),
  ('exposure consideration', '#B18CFF', 'section'),
  ('analysis',               '#B18CFF', 'section'),
  ('summary',                '#B18CFF', 'section'),
  ('trade plan',             '#B18CFF', 'section'),
  ('trade setup',            '#B18CFF', 'section'),
  ('overview',               '#B18CFF', 'section'),
  ('technical analysis',     '#B18CFF', 'section'),
  ('fundamental analysis',   '#B18CFF', 'section'),
  ('macro overview',         '#B18CFF', 'section'),
  ('risk assessment',        '#B18CFF', 'section'),
  ('weekly outlook',         '#B18CFF', 'section'),
  ('daily outlook',          '#B18CFF', 'section'),
  ('session recap',          '#B18CFF', 'section'),
  ('trading plan',           '#B18CFF', 'section'),
  ('setup review',           '#B18CFF', 'section'),
  ('journal review',         '#B18CFF', 'section'),
  ('performance review',     '#B18CFF', 'section'),
  ('sentiment',              '#B18CFF', 'section'),
  -- Signal Cyan
  ('breakout',               '#56B8D6', 'signal'),
  ('breakdown',              '#56B8D6', 'signal'),
  ('confirmation',           '#56B8D6', 'signal'),
  ('momentum',               '#56B8D6', 'signal'),
  ('volume',                 '#56B8D6', 'signal'),
  ('breakout watch',         '#56B8D6', 'signal'),
  ('breakout play',          '#56B8D6', 'signal'),
  ('price action',           '#56B8D6', 'signal'),
  ('trend',                  '#56B8D6', 'signal'),
  ('break of structure',     '#56B8D6', 'signal'),
  ('bos',                    '#56B8D6', 'signal'),
  ('change of character',    '#56B8D6', 'signal'),
  ('choch',                  '#56B8D6', 'signal'),
  ('market shift',           '#56B8D6', 'signal'),
  ('mss',                    '#56B8D6', 'signal'),
  ('fair value gap',         '#56B8D6', 'signal'),
  ('fvg',                    '#56B8D6', 'signal'),
  ('imbalance',              '#56B8D6', 'signal'),
  ('order block',            '#56B8D6', 'signal'),
  ('ob',                     '#56B8D6', 'signal'),
  ('confluence',             '#56B8D6', 'signal'),
  ('divergence',             '#56B8D6', 'signal'),
  ('reversal',               '#56B8D6', 'signal'),
  ('swing failure',          '#56B8D6', 'signal'),
  ('sfp',                    '#56B8D6', 'signal'),
  ('liquidity sweep',        '#56B8D6', 'signal'),
  ('sweep',                  '#56B8D6', 'signal'),
  ('stop hunt',              '#56B8D6', 'signal'),
  ('manipulation',           '#56B8D6', 'signal'),
  -- Risk Orange
  ('risk management',        '#E88B5A', 'risk'),
  ('volatility',             '#E88B5A', 'risk'),
  ('exposure',               '#E88B5A', 'risk'),
  ('invalidation',           '#E88B5A', 'risk'),
  ('risk',                   '#E88B5A', 'risk'),
  ('drawdown',               '#E88B5A', 'risk'),
  ('overexposure',           '#E88B5A', 'risk'),
  -- Indicators (purple — matches section/tools)
  ('fibonacci',              '#B18CFF', 'indicator'),
  ('fib',                    '#B18CFF', 'indicator'),
  ('ema',                    '#B18CFF', 'indicator'),
  ('sma',                    '#B18CFF', 'indicator'),
  ('vwap',                   '#B18CFF', 'indicator'),
  ('rsi',                    '#B18CFF', 'indicator'),
  ('macd',                   '#B18CFF', 'indicator'),
  ('atr',                    '#B18CFF', 'indicator'),
  ('bollinger',              '#B18CFF', 'indicator'),
  -- Sessions (signal cyan)
  ('london open',            '#56B8D6', 'session'),
  ('new york open',          '#56B8D6', 'session'),
  ('asian session',          '#56B8D6', 'session'),
  ('london session',         '#56B8D6', 'session'),
  ('new york session',       '#56B8D6', 'session'),
  ('killzone',               '#56B8D6', 'session')
ON CONFLICT (term) DO UPDATE SET hex = EXCLUDED.hex, category = EXCLUDED.category;
