-- ==============================================================================
-- Migration: Bulletproof Subcategory Foreign Key Resolution & Auto-Creation
--
-- Problem: Subcategories fail with "violates foreign key constraint subcategories_category_id_fkey"
--          when:
--          1. category_id is passed as a slug or name instead of primary key ID.
--          2. category_id is passed as a UUID that was created/cached on the frontend
--             but has not yet been synced or saved to public.categories in Supabase.
--
-- Solution:
--   1. Clean up any previous conflicting triggers/functions.
--   2. Ensure public.categories table has all required columns (id, name, label, slug).
--   3. Rebuild the foreign key constraint subcategories_category_id_fkey with ON DELETE CASCADE.
--   4. Install a smart BEFORE INSERT OR UPDATE trigger on public.subcategories with SECURITY DEFINER:
--      - If category_id exists directly in categories.id -> keeps it.
--      - If category_id matches categories.slug or name or label -> rewrites to categories.id.
--      - If category_id does not exist anywhere in categories -> auto-inserts the missing
--        parent category row into public.categories so the foreign key constraint is NEVER violated!
-- ==============================================================================

BEGIN;

-- 1. Remove previous/conflicting triggers and functions
DROP TRIGGER IF EXISTS subcategory_fk_safeguard_insert ON public.subcategories;
DROP TRIGGER IF EXISTS subcategory_fk_safeguard_update ON public.subcategories;
DROP TRIGGER IF EXISTS trg_subcategory_category_fk ON public.subcategories;
DROP FUNCTION IF EXISTS public.subcategory_resolve_category_id CASCADE;
DROP FUNCTION IF EXISTS public.resolve_category_id CASCADE;
DROP FUNCTION IF EXISTS public.handle_subcategory_category_fk CASCADE;

-- 2. Ensure public.categories table has compatible columns
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT 'Sparkles';
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '';
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS accent TEXT DEFAULT '';
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Synchronize missing names/labels/slugs on existing categories
UPDATE public.categories
SET name = COALESCE(NULLIF(name, ''), NULLIF(label, ''), id),
    label = COALESCE(NULLIF(label, ''), NULLIF(name, ''), id),
    slug = COALESCE(NULLIF(slug, ''), lower(regexp_replace(COALESCE(NULLIF(name, ''), NULLIF(label, ''), id), '[^a-zA-Z0-9]+', '-', 'g')))
WHERE name IS NULL OR label IS NULL OR slug IS NULL;

-- 3. Resolve any existing orphan subcategory rows before re-adding FK
INSERT INTO public.categories (id, name, label, slug)
SELECT DISTINCT s.category_id,
       'Category ' || substring(s.category_id from 1 for 8),
       'Category ' || substring(s.category_id from 1 for 8),
       'cat-' || substring(s.category_id from 1 for 8) || '-' || substring(gen_random_uuid()::text from 1 for 4)
FROM public.subcategories s
WHERE s.category_id IS NOT NULL
  AND s.category_id != ''
  AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.id = s.category_id)
ON CONFLICT (id) DO NOTHING;

-- 4. Re-establish foreign key constraint
ALTER TABLE public.subcategories
  DROP CONSTRAINT IF EXISTS subcategories_category_id_fkey;

ALTER TABLE public.subcategories
  ADD CONSTRAINT subcategories_category_id_fkey
  FOREIGN KEY (category_id)
  REFERENCES public.categories(id)
  ON DELETE CASCADE;

-- 5. Trigger Function: Auto-Resolve & Auto-Create Parent Category
CREATE OR REPLACE FUNCTION public.handle_subcategory_category_fk()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  matched_id TEXT;
  clean_slug TEXT;
  fallback_name TEXT;
BEGIN
  -- Handle empty or null category_id
  IF NEW.category_id IS NULL OR trim(NEW.category_id) = '' THEN
    SELECT id INTO matched_id FROM public.categories WHERE slug = 'general' OR id = 'general' LIMIT 1;
    IF matched_id IS NULL THEN
      INSERT INTO public.categories (id, name, label, slug)
      VALUES ('general', 'General', 'General', 'general')
      ON CONFLICT (id) DO NOTHING;
      matched_id := 'general';
    END IF;
    NEW.category_id := matched_id;
    RETURN NEW;
  END IF;

  -- Case 1: Exact match on public.categories.id (optimal path)
  SELECT id INTO matched_id FROM public.categories WHERE id = NEW.category_id LIMIT 1;
  IF matched_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Case 2: Match by slug, name, or label
  SELECT id INTO matched_id FROM public.categories
   WHERE slug = NEW.category_id
      OR lower(name) = lower(NEW.category_id)
      OR lower(label) = lower(NEW.category_id)
   LIMIT 1;

  IF matched_id IS NOT NULL THEN
    NEW.category_id := matched_id;
    RETURN NEW;
  END IF;

  -- Case 3: The category ID does not exist in the database at all!
  -- Autonomously create the missing category in public.categories so the FK constraint NEVER fails.
  fallback_name := 'Category ' || substring(NEW.category_id from 1 for 8);
  clean_slug := lower(regexp_replace(trim(NEW.category_id), '[^a-z0-9]+', '-', 'g'));
  IF clean_slug = '' OR clean_slug IS NULL THEN
    clean_slug := 'cat-' || substring(gen_random_uuid()::text from 1 for 8);
  END IF;

  -- Ensure slug is unique before insert
  IF EXISTS (SELECT 1 FROM public.categories WHERE slug = clean_slug) THEN
    clean_slug := clean_slug || '-' || substring(gen_random_uuid()::text from 1 for 4);
  END IF;

  INSERT INTO public.categories (id, name, label, slug, icon, color, accent)
  VALUES (
    NEW.category_id,
    fallback_name,
    fallback_name,
    clean_slug,
    'Sparkles',
    '',
    ''
  )
  ON CONFLICT (id) DO UPDATE
    SET updated_at = NOW();

  RETURN NEW;
END;
$$;

-- 6. Attach trigger before INSERT or UPDATE
DROP TRIGGER IF EXISTS trg_subcategory_category_fk ON public.subcategories;
CREATE TRIGGER trg_subcategory_category_fk
  BEFORE INSERT OR UPDATE OF category_id ON public.subcategories
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_subcategory_category_fk();

COMMIT;
