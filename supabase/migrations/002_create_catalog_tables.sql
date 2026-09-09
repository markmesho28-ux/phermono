BEGIN;

-- ============================================================
-- Catalog tables for PherMono
-- Creates:
--   1) categories
--   2) subcategories
--   3) brands
-- with basic admin-friendly RLS for dashboard reads/writes
-- ============================================================

-- Optional helper: check whether the current authenticated user is an admin
-- Assumes you already have a public.profiles table with a role column.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  );
$$;

-- Categories
CREATE TABLE IF NOT EXISTS public.categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  image TEXT,
  icon TEXT,
  color TEXT,
  accent TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Subcategories linked to categories
CREATE TABLE IF NOT EXISTS public.subcategories (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  image TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (category_id, slug)
);

-- Brands (category-scoped when needed)
CREATE TABLE IF NOT EXISTS public.brands (
  id TEXT PRIMARY KEY,
  category_id TEXT REFERENCES public.categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  logo TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (category_id, slug)
);

-- Helpful indexes for admin dashboard and filters
CREATE INDEX IF NOT EXISTS idx_categories_slug
  ON public.categories(slug);

CREATE INDEX IF NOT EXISTS idx_categories_active_sort
  ON public.categories(is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_subcategories_category_id
  ON public.subcategories(category_id);

CREATE INDEX IF NOT EXISTS idx_subcategories_slug
  ON public.subcategories(slug);

CREATE INDEX IF NOT EXISTS idx_brands_category_id
  ON public.brands(category_id);

CREATE INDEX IF NOT EXISTS idx_brands_slug
  ON public.brands(slug);

-- Timestamp update trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS categories_set_updated_at ON public.categories;
CREATE TRIGGER categories_set_updated_at
BEFORE UPDATE ON public.categories
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS subcategories_set_updated_at ON public.subcategories;
CREATE TRIGGER subcategories_set_updated_at
BEFORE UPDATE ON public.subcategories
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS brands_set_updated_at ON public.brands;
CREATE TRIGGER brands_set_updated_at
BEFORE UPDATE ON public.brands
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

-- Public read access for catalog pages
CREATE POLICY IF NOT EXISTS "Categories are viewable by everyone"
ON public.categories
FOR SELECT
USING (true);

CREATE POLICY IF NOT EXISTS "Subcategories are viewable by everyone"
ON public.subcategories
FOR SELECT
USING (true);

CREATE POLICY IF NOT EXISTS "Brands are viewable by everyone"
ON public.brands
FOR SELECT
USING (true);

-- Admin write access: allows dashboard CRUD for admin users
CREATE POLICY IF NOT EXISTS "Admins can insert categories"
ON public.categories
FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY IF NOT EXISTS "Admins can update categories"
ON public.categories
FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY IF NOT EXISTS "Admins can delete categories"
ON public.categories
FOR DELETE
USING (public.is_admin());

CREATE POLICY IF NOT EXISTS "Admins can insert subcategories"
ON public.subcategories
FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY IF NOT EXISTS "Admins can update subcategories"
ON public.subcategories
FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY IF NOT EXISTS "Admins can delete subcategories"
ON public.subcategories
FOR DELETE
USING (public.is_admin());

CREATE POLICY IF NOT EXISTS "Admins can insert brands"
ON public.brands
FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY IF NOT EXISTS "Admins can update brands"
ON public.brands
FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY IF NOT EXISTS "Admins can delete brands"
ON public.brands
FOR DELETE
USING (public.is_admin());

COMMIT;

-- ============================================================
-- Example inserts
-- ============================================================
-- INSERT INTO public.categories (id, name, slug, image, icon, color, accent, description)
-- VALUES ('skincare', 'Skincare', 'skincare', 'https://...', 'Sparkles', '#F4E7D3', '#C79A51', 'Beauty and treatment essentials');
--
-- INSERT INTO public.subcategories (id, category_id, name, slug, image)
-- VALUES ('cleansers', 'skincare', 'Cleansers', 'cleansers', 'https://...');
--
-- INSERT INTO public.brands (id, category_id, name, slug, logo)
-- VALUES ('cerave', 'skincare', 'CeraVe', 'cerave', 'https://...');
