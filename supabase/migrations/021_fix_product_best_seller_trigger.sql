-- ==============================================================================
-- Migration 021: Fix duplicate product sync triggers and preserve explicit bool values
--
-- Problem:
--   The live Supabase database had drifted from the repo migration, leaving more than
--   one trigger pointing at public.sync_product_fields(). That made the trigger chain
--   apply stale values from the previous row and resurrect explicit false updates.
--
-- Fix:
--   1. Remove all legacy duplicate trigger names that may still exist on public.products.
--   2. Recreate exactly one trigger for public.sync_product_fields().
--   3. Preserve explicit hero/is_best_seller values instead of deriving one from the
--      other field's old value.
--   4. Keep the useful field-bridge behavior (title/name, image/images, etc.) without
--      using tag as an implicit source of truth.
-- ==============================================================================

BEGIN;

-- Remove duplicate legacy trigger names that may already exist in the live database.
DROP TRIGGER IF EXISTS products_sync_fields ON public.products;
DROP TRIGGER IF EXISTS trg_sync_product_fields ON public.products;

CREATE OR REPLACE FUNCTION public.sync_product_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Name <-> Title
  IF NEW.name IS NULL OR NEW.name = '' THEN
    NEW.name := NEW.title;
  END IF;
  IF NEW.title IS NULL OR NEW.title = '' THEN
    NEW.title := NEW.name;
  END IF;

  -- Image <-> Images array
  IF (NEW.images IS NULL OR array_length(NEW.images, 1) IS NULL OR array_length(NEW.images, 1) = 0)
      AND NEW.image IS NOT NULL AND NEW.image <> '' THEN
    NEW.images := ARRAY[NEW.image];
  END IF;
  IF (NEW.image IS NULL OR NEW.image = '') AND NEW.images IS NOT NULL AND array_length(NEW.images, 1) > 0 THEN
    NEW.image := NEW.images[1];
  END IF;
  IF NEW.image_url IS NULL OR NEW.image_url = '' THEN
    NEW.image_url := NEW.image;
  END IF;

  -- Price <-> Selling price
  IF NEW.price IS NULL AND NEW.selling_price IS NOT NULL THEN
    NEW.price := NEW.selling_price;
  END IF;
  IF NEW.selling_price IS NULL AND NEW.price IS NOT NULL THEN
    NEW.selling_price := NEW.price;
  END IF;
  IF NEW.market_price IS NULL AND NEW.original_price IS NOT NULL THEN
    NEW.market_price := NEW.original_price;
  END IF;

  -- Admin cost <-> Cost
  IF NEW.admin_cost IS NULL AND NEW.cost IS NOT NULL THEN
    NEW.admin_cost := NEW.cost;
  END IF;
  IF NEW.cost IS NULL AND NEW.admin_cost IS NOT NULL THEN
    NEW.cost := NEW.admin_cost;
  END IF;

  -- Category <-> Category ID
  IF (NEW.category IS NULL OR NEW.category = '') AND NEW.category_id IS NOT NULL THEN
    NEW.category := NEW.category_id;
  END IF;
  IF (NEW.category_id IS NULL OR NEW.category_id = '') AND NEW.category IS NOT NULL THEN
    NEW.category_id := NEW.category;
  END IF;

  -- Brand <-> Brand ID
  IF (NEW.brand IS NULL OR NEW.brand = '') AND NEW.brand_id IS NOT NULL THEN
    NEW.brand := NEW.brand_id;
  END IF;
  IF (NEW.brand_id IS NULL OR NEW.brand_id = '') AND NEW.brand IS NOT NULL THEN
    NEW.brand_id := NEW.brand;
  END IF;

  -- Subcategory <-> Subcategory ID
  IF (NEW.subcategory IS NULL OR NEW.subcategory = '') AND NEW.subcategory_id IS NOT NULL THEN
    NEW.subcategory := NEW.subcategory_id;
  END IF;
  IF (NEW.subcategory_id IS NULL OR NEW.subcategory_id = '') AND NEW.subcategory IS NOT NULL THEN
    NEW.subcategory_id := NEW.subcategory;
  END IF;

  -- Best-seller canonical state:
  -- - preserve explicit client values
  -- - do not derive one boolean from the other field's previous value
  -- - do not use tag as implicit truth
  IF NEW.hero IS NULL AND NEW.is_best_seller IS NULL THEN
    NEW.hero := FALSE;
    NEW.is_best_seller := FALSE;
  ELSIF NEW.hero IS NULL AND NEW.is_best_seller IS NOT NULL THEN
    NEW.hero := NEW.is_best_seller;
  ELSIF NEW.is_best_seller IS NULL AND NEW.hero IS NOT NULL THEN
    NEW.is_best_seller := NEW.hero;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_product_fields
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.sync_product_fields();

COMMIT;
