BEGIN;

ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Products are viewable by everyone"
ON public.products
FOR SELECT
USING (true);

CREATE POLICY IF NOT EXISTS "Admins can insert products"
ON public.products
FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY IF NOT EXISTS "Admins can update products"
ON public.products
FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY IF NOT EXISTS "Admins can delete products"
ON public.products
FOR DELETE
USING (public.is_admin());

COMMIT;
