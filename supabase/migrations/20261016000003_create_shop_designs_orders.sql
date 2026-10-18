-- S (shirt slice): designs made from drawings, and shirt orders.
--
-- Both tables are written and read only by server code with the service
-- role. RLS is on with no policies, so the public anon key can read nothing.
-- M3 adds owner policies when orders appear in /my.

CREATE TABLE IF NOT EXISTS public.designs (
  id TEXT PRIMARY KEY,                       -- design_xxx
  texture_id TEXT REFERENCES model_textures(id) ON DELETE SET NULL,
  model_id TEXT,
  brand_id TEXT REFERENCES public.brands(id),
  source_url TEXT NOT NULL,                  -- drawing the design was made from
  print_file_path TEXT NOT NULL,             -- path in the print-files bucket
  print_width INT NOT NULL,
  print_height INT NOT NULL,
  coverage REAL,
  effective_dpi INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One design per drawing (re-opening the shirt page reuses it)
CREATE UNIQUE INDEX IF NOT EXISTS idx_designs_texture ON public.designs(texture_id)
  WHERE texture_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.orders (
  id TEXT PRIMARY KEY,                       -- ord_xxx, also Printful external_id
  design_id TEXT NOT NULL REFERENCES public.designs(id),
  brand_id TEXT REFERENCES public.brands(id),
  status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment', 'paid', 'printful_draft', 'confirmed',
                      'shipped', 'failed', 'cancelled', 'expired')),
  size TEXT NOT NULL,
  catalog_variant_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 10),
  currency TEXT NOT NULL DEFAULT 'eur',
  price_cents INT NOT NULL,
  shipping_cents INT NOT NULL,
  shipping_zone TEXT NOT NULL,
  country_code TEXT NOT NULL,
  email TEXT,
  recipient JSONB,
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent TEXT,
  amount_total_cents INT,
  printful_order_id BIGINT,
  printful_status TEXT,
  last_error TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_design ON public.orders(design_id);

DROP TRIGGER IF EXISTS update_designs_updated_at ON public.designs;
CREATE TRIGGER update_designs_updated_at BEFORE UPDATE ON public.designs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_orders_updated_at ON public.orders;
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Private bucket for print files. Printful fetches them through signed URLs.
INSERT INTO storage.buckets (id, name, public)
VALUES ('print-files', 'print-files', false)
ON CONFLICT (id) DO NOTHING;
