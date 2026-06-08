ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS summary_short text,
  ADD COLUMN IF NOT EXISTS author text,
  ADD COLUMN IF NOT EXISTS author_url text;