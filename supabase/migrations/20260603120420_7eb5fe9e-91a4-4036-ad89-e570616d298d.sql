-- Per-user scoping for sources, saved, irrelevant marks.
-- Existing rows in `sources` remain global (user_id NULL = visible to everyone).

ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE INDEX IF NOT EXISTS sources_user_id_idx ON public.sources(user_id);

-- Per-user irrelevant marks
CREATE TABLE IF NOT EXISTS public.user_article_irrelevant (
  user_id uuid NOT NULL,
  article_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, article_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_article_irrelevant TO authenticated;
GRANT ALL ON public.user_article_irrelevant TO service_role;
ALTER TABLE public.user_article_irrelevant ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own irrelevant select" ON public.user_article_irrelevant
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own irrelevant insert" ON public.user_article_irrelevant
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own irrelevant delete" ON public.user_article_irrelevant
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Per-user saved marks
CREATE TABLE IF NOT EXISTS public.user_article_saved (
  user_id uuid NOT NULL,
  article_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, article_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_article_saved TO authenticated;
GRANT ALL ON public.user_article_saved TO service_role;
ALTER TABLE public.user_article_saved ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own saved select" ON public.user_article_saved
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own saved insert" ON public.user_article_saved
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own saved delete" ON public.user_article_saved
  FOR DELETE TO authenticated USING (auth.uid() = user_id);