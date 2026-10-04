-- Migration 019: add targeted indexes for the home page and featured-product queries
-- These support the high-traffic paths that sort by created_at and filter by hero/is_hidden.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_products_created_at_desc
  ON public.products (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_hero_created_at
  ON public.products (hero, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_hidden_created_at
  ON public.products (is_hidden, created_at DESC);

COMMIT;
