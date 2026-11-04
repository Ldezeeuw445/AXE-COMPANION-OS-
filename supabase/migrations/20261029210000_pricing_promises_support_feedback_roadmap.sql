-- Pricing-page promises: support tickets, product feedback, roadmap voting.
-- Idempotent. Service-role admin reads; authenticated users write own rows.

-- ── Support tickets (priority for Founder/Elite) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.axe_support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 200),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 8000),
  plan text NOT NULL DEFAULT 'free',
  founder_badge boolean NOT NULL DEFAULT false,
  priority boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'closed')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS axe_support_tickets_admin_idx
  ON public.axe_support_tickets (priority DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS axe_support_tickets_user_idx
  ON public.axe_support_tickets (user_id, created_at DESC);

ALTER TABLE public.axe_support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_tickets_select_own" ON public.axe_support_tickets;
CREATE POLICY "support_tickets_select_own" ON public.axe_support_tickets
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "support_tickets_insert_own" ON public.axe_support_tickets;
CREATE POLICY "support_tickets_insert_own" ON public.axe_support_tickets
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON TABLE public.axe_support_tickets FROM public;
REVOKE ALL ON TABLE public.axe_support_tickets FROM anon;
GRANT SELECT, INSERT ON TABLE public.axe_support_tickets TO authenticated;
GRANT ALL ON TABLE public.axe_support_tickets TO service_role;

COMMENT ON TABLE public.axe_support_tickets IS
  'In-app support. priority=true for Founder/Elite; admin sorts priority first via service role.';

-- ── Product feedback (Founder-tagged channel) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.axe_product_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 8000),
  screenshot_path text,
  plan text NOT NULL DEFAULT 'free',
  founder_tagged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS axe_product_feedback_admin_idx
  ON public.axe_product_feedback (founder_tagged DESC, created_at DESC);

ALTER TABLE public.axe_product_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_feedback_select_own" ON public.axe_product_feedback;
CREATE POLICY "product_feedback_select_own" ON public.axe_product_feedback
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "product_feedback_insert_own" ON public.axe_product_feedback;
CREATE POLICY "product_feedback_insert_own" ON public.axe_product_feedback
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON TABLE public.axe_product_feedback FROM public;
REVOKE ALL ON TABLE public.axe_product_feedback FROM anon;
GRANT SELECT, INSERT ON TABLE public.axe_product_feedback TO authenticated;
GRANT ALL ON TABLE public.axe_product_feedback TO service_role;

COMMENT ON TABLE public.axe_product_feedback IS
  'Direct product feedback. founder_tagged when submitter has Founder badge or plan.';

-- Private screenshots for feedback (optional).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-feedback',
  'product-feedback',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "product_feedback_storage_insert_own" ON storage.objects;
CREATE POLICY "product_feedback_storage_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-feedback'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "product_feedback_storage_select_own" ON storage.objects;
CREATE POLICY "product_feedback_storage_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'product-feedback'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- ── Roadmap items + one vote per user per item ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.axe_roadmap_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'in_progress', 'shipped', 'dropped')),
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.axe_roadmap_votes (
  item_id uuid NOT NULL REFERENCES public.axe_roadmap_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (item_id, user_id)
);

CREATE INDEX IF NOT EXISTS axe_roadmap_votes_user_idx
  ON public.axe_roadmap_votes (user_id);

ALTER TABLE public.axe_roadmap_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.axe_roadmap_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roadmap_items_select_authenticated" ON public.axe_roadmap_items;
CREATE POLICY "roadmap_items_select_authenticated" ON public.axe_roadmap_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "roadmap_votes_select_own" ON public.axe_roadmap_votes;
DROP POLICY IF EXISTS "roadmap_votes_select_authenticated" ON public.axe_roadmap_votes;
CREATE POLICY "roadmap_votes_select_authenticated" ON public.axe_roadmap_votes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "roadmap_votes_insert_own" ON public.axe_roadmap_votes;
CREATE POLICY "roadmap_votes_insert_own" ON public.axe_roadmap_votes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "roadmap_votes_delete_own" ON public.axe_roadmap_votes;
CREATE POLICY "roadmap_votes_delete_own" ON public.axe_roadmap_votes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.axe_roadmap_items FROM public;
REVOKE ALL ON TABLE public.axe_roadmap_items FROM anon;
GRANT SELECT ON TABLE public.axe_roadmap_items TO authenticated;
GRANT ALL ON TABLE public.axe_roadmap_items TO service_role;

REVOKE ALL ON TABLE public.axe_roadmap_votes FROM public;
REVOKE ALL ON TABLE public.axe_roadmap_votes FROM anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.axe_roadmap_votes TO authenticated;
GRANT ALL ON TABLE public.axe_roadmap_votes TO service_role;

-- Seed from pricing-page roadmap promises + landing Coming soon / Roadmap copy.
INSERT INTO public.axe_roadmap_items (slug, title, description, status, sort_order)
VALUES
  ('advanced-ai-models', 'Advanced AI models', 'Higher-capability models when available (Elite roadmap).', 'planned', 10),
  ('premium-voice', 'Premium voice features', 'Richer voice input/output for journaling and chat (Elite roadmap).', 'planned', 20),
  ('increased-ai-limits', 'Increased AI limits', 'Higher fair-use ceilings when models and cost allow (Elite roadmap).', 'planned', 30),
  ('trading-os-desk', 'Trading OS desk bridge', 'Deeper Companion ↔ Trading OS desk workflows on the same account.', 'planned', 40),
  ('push-alerts-maturity', 'Push alerts maturity', 'Push alerts are in beta — harden delivery, prefs, and deep links.', 'in_progress', 50)
ON CONFLICT (slug) DO NOTHING;

COMMENT ON TABLE public.axe_roadmap_items IS
  'Public roadmap for in-app voting. Seeded from pricing/landing roadmap promises.';
COMMENT ON TABLE public.axe_roadmap_votes IS
  'One vote per user per roadmap item. Eligibility enforced in API (Founder).';
