BEGIN;

CREATE TABLE IF NOT EXISTS public.promotional_banners (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    campaign_label varchar(30) NOT NULL DEFAULT 'WINTER SALE',
    headline varchar(80) NOT NULL DEFAULT 'Up to 60% off curated essentials',
    badge_text varchar(25) NOT NULL DEFAULT 'LIMITED TIME',

    cta_enabled boolean NOT NULL DEFAULT false,
    cta_text varchar(40),
    cta_url text,

    is_active boolean NOT NULL DEFAULT true,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.promotional_banner_products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    banner_id uuid NOT NULL
        REFERENCES public.promotional_banners(id)
        ON DELETE CASCADE,

    image_path text NOT NULL DEFAULT '',
    alt_text varchar(150),

    position smallint NOT NULL DEFAULT 1,
    is_enabled boolean NOT NULL DEFAULT true,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    constraint unique_banner_product_position
        unique (banner_id, position)
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
begin
    new.updated_at = now();
    return new;
end;
$$;

DROP TRIGGER IF EXISTS promotional_banners_updated_at ON public.promotional_banners;
CREATE TRIGGER promotional_banners_updated_at
BEFORE UPDATE ON public.promotional_banners
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS promotional_banner_products_updated_at ON public.promotional_banner_products;
CREATE TRIGGER promotional_banner_products_updated_at
BEFORE UPDATE ON public.promotional_banner_products
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        lower(COALESCE(p.role, '')) = 'admin'
        OR COALESCE(p.is_admin, false) = true
        OR lower(COALESCE(p.name, '')) = 'wassef'
        OR lower(COALESCE(p.full_name, '')) = 'wassef'
      )
  );
$$;

ALTER TABLE public.promotional_banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotional_banner_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Promotional banners are viewable by everyone"
ON public.promotional_banners
FOR SELECT
USING (true);

CREATE POLICY IF NOT EXISTS "Promotional banner products are viewable by everyone"
ON public.promotional_banner_products
FOR SELECT
USING (true);

CREATE POLICY IF NOT EXISTS "Admins can insert promotional banners"
ON public.promotional_banners
FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY IF NOT EXISTS "Admins can update promotional banners"
ON public.promotional_banners
FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY IF NOT EXISTS "Admins can delete promotional banners"
ON public.promotional_banners
FOR DELETE
USING (public.is_admin());

CREATE POLICY IF NOT EXISTS "Admins can insert promotional banner products"
ON public.promotional_banner_products
FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY IF NOT EXISTS "Admins can update promotional banner products"
ON public.promotional_banner_products
FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY IF NOT EXISTS "Admins can delete promotional banner products"
ON public.promotional_banner_products
FOR DELETE
USING (public.is_admin());

CREATE POLICY IF NOT EXISTS "Public can view promotional banner images"
ON storage.objects
FOR SELECT
USING (bucket_id IN ('products', 'promo-banners', 'promotional-banners'));

CREATE POLICY IF NOT EXISTS "Admins can upload promotional banner images"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id IN ('products', 'promo-banners', 'promotional-banners')
  AND public.is_admin()
);

CREATE POLICY IF NOT EXISTS "Admins can update promotional banner images"
ON storage.objects
FOR UPDATE
USING (
  bucket_id IN ('products', 'promo-banners', 'promotional-banners')
  AND public.is_admin()
)
WITH CHECK (
  bucket_id IN ('products', 'promo-banners', 'promotional-banners')
  AND public.is_admin()
);

CREATE POLICY IF NOT EXISTS "Admins can delete promotional banner images"
ON storage.objects
FOR DELETE
USING (
  bucket_id IN ('products', 'promo-banners', 'promotional-banners')
  AND public.is_admin()
);

COMMIT;
