
-- Backfill Medium @handle URLs: medium.com/@handle/slug
UPDATE public.articles
SET
  author = COALESCE(author, substring(external_url FROM 'medium\.com/(@[^/?#]+)')),
  author_url = COALESCE(author_url, 'https://medium.com/' || substring(external_url FROM 'medium\.com/(@[^/?#]+)'))
WHERE author IS NULL
  AND external_url ~ 'medium\.com/@[^/?#]+';

-- Backfill Medium subdomain URLs: <handle>.medium.com/slug
UPDATE public.articles
SET
  author = COALESCE(author, '@' || substring(external_url FROM 'https?://([^./]+)\.medium\.com')),
  author_url = COALESCE(author_url, 'https://' || substring(external_url FROM 'https?://([^./]+)\.medium\.com') || '.medium.com')
WHERE author IS NULL
  AND external_url ~ 'https?://[^./]+\.medium\.com/';

-- Backfill Substack URLs: <pub>.substack.com/...
UPDATE public.articles
SET
  author = COALESCE(author, substring(external_url FROM 'https?://([^./]+)\.substack\.com')),
  author_url = COALESCE(author_url, 'https://' || substring(external_url FROM 'https?://([^./]+)\.substack\.com') || '.substack.com')
WHERE author IS NULL
  AND external_url ~ 'https?://[^./]+\.substack\.com';
