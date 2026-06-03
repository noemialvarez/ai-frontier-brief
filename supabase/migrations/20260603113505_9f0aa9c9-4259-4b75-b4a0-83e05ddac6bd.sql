-- Add a flag so users can mark articles as irrelevant; we keep the row to learn from it.
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS irrelevant boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_articles_irrelevant ON public.articles (irrelevant);

-- Clean up previously stored articles that should have been excluded by the keyword filter.
DELETE FROM public.articles
WHERE title ~* '\m(morality|morals?|ethics?|ethical|killer drone|autonomous weapon|lethal autonomous|weaponi[sz]|doomer|doomsday|existential risk)\M'
   OR (title ~* '\mAI\M' AND title ~* '\mfear(s|ed|ing)?\M')
   OR title ~* '\mcomplain(t|ts|ing)\M';