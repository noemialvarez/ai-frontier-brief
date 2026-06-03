DELETE FROM public.articles WHERE source_id IN (
  SELECT id FROM public.sources WHERE user_id IS NULL AND name IN (
    'AI House Davos', 'Ben''s Bites', 'Merantix Capital News', 'The Rundown AI'
  )
);
DELETE FROM public.sources WHERE user_id IS NULL AND name IN (
  'AI House Davos', 'Ben''s Bites', 'Merantix Capital News', 'The Rundown AI'
);