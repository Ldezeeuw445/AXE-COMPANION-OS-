-- AXE Knowledge Layer: curated docs, chunks, strategy cards, user rules, structured memory.
-- Global rows use user_id IS NULL. RLS: authenticated read global + own; writes own rows only.

-- -------------------------------------------------------------------
-- 1) Knowledge documents
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.axe_knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  slug text NOT NULL,
  title text NOT NULL,
  category text NOT NULL,
  content text NOT NULL DEFAULT '',
  source_type text NOT NULL DEFAULT 'markdown',
  tags text[] NOT NULL DEFAULT '{}'::text[],
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT axe_knowledge_documents_slug_uid UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS axe_knowledge_documents_user_idx
  ON public.axe_knowledge_documents (user_id, category, updated_at DESC);
CREATE INDEX IF NOT EXISTS axe_knowledge_documents_category_idx
  ON public.axe_knowledge_documents (category) WHERE active;

ALTER TABLE public.axe_knowledge_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "axe_knowledge_documents_select" ON public.axe_knowledge_documents;
CREATE POLICY "axe_knowledge_documents_select" ON public.axe_knowledge_documents
  FOR SELECT TO authenticated
  USING (active AND (user_id IS NULL OR user_id = auth.uid()));

DROP POLICY IF EXISTS "axe_knowledge_documents_insert_own" ON public.axe_knowledge_documents;
CREATE POLICY "axe_knowledge_documents_insert_own" ON public.axe_knowledge_documents
  FOR INSERT TO authenticated
  WITH CHECK (user_id IS NOT NULL AND user_id = auth.uid());

DROP POLICY IF EXISTS "axe_knowledge_documents_update_own" ON public.axe_knowledge_documents;
CREATE POLICY "axe_knowledge_documents_update_own" ON public.axe_knowledge_documents
  FOR UPDATE TO authenticated
  USING (user_id IS NOT NULL AND user_id = auth.uid())
  WITH CHECK (user_id IS NOT NULL AND user_id = auth.uid());

DROP POLICY IF EXISTS "axe_knowledge_documents_delete_own" ON public.axe_knowledge_documents;
CREATE POLICY "axe_knowledge_documents_delete_own" ON public.axe_knowledge_documents
  FOR DELETE TO authenticated
  USING (user_id IS NOT NULL AND user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.axe_knowledge_documents TO authenticated;

-- -------------------------------------------------------------------
-- 2) Knowledge chunks (retrieval unit; embeddings later)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.axe_knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.axe_knowledge_documents (id) ON DELETE CASCADE,
  chunk_index int NOT NULL DEFAULT 0,
  chunk_text text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS axe_knowledge_chunks_doc_idx
  ON public.axe_knowledge_chunks (document_id, chunk_index);
CREATE INDEX IF NOT EXISTS axe_knowledge_chunks_tags_gin
  ON public.axe_knowledge_chunks USING GIN (tags);

ALTER TABLE public.axe_knowledge_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "axe_knowledge_chunks_select" ON public.axe_knowledge_chunks;
CREATE POLICY "axe_knowledge_chunks_select" ON public.axe_knowledge_chunks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.axe_knowledge_documents d
      WHERE d.id = document_id
        AND d.active
        AND (d.user_id IS NULL OR d.user_id = auth.uid())
    )
  );

-- Chunks for user-owned docs only (global doc chunks seeded via service role)
DROP POLICY IF EXISTS "axe_knowledge_chunks_insert_own" ON public.axe_knowledge_chunks;
CREATE POLICY "axe_knowledge_chunks_insert_own" ON public.axe_knowledge_chunks
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.axe_knowledge_documents d
      WHERE d.id = document_id AND d.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "axe_knowledge_chunks_update_own" ON public.axe_knowledge_chunks;
CREATE POLICY "axe_knowledge_chunks_update_own" ON public.axe_knowledge_chunks
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.axe_knowledge_documents d
      WHERE d.id = document_id AND d.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.axe_knowledge_documents d
      WHERE d.id = document_id AND d.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "axe_knowledge_chunks_delete_own" ON public.axe_knowledge_chunks;
CREATE POLICY "axe_knowledge_chunks_delete_own" ON public.axe_knowledge_chunks
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.axe_knowledge_documents d
      WHERE d.id = document_id AND d.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.axe_knowledge_chunks TO authenticated;

-- -------------------------------------------------------------------
-- 3) Strategy playbooks (global template or per-user)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.axe_strategy_playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  symbol text,
  timeframe text,
  rules text NOT NULL DEFAULT '',
  invalidation text NOT NULL DEFAULT '',
  checklist text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS axe_strategy_playbooks_user_idx
  ON public.axe_strategy_playbooks (user_id, active, updated_at DESC);

ALTER TABLE public.axe_strategy_playbooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "axe_strategy_playbooks_select" ON public.axe_strategy_playbooks;
CREATE POLICY "axe_strategy_playbooks_select" ON public.axe_strategy_playbooks
  FOR SELECT TO authenticated
  USING (active AND (user_id IS NULL OR user_id = auth.uid()));

DROP POLICY IF EXISTS "axe_strategy_playbooks_insert_own" ON public.axe_strategy_playbooks;
CREATE POLICY "axe_strategy_playbooks_insert_own" ON public.axe_strategy_playbooks
  FOR INSERT TO authenticated
  WITH CHECK (user_id IS NOT NULL AND user_id = auth.uid());

DROP POLICY IF EXISTS "axe_strategy_playbooks_update_own" ON public.axe_strategy_playbooks;
CREATE POLICY "axe_strategy_playbooks_update_own" ON public.axe_strategy_playbooks
  FOR UPDATE TO authenticated
  USING (user_id IS NOT NULL AND user_id = auth.uid())
  WITH CHECK (user_id IS NOT NULL AND user_id = auth.uid());

DROP POLICY IF EXISTS "axe_strategy_playbooks_delete_own" ON public.axe_strategy_playbooks;
CREATE POLICY "axe_strategy_playbooks_delete_own" ON public.axe_strategy_playbooks
  FOR DELETE TO authenticated
  USING (user_id IS NOT NULL AND user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.axe_strategy_playbooks TO authenticated;

-- -------------------------------------------------------------------
-- 4) User rules (risk, behaviour, funded)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.axe_user_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  rule_type text NOT NULL,
  rule_text text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS axe_user_rules_user_active_idx
  ON public.axe_user_rules (user_id, active, updated_at DESC);

ALTER TABLE public.axe_user_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "axe_user_rules_select_own" ON public.axe_user_rules;
CREATE POLICY "axe_user_rules_select_own" ON public.axe_user_rules
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "axe_user_rules_insert_own" ON public.axe_user_rules;
CREATE POLICY "axe_user_rules_insert_own" ON public.axe_user_rules
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "axe_user_rules_update_own" ON public.axe_user_rules;
CREATE POLICY "axe_user_rules_update_own" ON public.axe_user_rules
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "axe_user_rules_delete_own" ON public.axe_user_rules;
CREATE POLICY "axe_user_rules_delete_own" ON public.axe_user_rules
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.axe_user_rules TO authenticated;

-- -------------------------------------------------------------------
-- 5) Structured AXE memory (patterns, post-mortems) — separate from assistant_memory_entries
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.axe_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  memory_type text NOT NULL,
  content text NOT NULL,
  symbol text,
  confidence numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS axe_memory_user_created_idx
  ON public.axe_memory (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS axe_memory_user_symbol_idx
  ON public.axe_memory (user_id, symbol);

ALTER TABLE public.axe_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "axe_memory_select_own" ON public.axe_memory;
CREATE POLICY "axe_memory_select_own" ON public.axe_memory
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "axe_memory_insert_own" ON public.axe_memory;
CREATE POLICY "axe_memory_insert_own" ON public.axe_memory
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "axe_memory_update_own" ON public.axe_memory;
CREATE POLICY "axe_memory_update_own" ON public.axe_memory
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "axe_memory_delete_own" ON public.axe_memory;
CREATE POLICY "axe_memory_delete_own" ON public.axe_memory
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.axe_memory TO authenticated;
