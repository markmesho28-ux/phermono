-- Migration: ensure ON DELETE CASCADE for brands referencing categories
BEGIN;

ALTER TABLE public.brands
  DROP CONSTRAINT IF EXISTS brands_category_id_fkey;

ALTER TABLE public.brands
  ADD CONSTRAINT brands_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;

COMMIT;
