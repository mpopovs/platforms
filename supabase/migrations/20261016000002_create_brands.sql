-- M0: brands. One codebase and one database serve claypixels.eu and
-- magicforms.eu; rows that belong to a brand carry brand_id.
--
-- The app resolves host name -> brand in code (lib/brand.ts) so middleware
-- needs no query; this table holds per-brand settings and feature flags
-- that staff can change without a deploy. Keep `hosts` in step with
-- BRAND_HOSTS in lib/brand.ts.

CREATE TABLE IF NOT EXISTS public.brands (
  id TEXT PRIMARY KEY,                 -- 'claypixels', 'magicforms'
  name TEXT NOT NULL,
  hosts TEXT[] NOT NULL DEFAULT '{}',
  default_locale TEXT NOT NULL DEFAULT 'en',
  locales TEXT[] NOT NULL DEFAULT '{en}',
  flags JSONB NOT NULL DEFAULT '{}'::jsonb, -- e.g. {"shop": false, "guest_displays": false}
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_brands_updated_at ON public.brands;
CREATE TRIGGER update_brands_updated_at
  BEFORE UPDATE ON public.brands
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Brand settings are public (they drive what the site shows); writes only
-- through the service role or the SQL editor.
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brands_select_all" ON public.brands;
CREATE POLICY "brands_select_all" ON public.brands
  FOR SELECT TO anon, authenticated
  USING (true);

INSERT INTO public.brands (id, name, hosts, default_locale, locales, flags) VALUES
  ('claypixels', 'Claypixels', '{claypixels.eu,www.claypixels.eu}', 'lv', '{lv,en}', '{}'::jsonb),
  ('magicforms', 'Magic Forms', '{magicforms.eu,www.magicforms.eu}', 'en', '{en}',
   '{"shop": false, "guest_displays": false}'::jsonb)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_brand_id_fkey,
  ADD CONSTRAINT profiles_brand_id_fkey
    FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL;
