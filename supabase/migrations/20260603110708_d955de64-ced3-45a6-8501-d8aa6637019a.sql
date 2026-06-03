
CREATE TABLE public.sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  feed_url TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'rss' CHECK (kind IN ('rss','youtube')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sources TO anon, authenticated;
GRANT ALL ON public.sources TO service_role;

ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read sources" ON public.sources FOR SELECT USING (true);
CREATE POLICY "public insert sources" ON public.sources FOR INSERT WITH CHECK (true);
CREATE POLICY "public update sources" ON public.sources FOR UPDATE USING (true);
CREATE POLICY "public delete sources" ON public.sources FOR DELETE USING (true);

CREATE TABLE public.articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  external_url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  themes TEXT[] NOT NULL DEFAULT '{}',
  published_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  saved BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX articles_published_at_idx ON public.articles (published_at DESC NULLS LAST);
CREATE INDEX articles_source_id_idx ON public.articles (source_id);
CREATE INDEX articles_saved_idx ON public.articles (saved) WHERE saved = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.articles TO anon, authenticated;
GRANT ALL ON public.articles TO service_role;

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read articles" ON public.articles FOR SELECT USING (true);
CREATE POLICY "public insert articles" ON public.articles FOR INSERT WITH CHECK (true);
CREATE POLICY "public update articles" ON public.articles FOR UPDATE USING (true);
CREATE POLICY "public delete articles" ON public.articles FOR DELETE USING (true);
