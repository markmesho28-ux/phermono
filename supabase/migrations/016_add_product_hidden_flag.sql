BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_products_is_hidden ON public.products(is_hidden);

COMMIT;

NOTIFY pgrst, 'reload schema';