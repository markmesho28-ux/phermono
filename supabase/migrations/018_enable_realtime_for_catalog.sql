-- Migration 018: Enable Realtime for catalog tables
-- This ensures Supabase Realtime broadcasts postgres_changes to all connected client devices

BEGIN;

-- Ensure tables have full replica identity so updates and deletes broadcast all columns
ALTER TABLE IF EXISTS public.products REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.categories REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.subcategories REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.brands REPLICA IDENTITY FULL;

-- Add tables to the supabase_realtime publication if not already added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'products'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'categories'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.categories;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'subcategories'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.subcategories;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'brands'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.brands;
  END IF;
END $$;

COMMIT;
