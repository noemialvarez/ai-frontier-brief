
-- Remove permissive public write policies. All app access happens via server functions
-- using the service_role key, which bypasses RLS. We keep public read access since the
-- feed UI is public, but remove anonymous insert/update/delete.

DROP POLICY IF EXISTS "public insert articles" ON public.articles;
DROP POLICY IF EXISTS "public update articles" ON public.articles;
DROP POLICY IF EXISTS "public delete articles" ON public.articles;

DROP POLICY IF EXISTS "public insert sources" ON public.sources;
DROP POLICY IF EXISTS "public update sources" ON public.sources;
DROP POLICY IF EXISTS "public delete sources" ON public.sources;

-- Revoke any write grants from anon/authenticated so PostgREST refuses writes
-- even if a future policy is added by mistake.
REVOKE INSERT, UPDATE, DELETE ON public.articles FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sources  FROM anon, authenticated;

-- Ensure service_role retains full access (used by supabaseAdmin in server functions).
GRANT ALL ON public.articles TO service_role;
GRANT ALL ON public.sources  TO service_role;
