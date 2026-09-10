BEGIN;

-- Add nullable subcategory_id column to products to persist product -> subcategory relationship
ALTER TABLE IF EXISTS public.products
  ADD COLUMN IF NOT EXISTS subcategory_id TEXT;

-- Add an index for faster lookups
CREATE INDEX IF NOT EXISTS idx_products_subcategory_id ON public.products(subcategory_id);

-- Add FK constraint referencing public.subcategories(id) if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subcategories') THEN
    BEGIN
      ALTER TABLE public.products
        ADD CONSTRAINT fk_products_subcategory
        FOREIGN KEY (subcategory_id)
        REFERENCES public.subcategories(id)
        ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN -- constraint already exists
      NULL;
    END;
  END IF;
END$$;

COMMIT;
