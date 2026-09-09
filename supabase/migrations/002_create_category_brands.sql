-- Migration: create category_brands junction table
-- Run this in the Supabase SQL editor or via psql

CREATE TABLE IF NOT EXISTS public.category_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_category_brand UNIQUE (category_id, brand_id)
);

-- Index for speedy joins
CREATE INDEX IF NOT EXISTS idx_category_brands_category_id ON public.category_brands(category_id);
CREATE INDEX IF NOT EXISTS idx_category_brands_brand_id ON public.category_brands(brand_id);

-- Enable RLS
ALTER TABLE public.category_brands ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access on category_brands"
  ON public.category_brands
  FOR SELECT
  TO public
  USING (true);

-- Allow authenticated admin insert
CREATE POLICY "Allow admin insert on category_brands"
  ON public.category_brands
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.role = 'admin' OR profiles.is_admin = true)
    )
  );

-- Allow authenticated admin delete
CREATE POLICY "Allow admin delete on category_brands"
  ON public.category_brands
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.role = 'admin' OR profiles.is_admin = true)
    )
  );
