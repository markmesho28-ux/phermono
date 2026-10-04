-- Migration: fix is_admin() to match app-level admin checks
-- The original function only checked role = 'admin', but the app also
-- recognises role = 'superadmin' and the is_admin boolean flag.
-- This caused silent RLS write rejections for those admin users.

BEGIN;

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
        p.role = 'admin'
        OR p.role = 'superadmin'
        OR p.is_admin = true
      )
  );
$$;

COMMIT;
