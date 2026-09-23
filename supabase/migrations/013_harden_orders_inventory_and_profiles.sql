BEGIN;

-- Orders must be owned by a Supabase user when one exists. Guest checkout keeps
-- user_id NULL but is still insert-only for the anonymous role.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);

-- Never infer authorization from an editable name, phone number, or user metadata.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (lower(COALESCE(p.role, '')) IN ('admin', 'superadmin', 'administrator')
        OR COALESCE(p.is_admin, false) = true)
  );
$$;

-- A customer may edit profile details, but not authorization fields.
CREATE OR REPLACE FUNCTION public.protect_profile_authorization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = OLD.id AND NOT public.is_admin() THEN
    NEW.role := OLD.role;
    NEW.is_admin := OLD.is_admin;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_authorization ON public.profiles;
CREATE TRIGGER protect_profile_authorization
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_authorization();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by owner or admin" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile details" ON public.profiles;

CREATE POLICY "Profiles are viewable by owner or admin"
ON public.profiles FOR SELECT
USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile details"
ON public.profiles FOR UPDATE
USING (auth.uid() = id OR public.is_admin())
WITH CHECK (auth.uid() = id OR public.is_admin());

-- Replace the permissive policies from migration 012. The RPC below is the
-- only checkout path that is allowed to calculate totals and consume stock.
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.orders FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.orders TO anon, authenticated;
GRANT UPDATE, DELETE ON TABLE public.orders TO authenticated;

DROP POLICY IF EXISTS "Public and guests can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Orders are viewable by everyone or admin" ON public.orders;
DROP POLICY IF EXISTS "Orders are updatable by everyone or admin" ON public.orders;
DROP POLICY IF EXISTS "Orders are deletable by everyone or admin" ON public.orders;
DROP POLICY IF EXISTS "Guests and users can create orders" ON public.orders;
DROP POLICY IF EXISTS "Users can view owned orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can delete orders" ON public.orders;

CREATE POLICY "Guests and users can create orders"
ON public.orders FOR INSERT
WITH CHECK ((auth.uid() IS NULL AND user_id IS NULL) OR user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Users can view owned orders"
ON public.orders FOR SELECT
USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Admins can update orders"
ON public.orders FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete orders"
ON public.orders FOR DELETE
USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.create_order_with_stock(
  p_name text,
  p_phone text,
  p_governorate text,
  p_address text,
  p_items jsonb,
  p_shipping numeric DEFAULT 0
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  product_id bigint;
  requested_qty integer;
  product_name text;
  unit_price numeric;
  normalized_items jsonb := '[]'::jsonb;
  subtotal numeric := 0;
  created_order public.orders;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'An order must contain at least one product';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_items) AS entries(value)
  LOOP
    product_id := (item->>'id')::bigint;
    requested_qty := (item->>'qty')::integer;
    IF requested_qty IS NULL OR requested_qty < 1 THEN
      RAISE EXCEPTION 'Invalid product quantity';
    END IF;

    SELECT p.name, COALESCE(p.selling_price, p.price, 0)
      INTO product_name, unit_price
      FROM public.products p
      WHERE p.id = product_id
      FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % no longer exists', product_id;
    END IF;

    UPDATE public.products
       SET stock = stock - requested_qty,
           updated_at = now()
     WHERE id = product_id
       AND COALESCE(stock, 0) >= requested_qty;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient stock for product %', product_id;
    END IF;

    subtotal := subtotal + (unit_price * requested_qty);
    normalized_items := normalized_items || jsonb_build_array(jsonb_build_object(
      'id', product_id,
      'name', product_name,
      'qty', requested_qty,
      'unit_price', unit_price,
      'total_price', round(unit_price * requested_qty, 2)
    ));
  END LOOP;

  INSERT INTO public.orders (
    user_id, name, phone, governorate, address, items, total, shipping, status, created_at
  ) VALUES (
    auth.uid(),
    trim(COALESCE(p_name, 'Customer')),
    trim(COALESCE(p_phone, '')),
    p_governorate,
    p_address,
    normalized_items,
    round(subtotal + COALESCE(p_shipping, 0), 2),
    COALESCE(p_shipping, 0),
    'pending',
    now()
  )
  RETURNING * INTO created_order;

  RETURN created_order;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_order_with_stock(text, text, text, text, jsonb, numeric)
  TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';