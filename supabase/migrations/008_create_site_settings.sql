BEGIN;

CREATE TABLE IF NOT EXISTS public.site_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_site_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_site_settings_set_updated_at ON public.site_settings;
CREATE TRIGGER trg_site_settings_set_updated_at
BEFORE UPDATE ON public.site_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_site_settings_updated_at();

CREATE POLICY IF NOT EXISTS "Site settings are readable by everyone"
ON public.site_settings
FOR SELECT
USING (true);

CREATE POLICY IF NOT EXISTS "Admins can insert site settings"
ON public.site_settings
FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY IF NOT EXISTS "Admins can update site settings"
ON public.site_settings
FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY IF NOT EXISTS "Admins can delete site settings"
ON public.site_settings
FOR DELETE
USING (public.is_admin());

INSERT INTO public.site_settings (key, value)
VALUES (
  'site_config',
  jsonb_build_object(
    'free_shipping_threshold', 200,
    'active_promo', 'none',
    'is_free_shipping_active', false,
    'promo_banner_text', '',
    'promo_discount_percent', 0,
    'promo_rule', 'none',
    'buy_x', 0,
    'get_y', 0,
    'promotion_scope', 'all',
    'promo_start_at', NULL,
    'promo_end_at', NULL
  )
)
ON CONFLICT (key) DO NOTHING;

COMMIT;
