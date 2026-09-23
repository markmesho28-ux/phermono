BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Recreate the RPC with the exact named arguments used by the frontend.
-- The function name is retained for client compatibility; it does not use
-- inventory or stock restrictions.
-- The DROP also handles databases where an older version was created with a
-- different parameter list or parameter names.
DROP FUNCTION IF EXISTS public.create_order_with_stock(text, text, text, text, jsonb, numeric);

CREATE OR REPLACE FUNCTION public.create_order_with_stock(
  p_address text,
  p_governorate text,
  p_items jsonb,
  p_name text,
  p_phone text,
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

  FOR item IN
    SELECT value FROM jsonb_array_elements(p_items) AS entries(value)
  LOOP
    IF (item->>'id') IS NULL OR (item->>'qty') IS NULL THEN
      RAISE EXCEPTION 'Each order item must include an id and quantity';
    END IF;

    BEGIN
      product_id := (item->>'id')::bigint;
      requested_qty := (item->>'qty')::integer;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid product id or quantity';
    END;

    IF requested_qty < 1 THEN
      RAISE EXCEPTION 'Product quantity must be at least 1';
    END IF;

    SELECT p.name, COALESCE(p.selling_price, p.price, 0)
      INTO product_name, unit_price
      FROM public.products AS p
     WHERE p.id = product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % no longer exists', product_id;
    END IF;

    subtotal := subtotal + (unit_price * requested_qty);
    normalized_items := normalized_items || jsonb_build_array(
      jsonb_build_object(
        'id', product_id,
        'name', product_name,
        'qty', requested_qty,
        'unit_price', unit_price,
        'total_price', round(unit_price * requested_qty, 2)
      )
    );
  END LOOP;

  INSERT INTO public.orders (
    user_id,
    name,
    phone,
    governorate,
    address,
    items,
    total,
    shipping,
    status,
    created_at
  )
  VALUES (
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

GRANT EXECUTE ON FUNCTION public.create_order_with_stock(
  text, text, jsonb, text, text, numeric
) TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';