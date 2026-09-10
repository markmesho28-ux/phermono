import React, { createContext, useContext, useEffect, useState } from 'react';
import ConfirmModal from '../components/ConfirmModal';
import supabase, { SUPABASE_URL } from '../lib/supabase';
import type { Category, CategorySubcategory, DataContextValue, Order, Product, PriceRange } from '../types';

const DataContext = createContext<DataContextValue | null>(null);
const STORAGE_KEY = 'phermono_data_v1';
const EMPTY_DATA = {
  categories: [] as Category[],
  brands: [] as string[],
  products: [] as Product[],
  priceRanges: [] as PriceRange[],
  orders: [] as Order[],
};

// Hard-coded live schema facts for the `products` table.
// Confirmed columns: id, name, category_id, brand (text), selling_price, market_price, admin_cost, image, description,
// rating, reviews, hero, created_at, updated_at.
// After migration we will persist product -> subcategory in `products.subcategory_id` (TEXT) referencing `subcategories.id`.
const PRODUCT_SCHEMA = {
  productsHasCategoryId: true,
  productsHasCategory: false,
  // We expect to persist subcategory relationships in products.subcategory_id
  productsHasSubcategoryId: true,
  productsHasSubcategory: false,
  productsHasBrandId: false,
  productsHasBrand: true,
} as const;

const isUuid = (v: string | undefined | null): boolean => {
  if (!v) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v));
};

const slugify = (value: string) => {
  const base = String(value || '').trim();
  if (!base) return `item-${Date.now()}`;

  const normalized = base
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  return normalized || `item-${Date.now()}`;
};

const mapCategoryRow = (row: any, subcategoryRows: any[] = [], brandRows: any[] = []): Category => ({
  id: String(row?.id || ''),
  label: row?.name ?? row?.label ?? row?.slug ?? '',
  icon: row?.icon ?? 'Sparkles',
  color: row?.color ?? '',
  accent: row?.accent ?? '',
  subcategories: (subcategoryRows || [])
    .filter((sub) => String(sub?.category_id) === String(row?.id))
    .map((sub) => ({
      id: String(sub?.id ?? sub?.slug ?? sub?.name ?? sub?.label ?? ''),
      label: sub?.name ?? sub?.label ?? sub?.slug ?? '',
    })),
  brands: (brandRows || [])
    .filter((brand) => String(brand?.category_id) === String(row?.id))
    .map((brand) => String(brand?.name ?? brand?.label ?? brand?.slug ?? ''))
    .filter(Boolean),
});

const toNumberOrUndefined = (value: any): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

// Recursively remove any property named `price` from objects/arrays to avoid sending
// legacy/deleted `price` columns to Supabase.
const removePriceKeys = (value: any): any => {
  if (Array.isArray(value)) return value.map(removePriceKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const k of Object.keys(value)) {
      if (k === 'price') continue;
      out[k] = removePriceKeys((value as any)[k]);
    }
    return out;
  }
  return value;
};

// Resolve a subcategory identifier (id, slug, name, or object) to a canonical DB id when possible.
const resolveSubcategoryId = async (value: any): Promise<string | null> => {
  if (!value) return null;

  // If given an object like { id } or { slug } or { name }, prefer id then slug/name
  if (typeof value === 'object') {
    try {
      if (value?.id) return String(value.id);
      if (value?.slug) value = String(value.slug);
      else if (value?.name) value = String(value.name);
      else value = '';
    } catch (_) {
      value = '';
    }
  }

  const raw = String(value ?? '').trim();
  if (!raw) return null;

  // If it's already a UUID, return as-is
  if (isUuid(raw)) return raw;

  // Try a few prioritized lookups: exact slug, exact name, slugified, then case-insensitive partial matches.
  const slugCandidate = slugify(raw);
  try {
    // Exact slug
    try {
      const { data: bySlug } = await supabase.from('subcategories').select('id').eq('slug', raw).limit(1).maybeSingle();
      if (bySlug && (bySlug as any).id) return String((bySlug as any).id);
    } catch (_) {}

    // Exact name
    try {
      const { data: byName } = await supabase.from('subcategories').select('id').eq('name', raw).limit(1).maybeSingle();
      if (byName && (byName as any).id) return String((byName as any).id);
    } catch (_) {}

    // Slugified match
    if (slugCandidate && slugCandidate !== raw) {
      try {
        const { data: bySlug2 } = await supabase.from('subcategories').select('id').eq('slug', slugCandidate).limit(1).maybeSingle();
        if (bySlug2 && (bySlug2 as any).id) return String((bySlug2 as any).id);
      } catch (_) {}
    }

    // Case-insensitive contains on slug and name as a last resort
    try {
      const { data: bySlugIlike } = await supabase.from('subcategories').select('id').ilike('slug', `%${raw}%`).limit(1).maybeSingle();
      if (bySlugIlike && (bySlugIlike as any).id) return String((bySlugIlike as any).id);
    } catch (_) {}

    try {
      const { data: byNameIlike } = await supabase.from('subcategories').select('id').ilike('name', `%${raw}%`).limit(1).maybeSingle();
      if (byNameIlike && (byNameIlike as any).id) return String((byNameIlike as any).id);
    } catch (_) {}
  } catch (e) {
    // ignore resolution errors; caller will decide fallback
  }

  return null;
};

const normalizeProductImage = (value: any): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  // do not return blob/data URLs directly; caller should upload them before saving
  if (raw.startsWith('blob:') || raw.startsWith('data:')) return '';
  if (raw.startsWith('/')) {
    if (raw.startsWith('/storage/')) return `${SUPABASE_URL}${raw}`;
    return `${SUPABASE_URL}/storage/v1/object/public${raw}`;
  }

  const storagePath = raw.replace(/^\/+/, '');
  const candidates = ['products', 'images', 'uploads', 'assets'];
  const bucket = candidates.find((name) => storagePath.toLowerCase().startsWith(`${name}/`));
  if (bucket) {
    const remainder = storagePath.slice(bucket.length + 1);
    if (remainder) return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${remainder}`;
  }

  return raw;
};

const resolvePersistedProductImage = (row: any): string | null => {
  const candidates = [
    row?.image,
    Array.isArray(row?.images) ? row.images.find((item: any) => !!String(item ?? '').trim()) : null,
    row?.image_url,
    row?.imageUrl,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }

  return null;
};

// Upload data/blob image strings to Supabase Storage (bucket: 'products') and return public URL.
const uploadImageIfNeeded = async (value: any): Promise<string | null> => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw; // already an absolute URL

  // Only handle data: or blob: or plain filenames.
  if (!raw.startsWith('data:') && !raw.startsWith('blob:') && !raw.startsWith('/')) {
    // treat as storage path candidate
    // normalize to public URL if it matches common bucket patterns
    const normalized = normalizeProductImage(raw);
    if (normalized) return normalized;
  }

  try {
    // Convert data/blob URL to Blob
    const response = await fetch(raw);
    const blob = await response.blob();
    const ext = (blob.type && blob.type.split('/')[1]) ? blob.type.split('/')[1].split(';')[0] : 'jpg';
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
    const bucket = 'products';
    const path = `${fileName}`; // flat filename inside bucket

    const uploadRes = await supabase.storage.from(bucket).upload(path, blob, { upsert: true });
    if (uploadRes.error) {
      console.warn('Image upload failed:', uploadRes.error.message || uploadRes.error);
      return null;
    }

    // Construct public URL (prefer SDK helper when available)
    try {
      const maybe = supabase.storage.from(bucket).getPublicUrl(path);
      // supabase-js may return { data: { publicUrl } } or { publicURL }
      if (maybe && typeof maybe === 'object') {
        // data.publicUrl
        if ((maybe as any).data && (maybe as any).data.publicUrl) return (maybe as any).data.publicUrl;
        // data.publicURL
        if ((maybe as any).data && (maybe as any).data.publicURL) return (maybe as any).data.publicURL;
        // publicURL
        if ((maybe as any).publicURL) return (maybe as any).publicURL;
        // publicUrl
        if ((maybe as any).publicUrl) return (maybe as any).publicUrl;
      }
    } catch (e) {
      // ignore and fallback to manual construction
    }

    // Fallback manual construction: <SUPABASE_URL>/storage/v1/object/public/<bucket>/<path>
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${encodeURI(path)}`;
    return publicUrl;
  } catch (err) {
    console.warn('Failed to upload/convert image:', err);
    return null;
  }
};

const isMissingColumnError = (error: any) => {
  const message = typeof error?.message === 'string' ? error.message : String(error ?? '');
  return /column .* does not exist|does not exist|unknown column/i.test(message);
};

const persistBestSellerFlag = async (productId: number, nextValue: boolean): Promise<boolean> => {
  if (!supabase) return false;

  const columnName = 'hero';

  try {
    const { error } = await supabase
      .from('products')
      .update({
        [columnName]: nextValue,
        updated_at: new Date().toISOString(),
      })
      .eq('id', productId);

    if (error) throw error;
    return true;
  } catch (e: any) {
    console.warn('Supabase best seller sync failed:', e?.message || e);
    return false;
  }
};

function getInitialData() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    // ignore storage access issues; the app should boot empty in that case as well
  }

  return { ...EMPTY_DATA };
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [initial] = useState(() => getInitialData());
  const [categories, setCategories] = useState<Category[]>(initial.categories);
  const [brands, setBrands] = useState<string[]>(initial.brands);
  const [products, setProducts] = useState<Product[]>(initial.products);
  const [priceRanges] = useState<PriceRange[]>(initial.priceRanges);
  const [orders, setOrders] = useState<Order[]>(initial.orders);

  useEffect(() => {
    if (categories.length === 0 && products.length === 0 && brands.length === 0) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        console.warn('LocalStorage cleanup error:', e);
      }
      return;
    }

    const payload = { categories, brands, products, priceRanges, orders };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  }, [categories, brands, products, priceRanges, orders]);

  // Sync initial data from Supabase when available. This runs once after mount.
  const [, setLoading] = useState(true);
  const [, setRemoteError] = useState<string | null>(null);
  // Schema is hard-coded from confirmed live DB columns (see PRODUCT_SCHEMA above).
  // No runtime probing needed — avoids spurious 400 requests on every mount.
  const [schemaInfo] = useState(PRODUCT_SCHEMA);
  // brandsHaveCategory is determined at runtime from the actual brands rows returned by Supabase.
  const [brandsHaveCategory, setBrandsHaveCategory] = useState(false);
  // Use canonical subcategory column name; code expects `subcategory_id` to exist after migration
  const [productSubcategoryColumn, setProductSubcategoryColumn] = useState<string | null>('subcategory_id');

  useEffect(() => {
    let mounted = true;
    const fetchRemote = async () => {
      if (!supabase) return;
      setLoading(true);
      try {
        const [
          { data: productsData },
          { data: ordersData },
          { data: categoriesData },
          { data: subcategoriesData },
          { data: brandsData },
        ] = await Promise.all([
          supabase.from('products').select('*'),
          supabase.from('orders').select('*'),
          supabase.from('categories').select('*'),
          supabase.from('subcategories').select('*'),
          supabase.from('brands').select('*'),
        ]);

        if (!mounted) return;

        const categoriesArray = Array.isArray(categoriesData) ? categoriesData : [];
        const nextCategories = categoriesArray.map((row: any) => mapCategoryRow(row, subcategoriesData || [], brandsData || []));
        // Global brands (unscoped) should only include brands with no category_id
        // Derive global brands (no category_id) and prepare per-category lists reliably
        const nextBrands = Array.isArray(brandsData)
          ? (brandsData as any[])
              .filter((brand: any) => !brand?.category_id)
              .map((brand: any) => String(brand?.name ?? brand?.label ?? brand?.slug ?? ''))
              .filter(Boolean)
          : [];

        const categoriesById: Record<string, Category> = Object.fromEntries(
          nextCategories.map((category) => [String(category.id), category])
        );
        const categoriesBySlug: Record<string, Category> = {};
        nextCategories.forEach((category) => {
          const label = String(category.label || '').trim();
          if (label) {
            categoriesBySlug[label.toLowerCase()] = category;
            categoriesBySlug[slugify(label).toLowerCase()] = category;
          }
        });

        // Detect the exact subcategory column name present in product rows so we read/write the exact DB column.
        let detectedColumn: string | null = productSubcategoryColumn;
        if (Array.isArray(productsData) && productsData.length > 0) {
          const sample = productsData[0] || {};
          const possible = ['subcategory_id', 'sub_category_id', 'subcategory', 'sub_category'];
          const detected = possible.find((k) => Object.prototype.hasOwnProperty.call(sample, k)) ?? null;
          if (!productSubcategoryColumn) setProductSubcategoryColumn(detected);
          detectedColumn = detected ?? productSubcategoryColumn;
        }

        if (Array.isArray(productsData) && productsData.length > 0) {
          // Build a robust lookup for subcategories (id, slug, name -> canonical id)
          const subLookup: Record<string, string> = {};
          if (Array.isArray(subcategoriesData)) {
            (subcategoriesData as any[]).forEach((s: any) => {
              const sid = s?.id ? String(s.id) : '';
              const slug = s?.slug ? String(s.slug) : '';
              const name = s?.name ? String(s.name) : '';
              if (sid) subLookup[sid] = sid;
              if (slug) subLookup[slug] = sid || slug;
              if (name) subLookup[name.toLowerCase().trim()] = sid || name.toLowerCase().trim();
              if (slug) subLookup[slug.toLowerCase().trim()] = sid || slug.toLowerCase().trim();
            });
          }

          // Normalize product rows from DB into the app's Product shape and
          // ensure category/subcategory reference uses canonical category id when possible.
          const normalized = (productsData as any[]).map((r) => {
            // resolve category: prefer category_id, else category (might be slug)
            let categoryVal: any = r.category_id ?? r.category ?? null;
            if (categoryVal && typeof categoryVal === 'string') {
              const key = categoryVal.trim();
              const mappedCategory = categoriesById[key] ?? categoriesBySlug[key.toLowerCase()];
              if (mappedCategory) {
                categoryVal = mappedCategory.id;
              }
            }

            // resolve subcategory: prefer the exact detected DB column (detectedColumn),
            // falling back to common names. Use subLookup to map any slug/name/id to canonical id.
            let subVal: any = null;
            const col = detectedColumn;
            const tryLookup = (v: string | undefined | null) => {
              if (!v) return null;
              const raw = String(v).trim();
              if (!raw) return null;
              if (subLookup[raw]) return String(subLookup[raw]);
              const lower = raw.toLowerCase();
              if (subLookup[lower]) return String(subLookup[lower]);
              return null;
            };

            if (col && Object.prototype.hasOwnProperty.call(r, col) && r[col] !== undefined && r[col] !== null && String(r[col]).trim() !== '') {
              const val = r[col];
              if (/id$/i.test(col)) {
                subVal = String(val);
                const mapped = tryLookup(subVal);
                if (mapped) subVal = mapped;
              } else {
                const candidate = String(val).trim();
                const mapped = tryLookup(candidate) || tryLookup(candidate.toLowerCase());
                subVal = mapped ?? candidate;
              }
            } else if (r.subcategory_id !== undefined && r.subcategory_id !== null && String(r.subcategory_id).trim() !== '') {
              const candidate = String(r.subcategory_id).trim();
              subVal = tryLookup(candidate) || candidate;
            } else if (r.subcategory !== undefined && r.subcategory !== null && String(r.subcategory).trim() !== '') {
              const candidate = String(r.subcategory).trim();
              const mapped = tryLookup(candidate) || tryLookup(candidate.toLowerCase());
              subVal = mapped ?? candidate;
            }

            const bestSellerFlag = Boolean(r.hero ?? (String(r.tag || '').toLowerCase() === 'best seller'));
            const imageValue = resolvePersistedProductImage(r);
            const descriptionValue = r.description ?? r.details ?? r.long_description ?? null;
            const dbSellingPrice = toNumberOrUndefined(r.selling_price);
            const dbMarketPrice = toNumberOrUndefined(r.market_price);
            const dbAdminCost = toNumberOrUndefined(r.admin_cost);
            const normalizedImage = normalizeProductImage(imageValue);

            // determine persisted subcategory id (if any) separately from the canonical `subcategory` used by UI
            let persistedSubId: string | null = null;
            if (col && r[col] !== undefined && r[col] !== null && String(r[col]).trim() !== '') {
              if (/id$/i.test(col)) persistedSubId = String(r[col]);
              else {
                const candidate = String(r[col]).trim();
                if (subLookup[candidate]) persistedSubId = String(subLookup[candidate]);
              }
            } else if (r.subcategory_id !== undefined && r.subcategory_id !== null && String(r.subcategory_id).trim() !== '') {
              persistedSubId = String(r.subcategory_id);
            } else if (r.subcategory !== undefined && r.subcategory !== null && isUuid(String(r.subcategory))) {
              persistedSubId = String(r.subcategory);
            }

            return {
              id: r.id ?? Date.now(),
              name: r.name ?? r.label ?? '',
              brand: r.brand ?? r.brand_name ?? '',
              createdAt: r.created_at ?? r.createdAt ?? null,
              category: categoryVal ?? null,
              // UI-facing `subcategory` remains the canonical id/slug used for comparisons
              subcategory: subVal ?? null,
              // persisted canonical subcategory id (when present in DB)
              subcategoryId: persistedSubId ?? null,
              originalPrice: dbMarketPrice ?? null,
              sellingPrice: dbSellingPrice ?? null,
              marketPrice: dbMarketPrice ?? null,
              adminCost: dbAdminCost ?? null,
              cost: dbAdminCost ?? null,
              rating: r.rating ?? 0,
              reviews: r.reviews ?? 0,
              skinType: r.skin_type ?? null,
              tag: r.tag ?? (bestSellerFlag ? 'Best Seller' : null),
              hero: r.hero ?? bestSellerFlag,
              image: normalizedImage,
              image_url: normalizedImage,
              description: descriptionValue ?? null,
              details: descriptionValue ?? null,
            } as any;
          });
          setProducts(normalized as any);

          // Debug: log sample of product subcategory values and a counts summary to aid diagnosis
          try {
            const sample = (normalized as any[]).slice(0, 10).map((p: any) => ({ id: p.id, subcategoryId: p.subcategoryId, matchesKnown: !!(p.subcategoryId && subLookup[String(p.subcategoryId)]) }));
            console.debug('DataContext: product.subcategoryId sample (first 10)', sample);
            const counts: Record<string, number> = {};
            (normalized as any[]).forEach((p: any) => {
              const key = p.subcategoryId ?? '<<none>>';
              counts[String(key)] = (counts[String(key)] || 0) + 1;
            });
            console.debug('DataContext: product counts by subcategoryId (sample keys)', counts);
          } catch (e) {
            console.debug('DataContext: debug logging failed', e);
          }
        }
        // Supabase is the source of truth — replace local lists
        setCategories(nextCategories);
        setBrands(nextBrands);
        // Determine whether brands are scoped to categories (brands have category_id)
        const detectedBrandsHaveCategory = Array.isArray(brandsData) && (brandsData as any[]).some(b => b && Object.prototype.hasOwnProperty.call(b, 'category_id'));
        setBrandsHaveCategory(detectedBrandsHaveCategory);

        // Always build per-category brand lists from the fetched `brandsData` rows.
        // Categories with no brands will receive an empty array.
        if (Array.isArray(brandsData)) {
          setCategories(prev => prev.map(cat => ({ ...cat, brands: (brandsData as any[]).filter(b => String(b.category_id) === String(cat.id)).map(b => String(b.name)) } as any)));
        } else {
          setCategories(prev => prev.map(cat => ({ ...cat, brands: [] } as any)));
        }
        if (Array.isArray(ordersData) && ordersData.length > 0) {
          setOrders(ordersData as any);
        }
        setRemoteError(null);
        setLoading(false);
      } catch (err) {
        console.warn('Supabase sync failed:', err);
        setRemoteError(String(err));
        setLoading(false);
      }
    };

    void fetchRemote();
    return () => { mounted = false; };
  }, [productSubcategoryColumn]);

  // In-app confirmation modal state and helper
  const [confirmState, setConfirmState] = useState<{ open: boolean; message: string; resolve?: (v: boolean) => void }>({ open: false, message: '' });
  const requestConfirm = (message: string) => new Promise<boolean>((resolve) => {
    setConfirmState({ open: true, message, resolve });
  });
  const handleConfirm = () => {
    try { confirmState.resolve?.(true); } catch (e) { /* ignore */ }
    setConfirmState({ open: false, message: '' });
  };
  const handleCancel = () => {
    try { confirmState.resolve?.(false); } catch (e) { /* ignore */ }
    setConfirmState({ open: false, message: '' });
  };

  // Categories
  const addCategory = async (cat: Category) => {
    const label = String(cat?.label || '').trim();
    if (!label || !supabase) return;

    // Ensure only real authenticated admins may perform writes
    try {
      const adminCheck = await (async () => {
        try {
          const { data, error } = await supabase.auth.getUser();
          if (error) return false;
          const supaUser = (data as any)?.user ?? null;
          if (!supaUser) return false;
          const { data: profile, error: pfErr } = await supabase.from('profiles').select('id,role,is_admin').eq('id', supaUser.id).single();
          if (pfErr || !profile) return false;
          return (profile.role === 'admin' || profile.is_admin === true);
        } catch (err) {
          return false;
        }
      })();

      if (!adminCheck) {
        alert('Admin sign-in required to create categories. Please sign in with an admin account.');
        return;
      }

      const slug = slugify(label);
      const payload: any = { name: label, slug, description: '', metadata: {} };
      const { data, error } = await supabase.from('categories').insert([payload]).select().single();
      if (error) {
        console.warn('Supabase category insert failed:', error.message || error);
        if ((error as any)?.code === '23505' || String(error?.message || '').toLowerCase().includes('duplicate')) {
          const { data: fallback } = await supabase.from('categories').select('*').eq('slug', slug).limit(1).maybeSingle();
          if (fallback && fallback.id) {
            const resolvedCategory: Category = {
              ...cat,
              id: fallback.id,
              label: fallback.name ?? label,
              icon: cat.icon || 'Sparkles',
              color: cat.color ?? '',
              accent: cat.accent ?? '',
              subcategories: Array.isArray(cat.subcategories) ? cat.subcategories : [{ id: 'all', label: 'All' }],
              brands: Array.isArray(cat.brands) ? cat.brands : [],
            };
            setCategories(prev => [...prev.filter((item) => item.id !== resolvedCategory.id), resolvedCategory]);
            return;
          }
        }
        alert('Failed to create category: ' + (error.message || String(error)));
        return;
      }

      if (!data || !data.id) {
        alert('Failed to create category: Database did not return a valid ID.');
        return;
      }

      const newCategory: Category = {
        ...cat,
        id: data.id,
        label: data.name ?? label,
        icon: cat.icon || 'Sparkles',
        color: cat.color ?? '',
        accent: cat.accent ?? '',
        subcategories: Array.isArray(cat.subcategories) ? cat.subcategories : [{ id: 'all', label: 'All' }],
        brands: Array.isArray(cat.brands) ? cat.brands : [],
      };
      setCategories(prev => [...prev.filter((item) => item.id !== newCategory.id), newCategory]);
    } catch (e: any) {
      console.warn('Supabase category write error:', e?.message || e);
      alert('Failed to create category: ' + (e?.message || String(e)));
    }
  };
  const updateCategory = async (id: string, updates: Partial<Category>) => {
    // Local optimistic update kept until server confirms
    setCategories(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    if (!supabase) return;
    try {
      const row: any = {};
      if (updates.label !== undefined) {
        row.name = updates.label;
        row.slug = slugify(String(updates.label || ''));
      }
      if (updates.icon !== undefined) row.icon = updates.icon;
      if (updates.color !== undefined) row.color = updates.color;
      if (updates.accent !== undefined) row.accent = updates.accent;

      if (Object.keys(row).length === 0) return;
      const { error } = await supabase.from('categories').update(row).eq('id', id).select().single();
      if (error) {
        console.warn('Supabase category update failed:', error.message || error);
        // revert local change by refetching or leaving as-is; here we log and alert
        alert('Failed to update category: ' + (error.message || String(error)));
      }
    } catch (e: any) {
      console.warn('Supabase category update error:', e?.message || e);
      alert('Failed to update category: ' + (e?.message || String(e)));
    }
  };
  const deleteCategory = async (id: string) => { await deleteCategoryRemote(id); };

  // Ensure deletes wait for Supabase confirmation before updating local state
  const deleteCategoryRemote = async (id: string) => {
    // Confirm with admin before destructive delete
    try {
      const ok = await requestConfirm('Delete this category and all its sub-items? This cannot be undone.');
      if (!ok) return;
    } catch (e) {
      return;
    }

    const isMissingColumnError = (error: any) => {
      const message = typeof error?.message === 'string' ? error.message : String(error ?? '');
      return /column .* does not exist|does not exist|unknown column/i.test(message);
    };

    const categoryMeta = categories.find((cat) => cat.id === id) ?? null;
    const categoryName = categoryMeta?.label ?? '';
    const categorySlug = categoryName ? slugify(categoryName) : '';
    const categoryBrandNames = categoryMeta && Array.isArray(categoryMeta.brands) ? categoryMeta.brands : [];

    const deletedBrandNamesSet = new Set<string>(categoryBrandNames.map((b) => b.toLowerCase()));

    if (!supabase) {
      // Local fallback mode when Supabase is not configured
      setCategories((prev) =>
        prev
          .filter((c) => c.id !== id)
          .map((c) => ({
            ...c,
            brands: Array.isArray(c.brands) ? c.brands.filter((b) => !deletedBrandNamesSet.has(b.toLowerCase())) : [],
          }))
      );
      setBrands((prev) => prev.filter((b) => !deletedBrandNamesSet.has(b.toLowerCase())));
      setProducts((prev) =>
        prev.filter((p) => {
          const matchesCategoryId = p.category === id;
          const matchesCategoryName = categoryName && p.category === categoryName;
          const matchesCategorySlug = categorySlug && p.category === categorySlug;
          const matchesBrand = p.brand && deletedBrandNamesSet.has(String(p.brand).toLowerCase());
          return !(matchesCategoryId || matchesCategoryName || matchesCategorySlug || matchesBrand);
        })
      );
      return;
    }

    try {
      // 1) Delete products belonging to this category using only columns that actually exist.
      const productMatchers = Array.from(new Set([id, categoryName, categorySlug].filter(Boolean)));

      if (schemaInfo.productsHasCategoryId) {
        const { error: prodErr1 } = await supabase.from('products').delete().eq('category_id', id);
        if (prodErr1 && !isMissingColumnError(prodErr1)) {
          console.warn('Failed to delete products by category_id before deleting category:', prodErr1);
          alert('Failed to delete category products: ' + (prodErr1.message || String(prodErr1)));
          return;
        }
      }

      if (schemaInfo.productsHasCategory) {
        for (const value of productMatchers) {
          const { error: prodErr2 } = await supabase.from('products').delete().eq('category', value);
          if (prodErr2 && !isMissingColumnError(prodErr2)) {
            console.warn('Failed to delete products by category before deleting category:', prodErr2);
            alert('Failed to delete category products: ' + (prodErr2.message || String(prodErr2)));
            return;
          }
        }
      }

      // 2) Delete subcategories for category
      const { error: subErr } = await supabase.from('subcategories').delete().eq('category_id', id);
      if (subErr && !isMissingColumnError(subErr)) {
        console.warn('Failed to delete subcategories for category:', subErr);
        alert('Failed to delete category subcategories: ' + (subErr.message || String(subErr)));
        return;
      }

      // 3) Find all brands associated with this category to ensure explicit deletion
      const associatedBrands: Array<{ id?: string; name?: string; slug?: string }> = [];

      // Query brands by category_id (id or slug)
      try {
        const { data: dbBrands } = await supabase
          .from('brands')
          .select('id, name, slug, category_id')
          .eq('category_id', id);
        if (Array.isArray(dbBrands)) {
          associatedBrands.push(...dbBrands);
        }
      } catch (err) {
        console.debug('Could not select brands by category_id:', err);
      }

      if (categorySlug && categorySlug !== id) {
        try {
          const { data: dbBrandsSlug } = await supabase
            .from('brands')
            .select('id, name, slug, category_id')
            .eq('category_id', categorySlug);
          if (Array.isArray(dbBrandsSlug)) {
            associatedBrands.push(...dbBrandsSlug);
          }
        } catch (_) {}
      }

      // Query brands linked via category_brands junction table
      try {
        const { data: junctionRows } = await supabase
          .from('category_brands')
          .select('brand_id')
          .eq('category_id', id);
        if (Array.isArray(junctionRows) && junctionRows.length > 0) {
          for (const row of junctionRows) {
            if (row?.brand_id) {
              associatedBrands.push({ id: row.brand_id });
            }
          }
        }
      } catch (_) {
        // junction table might not exist
      }

      // Also collect brands matching categoryMeta.brands
      for (const bName of categoryBrandNames) {
        if (!associatedBrands.some((b) => String(b.name || '').toLowerCase() === bName.toLowerCase())) {
          try {
            const { data: found } = await supabase
              .from('brands')
              .select('id, name, slug')
              .eq('name', bName)
              .limit(1)
              .maybeSingle();
            if (found) {
              associatedBrands.push(found);
            } else {
              associatedBrands.push({ name: bName, slug: slugify(bName) });
            }
          } catch (_) {
            associatedBrands.push({ name: bName, slug: slugify(bName) });
          }
        }
      }

      // Populate deletedBrandNamesSet with all names, slugs, and IDs
      associatedBrands.forEach((b) => {
        if (b.name) deletedBrandNamesSet.add(b.name.toLowerCase());
        if (b.slug) deletedBrandNamesSet.add(b.slug.toLowerCase());
        if (b.id) deletedBrandNamesSet.add(String(b.id).toLowerCase());
      });

      // 4) Clean up category_brands junction table for this category and associated brands
      try {
        await supabase.from('category_brands').delete().eq('category_id', id);
      } catch (_) {}

      for (const brand of associatedBrands) {
        if (brand.id) {
          try {
            await supabase.from('category_brands').delete().eq('brand_id', brand.id);
          } catch (_) {}
        }
      }

      // 5) Explicitly delete all associated brands from the `brands` table in Supabase
      // First: delete by category_id directly
      const { error: brandErr } = await supabase.from('brands').delete().eq('category_id', id);
      if (brandErr && !isMissingColumnError(brandErr)) {
        console.warn('Failed to delete brands by category_id:', brandErr);
      }
      if (categorySlug && categorySlug !== id) {
        try {
          await supabase.from('brands').delete().eq('category_id', categorySlug);
        } catch (_) {}
      }

      // Next: delete each associated brand by id or name
      for (const brand of associatedBrands) {
        if (brand.id) {
          const { error: delByIdErr } = await supabase.from('brands').delete().eq('id', brand.id);
          if (delByIdErr && !isMissingColumnError(delByIdErr)) {
            console.warn('Failed to delete brand by id:', brand.id, delByIdErr);
          }
        } else if (brand.name) {
          const { error: delByNameErr } = await supabase.from('brands').delete().eq('name', brand.name);
          if (delByNameErr && !isMissingColumnError(delByNameErr)) {
            console.warn('Failed to delete brand by name:', brand.name, delByNameErr);
          }
        }
      }

      // 6) Delete the category row itself
      const { error: catErr } = await supabase.from('categories').delete().eq('id', id);
      if (catErr) {
        console.warn('Supabase category delete failed:', catErr);
        alert('Failed to delete category: ' + (catErr.message || String(catErr)));
        return;
      }

      // 7) Update local state immediately after successful database deletion
      setCategories((prev) =>
        prev
          .filter((c) => c.id !== id)
          .map((c) => ({
            ...c,
            brands: Array.isArray(c.brands) ? c.brands.filter((b) => !deletedBrandNamesSet.has(b.toLowerCase())) : [],
          }))
      );
      setBrands((prev) => prev.filter((b) => !deletedBrandNamesSet.has(b.toLowerCase())));
      setProducts((prev) =>
        prev.filter((p) => {
          const matchesCategoryId = p.category === id;
          const matchesCategoryName = categoryName && p.category === categoryName;
          const matchesCategorySlug = categorySlug && p.category === categorySlug;
          const matchesBrand = p.brand && deletedBrandNamesSet.has(String(p.brand).toLowerCase());
          return !(matchesCategoryId || matchesCategoryName || matchesCategorySlug || matchesBrand);
        })
      );
    } catch (e: any) {
      console.warn('Supabase category delete error:', e?.message || e);
      alert('Failed to delete category: ' + (e?.message || String(e)));
    }
  };

  // Subcategories
  const addSubcategory = async (categoryId: string, sub: CategorySubcategory) => {
    const label = String(sub?.label || '').trim();
    if (!label || !supabase) return;

    try {
      // Gather and log authentication/session information for strict tracing
      const sessionRes = await supabase.auth.getSession();
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      console.debug('addSubcategory: supabase.auth.getSession()', sessionRes?.data ?? sessionRes);
      console.debug('addSubcategory: supabase.auth.getUser()', { data: authData, error: authErr });
      if (authErr || !authData?.user) {
        alert('Admin sign-in required to create subcategories.');
        return;
      }
      const supaUser = (authData as any).user;
      const { data: profile, error: pfErr } = await supabase.from('profiles').select('id,role,is_admin').eq('id', supaUser.id).single();
      console.debug('addSubcategory: profile lookup', { profile, pfErr });
      if (pfErr || !(profile && (profile.role === 'admin' || profile.is_admin === true))) {
        alert('Admin sign-in required to create subcategories.');
        return;
      }

      // Normalize slug and check for existing subcategory within the category scope
      const slug = slugify(label);
      // Check existing subcategory within the category scope and log the query
      console.debug('addSubcategory: checking existing subcategory for', { categoryId, slug });
      const { data: existing, error: existingErr } = await supabase.from('subcategories').select('*').eq('slug', slug).eq('category_id', categoryId).limit(1).maybeSingle();
      if (existingErr) {
        // fall through to attempt insert, but log
        console.warn('addSubcategory: Error checking existing subcategory:', existingErr);
      }
      if (existing) {
        // ensure local state includes this subcategory
        const inbound = { id: existing.id ?? sub.id, label: existing.name ?? label };
        setCategories(prev => prev.map(c => {
          if (c.id !== categoryId) return c;
          const arr = Array.isArray(c.subcategories) ? c.subcategories : [];
          const existsLocally = arr.some(s => String(s.id) === String(inbound.id));
          return { ...c, subcategories: existsLocally ? arr : [...arr, inbound] } as any;
        }));
        return existing as any;
      }

      // Not found — insert. Perform insert then explicitly verify returned row actually exists server-side.
      const payload: any = { category_id: categoryId, name: label, slug, description: '', metadata: {} };
      console.debug('addSubcategory: insert payload', payload);
      const insertRes = await supabase.from('subcategories').insert([payload]).select().single();
      // Log full response for debugging visibility
      console.debug('addSubcategory: Subcategory insert response:', { data: insertRes.data, error: insertRes.error });

      if (insertRes.error) {
        console.warn('Supabase subcategory insert failed:', insertRes.error.message || insertRes.error);
        // handle duplicate race: try to read existing
        if ((insertRes.error as any)?.code === '23505' || String(insertRes.error?.message || '').toLowerCase().includes('duplicate')) {
          const { data: fallback } = await supabase.from('subcategories').select('*').eq('slug', slug).eq('category_id', categoryId).limit(1).maybeSingle();
          if (fallback) {
            const inbound = { id: fallback.id ?? sub.id, label: fallback.name ?? label };
            setCategories(prev => prev.map(c => {
              if (c.id !== categoryId) return c;
              const arr = Array.isArray(c.subcategories) ? c.subcategories : [];
              const existsLocally = arr.some(s => String(s.id) === String(inbound.id));
              return { ...c, subcategories: existsLocally ? arr : [...arr, inbound] } as any;
            }));
            return fallback as any;
          }
        }
        // Surface the real error to the user/developer
        alert('Failed to create subcategory: ' + (insertRes.error.message || String(insertRes.error)));
        return;
      }

      const created = insertRes.data as any;
      // Defensive: ensure created row has an id and correct category_id/slug
      if (!created || !created.id) {
        // Try to verify by fetching by slug+category
        const { data: verifyBySlug, error: verifyErr } = await supabase.from('subcategories').select('*').eq('slug', slug).eq('category_id', categoryId).limit(1).maybeSingle();
        console.debug('addSubcategory: Verify subcategory by slug response:', { data: verifyBySlug, error: verifyErr });
        if (verifyErr || !verifyBySlug) {
          alert('Subcategory insert did not return a valid row and verification failed. Check server logs or RLS policies.');
          return;
        }
        // Use verified fallback
        const inbound = { id: verifyBySlug.id, label: verifyBySlug.name ?? label };
        setCategories(prev => prev.map(c => {
          if (c.id !== categoryId) return c;
          return { ...c, subcategories: [...(Array.isArray(c.subcategories) ? c.subcategories : []).filter(item => item.id !== inbound.id), inbound] } as any;
        }));
        return verifyBySlug as any;
      }

      // Final verification: refetch the inserted row by id to ensure persistence
      const { data: verify, error: verifyErr } = await supabase.from('subcategories').select('*').eq('id', created.id).limit(1).maybeSingle();
      console.debug('addSubcategory: Verify subcategory by id response:', { data: verify, error: verifyErr });
      if (verifyErr || !verify) {
        // If verification fails, surface error and do not update local state
        alert('Failed to verify newly created subcategory in the database. Insert may not have persisted.');
        return;
      }

      const inbound = { id: verify.id ?? sub.id, label: verify.name ?? label };
      setCategories(prev => prev.map(c => {
        if (c.id !== categoryId) return c;
        return { ...c, subcategories: [...(Array.isArray(c.subcategories) ? c.subcategories : []).filter(item => item.id !== inbound.id), inbound] } as any;
      }));
      return verify as any;
    } catch (e: any) {
      console.warn('Supabase subcategory write error:', e?.message || e);
      alert('Failed to create subcategory: ' + (e?.message || String(e)));
    }
  };
  const updateSubcategory = async (categoryId: string, subId: string, updates: Partial<CategorySubcategory>) => {
    // Optimistic local update
    setCategories(prev => prev.map(c => {
      if (c.id !== categoryId) return c;
      return { ...c, subcategories: c.subcategories.map(s => s.id === subId ? { ...s, ...updates } : s) } as any;
    }));

    if (!supabase) return;
    try {
      const row: any = {};
      if (updates.label !== undefined) {
        row.name = updates.label;
        row.slug = slugify(String(updates.label || ''));
      }
      if (Object.keys(row).length === 0) return;
      const { error } = await supabase.from('subcategories').update(row).eq('id', subId).select().single();
      if (error) {
        console.warn('Supabase subcategory update failed:', error.message || error);
        alert('Failed to update subcategory: ' + (error.message || String(error)));
      }
    } catch (e: any) {
      console.warn('Supabase subcategory update error:', e?.message || e);
      alert('Failed to update subcategory: ' + (e?.message || String(e)));
    }
  };

  // Delete a subcategory only after Supabase confirms deletion
  const deleteSubcategory = async (categoryId: string, subId: string) => {
    if (!supabase) return;
    try {
      const ok = await requestConfirm('Delete this subcategory? This cannot be undone.');
      if (!ok) return;
      
      // 1) Delete products in DB that reference this subcategory
      // Delete products referencing this subcategory using the exact detected column when possible
      if (productSubcategoryColumn) {
        try {
          const { error: pErr } = await supabase.from('products').delete().eq(productSubcategoryColumn, subId);
          if (pErr) {
            console.warn(`Failed to delete products by ${productSubcategoryColumn}:`, pErr);
            alert('Failed to delete subcategory products: ' + (pErr.message || String(pErr)));
            return;
          }
        } catch (e) {
          console.debug('Error deleting products by detected subcategory column:', e);
          return;
        }
      } else {
        if (schemaInfo.productsHasSubcategoryId) {
          const { error: pErr } = await supabase.from('products').delete().eq('subcategory_id', subId);
          if (pErr) {
            console.warn('Failed to delete products by subcategory_id:', pErr);
            alert('Failed to delete subcategory products: ' + (pErr.message || String(pErr)));
            return;
          }
        }
        if (schemaInfo.productsHasSubcategory) {
          const { error: pErr2 } = await supabase.from('products').delete().eq('subcategory', subId);
          if (pErr2) {
            console.warn('Failed to delete products by subcategory:', pErr2);
            alert('Failed to delete subcategory products: ' + (pErr2.message || String(pErr2)));
            return;
          }
        }
      }

      // 2) Delete subcategory row
      const { error } = await supabase.from('subcategories').delete().eq('id', subId);
      if (error) {
        console.warn('Supabase subcategory delete failed:', error);
        alert('Failed to delete subcategory: ' + (error.message || String(error)));
        return;
      }

      // 3) Update local state
      setCategories(prev => prev.map(c => c.id === categoryId ? { ...c, subcategories: c.subcategories.filter(s => s.id !== subId) } : c ));
      setProducts(prev => prev.filter(p => !(p.category === categoryId && p.subcategoryId === subId)));
    } catch (e: any) {
      console.warn('Supabase subcategory delete error:', e?.message || e);
      alert('Failed to delete subcategory: ' + (e?.message || String(e)));
    }
  };

  // Brands
  const addBrand = async (name: string, categoryId?: string) => {
    const clean = String(name || '').trim();
    if (!clean || !supabase) return;

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr || !authData?.user) {
        alert('Admin sign-in required to create brands.');
        return;
      }
      const supaUser = (authData as any).user;
      const { data: profile, error: pfErr } = await supabase.from('profiles').select('id,role,is_admin').eq('id', supaUser.id).single();
      if (pfErr || !(profile && (profile.role === 'admin' || profile.is_admin === true))) {
        alert('Admin sign-in required to create brands.');
        return;
      }
      // Use normalized slug for lookups
      const slug = slugify(clean);
      const hasCategoryId = brandsHaveCategory;

      // Check for existing brand (avoid duplicates). If brands are scoped by category, check within that category.
      let existingQuery = supabase.from('brands').select('*').eq('slug', slug).limit(1);
      if (hasCategoryId && categoryId) existingQuery = existingQuery.eq('category_id', categoryId);
      const { data: existing } = await existingQuery;
      if (Array.isArray(existing) && existing.length > 0 && existing[0]) {
        const row = existing[0] as any;
        const brandName = row.name ?? clean;

        if (hasCategoryId && row?.category_id) {
          // Category-scoped brand: attach only to the owning category locally
          setCategories(prev => prev.map(c => {
            if (c.id !== String(row.category_id)) return c;
            const existingBrands = Array.isArray(c.brands) ? c.brands : [];
            const existsInCategory = existingBrands.some(b => String(b).toLowerCase() === brandName.toLowerCase());
            if (existsInCategory) return c;
            return { ...c, brands: [...existingBrands, brandName] };
          }));
        } else if (hasCategoryId && categoryId) {
          // brands table supports category_id but the existing row lacked it; attach to provided categoryId and
          // also keep it in global list
          setBrands(prev => {
            const exists = prev.some(b => String(b).toLowerCase() === brandName.toLowerCase());
            if (exists) return prev;
            return [...prev, brandName];
          });
          setCategories(prev => prev.map(c => {
            if (c.id !== categoryId) return c;
            const existingBrands = Array.isArray(c.brands) ? c.brands : [];
            const existsInCategory = existingBrands.some(b => String(b).toLowerCase() === brandName.toLowerCase());
            if (existsInCategory) return c;
            return { ...c, brands: [...existingBrands, brandName] };
          }));
        } else {
          // Global brands: add to global list and to all categories' brand lists
          setBrands(prev => {
            const exists = prev.some(b => String(b).toLowerCase() === brandName.toLowerCase());
            if (exists) return prev;
            return [...prev, brandName];
          });
          setCategories(prev => prev.map(c => ({ ...c, brands: Array.from(new Set([...(c.brands || []), brandName])) } as any)));
        }

        return existing[0] as any;
      }

      // Not found — insert
      const payload: any = { name: clean, slug, description: '', metadata: {} };

      // If caller provided a categoryId, prefer to persist it into `category_id` so the brand is scoped.
      // Attempt to resolve the category id first; include it in the payload and fall back if the DB rejects.
      if (categoryId) {
        try {
          const { data: catRow } = await supabase.from('categories').select('id').or(`id.eq.${categoryId},slug.eq.${categoryId},name.eq.${categoryId}`).limit(1).maybeSingle();
          if (catRow && catRow.id) payload.category_id = String(catRow.id);
          else payload.category_id = String(categoryId);
        } catch (err) {
          // If category resolution fails, still set the provided categoryId as a best-effort value
          payload.category_id = String(categoryId);
        }
      }

      // Avoid sending a text `slug` into an `id` column that may be UUID. Only set payload.id when
      // existing brand rows indicate the `id` column uses text keys (non-UUID). If the brand table
      // appears to use UUIDs (common), omit `id` so the DB generates one.
      try {
        const { data: anyBrandRow } = await supabase.from('brands').select('id').limit(1).maybeSingle();
        if (anyBrandRow && anyBrandRow.id) {
          // if existing id is not a UUID, assume text ids are allowed and set slug as id
          if (!isUuid(String(anyBrandRow.id))) payload.id = slug;
        } else {
          // no rows — safer to let DB assign id (do not set)
        }
      } catch (err) {
        // on error, do not set id to avoid sending slug into possible uuid column
        console.debug('Could not inspect brands table id type; omitting client id on insert', err);
      }

      // Try inserting including `category_id` when provided. If the insert fails due to a missing column,
      // retry without `category_id` to preserve compatibility with older schemas.
      let insertRes: any;
      try {
        insertRes = await supabase.from('brands').insert([payload]).select().single();
      } catch (err) {
        // SDK-level error, attempt fallback
        insertRes = { error: err };
      }
      let data = insertRes.data;
      let error = insertRes.error;
      if (error) {
        // If the DB rejected `category_id` (column doesn't exist), retry without it
        const msg = String(error?.message || error || '').toLowerCase();
        if (msg.includes('column') && msg.includes('category_id') || (error?.code === '42703')) {
          const fallback = { ...payload };
          delete fallback.category_id;
          try {
            const res2 = await supabase.from('brands').insert([fallback]).select().single();
            data = res2.data;
            error = res2.error;
          } catch (err2) {
            data = null;
            error = err2;
          }
        }
      }
      if (error) {
        console.warn('Supabase brand insert failed:', error.message || error);
        if ((error as any)?.code === '23505' || String(error?.message || '').toLowerCase().includes('duplicate')) {
          // Conflict: brand already exists (race). Try to fetch the existing row deterministically.
          const { data: fallback } = await supabase.from('brands').select('*').eq('slug', slug).limit(1).maybeSingle();
          if (fallback) {
            const brandName = (fallback as any).name ?? clean;
            const existingBrandId = (fallback as any).id ?? null;
            const existingBrandCategory = (fallback as any).category_id ?? null;

            // If caller provided a categoryId and the DB supports category scoping, try to attach the existing brand
            // to that category. Prefer updating the brands row to set category_id; if that fails (missing column),
            // try creating a category_brands junction row.
            if (categoryId) {
              const desiredCatId = String(categoryId);
              if (existingBrandCategory && String(existingBrandCategory) === desiredCatId) {
                // already scoped correctly
                setCategories(prev => prev.map(c => {
                  if (String(c.id) !== desiredCatId) return c;
                  const existingBrands = Array.isArray(c.brands) ? c.brands : [];
                  const existsInCategory = existingBrands.some(b => String(b).toLowerCase() === brandName.toLowerCase());
                  if (existsInCategory) return c;
                  return { ...c, brands: [...existingBrands, brandName] };
                }));
              } else if (existingBrandId) {
                // Try to update brands.category_id when possible
                try {
                  const { error: updErr } = await supabase.from('brands').update({ category_id: desiredCatId }).eq('id', existingBrandId);
                  if (!updErr) {
                    setCategories(prev => prev.map(c => {
                      if (String(c.id) !== desiredCatId) return c;
                      const existingBrands = Array.isArray(c.brands) ? c.brands : [];
                      const existsInCategory = existingBrands.some(b => String(b).toLowerCase() === brandName.toLowerCase());
                      if (existsInCategory) return c;
                      return { ...c, brands: [...existingBrands, brandName] };
                    }));
                    // Also remove from global list if present
                    setBrands(prev => prev.filter(b => String(b).toLowerCase() !== brandName.toLowerCase()));
                    return fallback as any;
                  }
                } catch (err) {
                  // ignore update failure and fall back to junction table
                }

                // Try junction table fallback
                try {
                  await supabase.from('category_brands').insert([{ category_id: desiredCatId, brand_id: existingBrandId }]);
                  setCategories(prev => prev.map(c => {
                    if (String(c.id) !== desiredCatId) return c;
                    const existingBrands = Array.isArray(c.brands) ? c.brands : [];
                    const existsInCategory = existingBrands.some(b => String(b).toLowerCase() === brandName.toLowerCase());
                    if (existsInCategory) return c;
                    return { ...c, brands: [...existingBrands, brandName] };
                  }));
                  setBrands(prev => prev.filter(b => String(b).toLowerCase() !== brandName.toLowerCase()));
                  return fallback as any;
                } catch (_) {
                  // if fallback fails, continue to global attach below
                }
              }
            }

            // Default: attach as global brand (no category scope)
            setBrands(prev => (prev.some(b => b.toLowerCase() === brandName.toLowerCase()) ? prev : [...prev, brandName]));
            setCategories(prev => prev.map(c => ({ ...c, brands: Array.from(new Set([...(c.brands || []), brandName])) } as any)));
            return fallback as any;
          }
        }
        alert('Failed to create brand: ' + (error.message || String(error)));
        return;
      }

      const brandName = data?.name ?? clean;
      // Determine an effective category scope: prefer the DB-returned `category_id`, fall back to the caller-provided `categoryId`.
      const insertedCategoryId = (data && data.category_id) ? String(data.category_id) : null;
      const effectiveCategoryId = insertedCategoryId ?? (categoryId ? String(categoryId) : null);

      if (effectiveCategoryId) {
        // Attach the new brand only to the effective category locally (do not make it global)
        setCategories(prev => prev.map(c => {
          if (String(c.id) !== String(effectiveCategoryId)) return c;
          const existingBrands = Array.isArray(c.brands) ? c.brands : [];
          const existsInCategory = existingBrands.some(b => String(b).toLowerCase() === brandName.toLowerCase());
          if (existsInCategory) return c;
          return { ...c, brands: [...existingBrands, brandName] };
        }));
      } else {
        // No category scope — treat as global brand
        setBrands(prev => {
          const exists = prev.some(b => String(b).toLowerCase() === brandName.toLowerCase());
          if (exists) return prev;
          return [...prev, brandName];
        });
        setCategories(prev => prev.map(c => ({ ...c, brands: Array.from(new Set([...(c.brands || []), brandName])) } as any)));
      }

      return data as any;
    } catch (e: any) {
      console.warn('Supabase brand write error:', e?.message || e);
      alert('Failed to create brand: ' + (e?.message || String(e)));
    }
  };

    const sanitizeProductPayload = (input: Record<string, any>) => {
      const allowed = new Set([
      'id',
      'name',
      'brand',
      'brand_id',
      'category',
      'category_id',
        'subcategory',
        'subcategory_id',
      'selling_price',
      'market_price',
      'admin_cost',
      'image',
      'images',
      'description',
      'tag',
      'hero',
      'created_at',
      'updated_at',
    ]);

      // Allow the exact detected subcategory DB column name (e.g., 'sub_category_id')
      if (productSubcategoryColumn) {
        allowed.add(productSubcategoryColumn);
      }

    const cleaned: Record<string, any> = {};
    Object.keys(input || {}).forEach((key) => {
      if (allowed.has(key) && input[key] !== undefined && input[key] !== null) {
        cleaned[key] = input[key];
      }
    });

    // The live schema uses: selling_price, market_price, admin_cost, image, images, description.
    // The `price` column has been removed from the database.
    const unsupported = ['price', 'rating', 'reviews', 'original_price', 'skin_type', 'general_price', 'cost', 'store', 'image_url', 'imageUrl', 'title', 'is_best_seller', 'details', 'long_description'];
    unsupported.forEach((key) => delete cleaned[key]);

    return cleaned;
  };

  const mapProductUpdatesToRow = (updates: Partial<Product>) => {
    const row: Record<string, any> = {};

    if (updates.name !== undefined) row.name = updates.name;
    if (updates.brand !== undefined) {
      if (schemaInfo.productsHasBrandId) row.brand_id = updates.brand;
      else row.brand = updates.brand;
    }
    if (updates.category !== undefined) {
      if (schemaInfo.productsHasCategoryId) row.category_id = updates.category;
      else row.category = updates.category;
    }
    if (updates.subcategory !== undefined) {
      // Respect the exact DB column name for subcategory if detected, else fall back to schemaInfo
      if (productSubcategoryColumn) {
        // write to the exact column name
        row[productSubcategoryColumn] = updates.subcategory;
      } else if (schemaInfo.productsHasSubcategoryId) {
        row.subcategory_id = updates.subcategory;
      } else {
        row.subcategory = updates.subcategory;
      }
    }
    const rawSelling = toNumberOrUndefined((updates as any).sellingPrice);
    const rawMarket = toNumberOrUndefined((updates as any).marketPrice ?? (updates as any).originalPrice);
    if (rawSelling !== undefined) row.selling_price = rawSelling;
    if (rawMarket !== undefined) row.market_price = rawMarket;
    if (updates.tag !== undefined) row.tag = updates.tag;
    if (updates.hero !== undefined) row.hero = updates.hero;

    // Map cost if provided (from form.adminCost or updates.cost), using the actual DB column name.
    const rawCost = toNumberOrUndefined((updates as any).adminCost ?? (updates as any).cost);
    if (rawCost !== undefined) {
      row.admin_cost = rawCost;
    }

    const nextImage = (updates as any).image_url ?? (updates as any).image ?? updates.image;
    if ((updates as any).image_url !== undefined || updates.image !== undefined) {
      row.image = normalizeProductImage(nextImage) || null;
      if (row.image) {
        row.images = [row.image];
      } else {
        delete row.images;
      }
    }
    const nextDescription = (updates as any).description ?? (updates as any).details ?? updates.description;
    if ((updates as any).description !== undefined || (updates as any).details !== undefined) row.description = nextDescription;

    row.updated_at = new Date().toISOString();
    return sanitizeProductPayload(row);
  };

  const addProduct = async (prod: Product): Promise<number> => {
    const tempId = Date.now();
    if (!supabase) return tempId;

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr || !authData?.user) {
        alert('Admin sign-in required to create products.');
        return tempId;
      }
      const supaUser = (authData as any).user;
      const { data: profile, error: pfErr } = await supabase.from('profiles').select('id,role,is_admin').eq('id', supaUser.id).single();
      if (pfErr || !(profile && (profile.role === 'admin' || profile.is_admin === true))) {
        alert('Admin sign-in required to create products.');
        return tempId;
      }

      // Prepare payload based on discovered schema (do not probe per-call)
      // Build a strict allowlist to avoid sending stale or unsupported columns to Supabase.
      const payload: any = {};
      payload.name = prod.name;
      const imageValue = (prod as any).image_url ?? (prod as any).image ?? null;
      const descriptionValue = (prod as any).description ?? (prod as any).details ?? null;

      if (schemaInfo.productsHasBrandId) {
        let brandId: any = null;
        if (prod.brand) {
          const created = await addBrand(prod.brand, prod.category || undefined);
          if (created && (created as any).id) brandId = (created as any).id;
          else {
            const slug = slugify(prod.brand || '');
            const { data: found } = await supabase.from('brands').select('id').eq('slug', slug).limit(1).maybeSingle();
            if (found && (found as any).id) brandId = (found as any).id;
          }
        }
        if (brandId) payload.brand_id = brandId;
      } else if (schemaInfo.productsHasBrand) {
        payload.brand = prod.brand ?? null;
      }

      if (schemaInfo.productsHasCategoryId) payload.category_id = prod.category ?? null;
      else if (schemaInfo.productsHasCategory) payload.category = prod.category ?? null;

      // Determine exact subcategory DB value and require a canonical id when persisting
      if (productSubcategoryColumn && /id$/i.test(String(productSubcategoryColumn))) {
        let subId: any = null;
        if (prod.subcategory) {
          if (isUuid(String(prod.subcategory))) subId = String(prod.subcategory);
          else {
            try {
              const { data: found } = await supabase.from('subcategories').select('id').or(`slug.eq.${String(prod.subcategory)},name.eq.${String(prod.subcategory)}`).limit(1).maybeSingle();
              if (found && found.id) subId = String(found.id);
            } catch (e) {
              // ignore resolution errors
            }
          }
        }

        // If caller provided a subcategory value but we couldn't resolve it to an id, fail explicitly
        if (prod.subcategory && !subId) {
          alert('Failed to persist product: selected subcategory could not be resolved to an id. Ensure the subcategory exists in the database.');
          return tempId;
        }

        payload[productSubcategoryColumn] = subId ?? null;
      } else if (schemaInfo.productsHasSubcategory) {
        // legacy fallback (should not be used once migration is applied)
        payload.subcategory = prod.subcategory ?? null;
      }

      const parsedSell = toNumberOrUndefined((prod as any).sellingPrice);
      const parsedMarket = toNumberOrUndefined((prod as any).marketPrice ?? (prod as any).originalPrice);
      const parsedAdmin = toNumberOrUndefined((prod as any).adminCost ?? (prod as any).cost);

      if (parsedSell !== undefined) payload.selling_price = parsedSell;
      if (parsedMarket !== undefined) payload.market_price = parsedMarket;

      let finalImage: string | null = null;
      try {
        finalImage = await uploadImageIfNeeded(imageValue ?? prod.image ?? null);
      } catch (e) {
        console.warn('uploadImageIfNeeded failed for addProduct:', e);
      }
      const finalImageUrl = finalImage || normalizeProductImage(imageValue ?? prod.image ?? null) || null;
      payload.image = finalImageUrl;
      if (finalImageUrl) payload.images = [finalImageUrl];

      payload.description = descriptionValue ?? prod.description ?? null;

      // Map adminCost to the actual product column in the live schema.
      if (parsedAdmin !== undefined) payload.admin_cost = parsedAdmin;

      if (prod.hero !== undefined) payload.hero = prod.hero;
      payload.created_at = new Date().toISOString();
      payload.updated_at = new Date().toISOString();

      const cleanPayload = sanitizeProductPayload(payload);
      try {
        console.debug('DataContext:addProduct payload', cleanPayload);
      } catch (e) {}

      let remoteData: any = null;
      const { data, error } = await supabase.from('products').insert([cleanPayload]).select().single();
      if (error) {
        console.warn('Supabase product insert failed:', error.message || error);
        alert('Failed to create product: ' + (error.message || String(error)));
        return tempId;
      }
      remoteData = data;

      // Map returned row into app Product shape
      const returned = remoteData as any;
      const persistedImage = resolvePersistedProductImage(returned) ?? returned.image ?? null;
      const dbSellingPrice = toNumberOrUndefined(returned.selling_price);
      const dbMarketPrice = toNumberOrUndefined(returned.market_price);
      const dbAdminCost = toNumberOrUndefined(returned.admin_cost);
      // Derive persisted subcategory id from returned row when available
      let returnedSubId: string | null = null;
      if (productSubcategoryColumn && returned[productSubcategoryColumn] !== undefined && returned[productSubcategoryColumn] !== null && String(returned[productSubcategoryColumn]).trim() !== '') {
        if (/id$/i.test(productSubcategoryColumn)) returnedSubId = String(returned[productSubcategoryColumn]);
        else {
          const cand = String(returned[productSubcategoryColumn]).trim();
          returnedSubId = cand && isUuid(cand) ? cand : null;
        }
      } else if (returned.subcategory_id !== undefined && returned.subcategory_id !== null && String(returned.subcategory_id).trim() !== '') {
        returnedSubId = String(returned.subcategory_id);
      } else if (returned.subcategory !== undefined && returned.subcategory !== null && isUuid(String(returned.subcategory))) {
        returnedSubId = String(returned.subcategory);
      }

      const inserted: Product = {
        id: returned.id ?? Date.now(),
        name: returned.name ?? '',
        brand: (schemaInfo.productsHasBrandId ? (returned.brand_id ?? returned.brand) : returned.brand) ?? prod.brand ?? '',
        category: (schemaInfo.productsHasCategoryId ? (returned.category_id ?? returned.category) : returned.category) ?? prod.category ?? null,
        subcategory: (schemaInfo.productsHasSubcategoryId
          ? (returned.subcategory_id !== undefined && returned.subcategory_id !== null ? String(returned.subcategory_id) : (returned.subcategory !== undefined && returned.subcategory !== null ? String(returned.subcategory) : null))
          : (returned.subcategory !== undefined && returned.subcategory !== null ? String(returned.subcategory) : null)) ?? (prod.subcategory !== undefined && prod.subcategory !== null ? String(prod.subcategory) : null),
        subcategoryId: returnedSubId ?? null,
        createdAt: returned.created_at ?? returned.createdAt ?? null,
        originalPrice: dbMarketPrice ?? null,
        sellingPrice: dbSellingPrice ?? null,
        marketPrice: dbMarketPrice ?? null,
        adminCost: dbAdminCost ?? null,
        cost: dbAdminCost ?? null,
        rating: returned.rating ?? 0,
        reviews: returned.reviews ?? 0,
        skinType: returned.skin_type ?? null,
        tag: returned.tag ?? null,
        hero: returned.hero ?? false,
        image: normalizeProductImage(persistedImage),
        description: returned.description ?? null,
      } as any;

      setProducts(prev => [inserted, ...prev.filter(p => p.id !== inserted.id)]);
      return inserted.id;
    } catch (e: any) {
      console.warn('Supabase product write error:', e?.message || e);
      alert('Failed to create product: ' + (e?.message || String(e)));
      return tempId;
    }
  };
  const updateProduct = (id: number, updates: Partial<Product>) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    // send mapped update to remote
    void (async () => {
      try {
        if (!supabase) return;
        // Prepare updates for mapping. If the DB expects a subcategory_id, resolve
        // any incoming subcategory value (slug/name) to the canonical id first.
        const updatesForMapping: Partial<Product> = { ...updates };
        if (schemaInfo.productsHasSubcategoryId && (updatesForMapping as any).subcategory !== undefined && (updatesForMapping as any).subcategory !== null) {
          const rawSub = String((updatesForMapping as any).subcategory);
          if (!isUuid(rawSub)) {
            try {
              const resolved = await resolveSubcategoryId(rawSub);
              if (resolved) (updatesForMapping as any).subcategory = resolved;
              else {
                alert('Failed to update product: provided subcategory could not be resolved to an id.');
                return;
              }
            } catch (e) {
              alert('Failed to update product: could not resolve subcategory.');
              return;
            }
          }
        }

        const row = mapProductUpdatesToRow(updatesForMapping);
        if (Object.keys(row).length === 0) return;

        // If image update is a data/blob URL, upload it first to obtain a persistent public URL
        if ((updates as any).image !== undefined && typeof (updates as any).image === 'string') {
          const imgVal = (updates as any).image;
          if (imgVal.startsWith('data:') || imgVal.startsWith('blob:') || (!/^https?:\/\//i.test(imgVal) && !imgVal.startsWith('/'))) {
            try {
              const uploaded = await uploadImageIfNeeded(imgVal);
              if (uploaded) {
                row.image = uploaded;
                row.images = [uploaded];
              } else {
                delete row.image;
                delete row.images;
              }
            } catch (e) {
              console.warn('Failed to upload image during product update:', e);
              delete row.image;
              delete row.images;
            }
          }
        }

        const { error } = await supabase.from('products').update(row).eq('id', id).select().single();
        if (error && !isMissingColumnError(error)) {
          console.warn('Supabase product update failed:', error.message || error);
          return;
        }

        if (updates.hero !== undefined) {
          await persistBestSellerFlag(id, Boolean(updates.hero));
        }
      } catch (e: any) {
        console.warn('Supabase product update error:', e?.message || e);
      }
    })();
  };
  const deleteProduct = async (id: number) => {
    if (!supabase) return;
    try {
      const ok = await requestConfirm('Delete this product? This action cannot be undone.');
      if (!ok) return;
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) {
        console.warn('Supabase product delete failed:', error.message || error);
        alert('Failed to delete product: ' + (error.message || String(error)));
        return;
      }
      setProducts(prev => prev.filter(p => p.id !== id));
    } catch (e: any) {
      console.warn('Supabase product delete error:', e?.message || e);
      alert('Failed to delete product: ' + (e?.message || String(e)));
    }
  };

  // Admin-only: clear core tables while preserving admin profiles
  const adminClearDatabase = async () => {
    if (!supabase) return;
    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr || !authData?.user) {
        alert('Admin sign-in required to reset database.');
        return;
      }
      const supaUser = (authData as any).user;
      const { data: profile, error: pfErr } = await supabase.from('profiles').select('id,role,is_admin').eq('id', supaUser.id).single();
      if (pfErr || !(profile && (profile.role === 'admin' || profile.is_admin === true))) {
        alert('Admin sign-in required to reset database.');
        return;
      }

      // WARNING: The following deletes are destructive. They remove ALL rows from the listed tables.
      const ok = await requestConfirm('WARNING: This will permanently clear core tables (products, orders, brands, subcategories, categories) and remove non-admin profiles. Proceed?');
      if (!ok) return;
      // Execution order matters to satisfy FK constraints: delete child tables first.
      // 1) products, orders
      await supabase.from('products').delete().neq('id', '');
      await supabase.from('orders').delete().neq('id', '');
      // 2) brands, subcategories
      await supabase.from('brands').delete().neq('id', '');
      await supabase.from('subcategories').delete().neq('id', '');
      // 3) categories
      await supabase.from('categories').delete().neq('id', '');

      // 4) Remove non-admin profiles while preserving admin accounts
      await supabase.from('profiles').delete().not('role', 'eq', 'admin').not('is_admin', 'eq', true);

      // Refresh local state
      setProducts([]);
      setCategories([]);
      setBrands([]);
      setOrders([]);
      console.log('Admin database clear completed');
    } catch (e: any) {
      console.warn('Admin DB clear failed:', e?.message || e);
      alert('Failed to clear database: ' + (e?.message || String(e)));
    }
  };
  const toggleHero = async (id: number) => {
    const currentProduct = products.find((p) => p.id === id);
    const currentBestSeller = Boolean(
      currentProduct?.hero ||
      String(currentProduct?.tag || '').toLowerCase() === 'best seller'
    );
    const nextValue = !currentBestSeller;

    // Optimistic UI update: respond instantly so the star lights up on click.
    setProducts(prev => prev.map((p) => p.id === id ? {
      ...p,
      hero: nextValue,
      tag: nextValue ? 'Best Seller' : (p.tag === 'Best Seller' ? null : p.tag),
    } : p));

    try {
      await persistBestSellerFlag(id, nextValue);
    } catch (e: any) {
      console.warn('Best seller toggle sync failed gracefully:', e?.message || e);
      // Do not undo the optimistic UI update here; preserve the immediate user feedback.
    }
  };

  const updateBrand = async (oldName: string, newName: string) => {
    const clean = String(newName || '').trim();
    if (!clean) return;
    // Optimistic local updates
    setBrands(prev => prev.map(b => b === oldName ? clean : b));
    setCategories(prev => prev.map(c => {
      const existing = Array.isArray(c.brands) ? c.brands : [];
      return {
        ...c,
        brands: existing.map(b => b === oldName ? clean : b),
      };
    }));
    setProducts(prev => prev.map(p => p.brand === oldName ? { ...p, brand: clean } : p));

    if (!supabase) return;
    try {
      // Find the brand row by name to get its id, then update by id to be explicit
      // Attempt to scope update to the category that currently lists this brand to avoid cross-category updates
      const scopedCategory = categories.find(cat => Array.isArray(cat.brands) && cat.brands.some(b => String(b).toLowerCase() === String(oldName).toLowerCase()));
      const brandingQuery = scopedCategory
        ? supabase.from('brands').select('id, category_id').eq('name', oldName).eq('category_id', scopedCategory.id).limit(1).maybeSingle()
        : supabase.from('brands').select('id, category_id').eq('name', oldName).limit(1).maybeSingle();
      const { data: found } = await brandingQuery;
      if (found && found.id) {
        const { error } = await supabase.from('brands').update({ name: clean, slug: slugify(clean) }).eq('id', found.id).select().single();
        if (error) {
          console.warn('Supabase brand update failed:', error.message || error);
          alert('Failed to update brand: ' + (error.message || String(error)));
        }
      } else {
        // fallback: update by name if id not found
        // Fallback: update possibly-ungrouped brand rows by name
        const { error } = await supabase.from('brands').update({ name: clean, slug: slugify(clean) }).eq('name', oldName);
        if (error) {
          console.warn('Supabase brand update failed (fallback):', error.message || error);
          alert('Failed to update brand: ' + (error.message || String(error)));
        }
      }
    } catch (e: any) {
      console.warn('Supabase brand update error', e?.message || e);
      alert('Failed to update brand: ' + (e?.message || String(e)));
    }
  };

  const deleteBrand = async (nameOrId: string) => {
    const target = String(nameOrId || '').trim();
    if (!target) return;

    try {
      const ok = await requestConfirm('Delete this brand? This cannot be undone.');
      if (!ok) return;

      let brandId: string | number | null = null;
      let brandName: string = target;
      let brandSlug: string = slugify(target);

      if (!supabase) {
        const matchBrand = (val: any) => {
          if (!val) return false;
          const s = String(val).trim().toLowerCase();
          return s === target.toLowerCase() || s === brandSlug.toLowerCase();
        };
        setBrands(prev => prev.filter(b => !matchBrand(b)));
        setCategories(prev => prev.map(c => {
          const existing = Array.isArray(c.brands) ? c.brands : [];
          return { ...c, brands: existing.filter(b => !matchBrand(b)) };
        }));
        setProducts(prev => prev.filter(p => !matchBrand(p.brand)));
        return;
      }

      // 1) Find the brand row in Supabase to get its canonical id, name, slug and category scope
      try {
        let foundRow: any = null;
        // Prefer to scope to the category that currently shows this brand locally
        const scopedCategory = categories.find(cat => Array.isArray(cat.brands) && cat.brands.some(b => String(b).toLowerCase() === target.toLowerCase()));

        const tryQueries = [];
        if (isUuid(target)) tryQueries.push(supabase.from('brands').select('id, name, slug, category_id').eq('id', target).limit(1).maybeSingle());
        // If we have a scoped category, prefer brand rows in that category
        if (scopedCategory) {
          tryQueries.push(supabase.from('brands').select('id, name, slug, category_id').eq('name', target).eq('category_id', scopedCategory.id).limit(1).maybeSingle());
          tryQueries.push(supabase.from('brands').select('id, name, slug, category_id').eq('slug', slugify(target)).eq('category_id', scopedCategory.id).limit(1).maybeSingle());
        }
        // Generic fallbacks
        tryQueries.push(supabase.from('brands').select('id, name, slug, category_id').eq('name', target).limit(1).maybeSingle());
        tryQueries.push(supabase.from('brands').select('id, name, slug, category_id').ilike('name', target).limit(1).maybeSingle());
        tryQueries.push(supabase.from('brands').select('id, name, slug, category_id').eq('slug', slugify(target)).limit(1).maybeSingle());

        for (const q of tryQueries) {
          try {
            const { data } = await q;
            if (data) { foundRow = data; break; }
          } catch (_) { /* ignore single query failures */ }
        }

        if (foundRow) {
          brandId = foundRow.id;
          if (foundRow.name) brandName = foundRow.name;
          if (foundRow.slug) brandSlug = foundRow.slug;
        } else if (isUuid(target)) {
          brandId = target;
        }
      } catch (err) {
        console.debug('Error resolving brand before deletion:', err);
      }

      // 2) Clean up referencing rows in junction table if present
      if (brandId) {
        try {
          await supabase.from('category_brands').delete().eq('brand_id', brandId);
        } catch (_) {
          // ignore if junction table does not exist
        }
      }

      // 3) Delete referencing products (by brand_id or brand name) scoped to category when possible
      const scopedCategory = categories.find(cat => Array.isArray(cat.brands) && cat.brands.some(b => String(b).toLowerCase() === target.toLowerCase()));
      if (brandId && schemaInfo.productsHasBrandId) {
        let delQ = supabase.from('products').delete().eq('brand_id', brandId);
        if (scopedCategory) delQ = delQ.eq('category_id', scopedCategory.id);
        const { error: perr } = await delQ;
        if (perr) {
          console.warn('Failed to delete products by brand_id:', perr);
          alert('Failed to delete brand products: ' + (perr.message || String(perr)));
          return;
        }
      }
      if (schemaInfo.productsHasBrand) {
        const brandNamesToDelete = Array.from(new Set([brandName, target].filter(Boolean)));
        for (const bName of brandNamesToDelete) {
          let delQ = supabase.from('products').delete().eq('brand', bName);
            if (scopedCategory) {
              if (schemaInfo.productsHasCategoryId) {
                delQ = delQ.eq('category_id', scopedCategory.id);
              } else if (schemaInfo.productsHasCategory) {
                delQ = delQ.eq('category', scopedCategory.id);
              }
            }
          const { error: perr2 } = await delQ;
          if (perr2) {
            console.warn('Failed to delete products by brand name:', perr2);
            alert('Failed to delete brand products: ' + (perr2.message || String(perr2)));
            return;
          }
        }
      }

      // 4) Execute delete query against brands table
      let delErr: any = null;
      // Track which category (if any) this deleted brand belonged to so we update local state narrowly
      let deletedBrandCategoryId: string | null = null;
      if (brandId) {
        // If this brand row has a category scope, delete only that row; otherwise delete by id
        const { data: brandRow } = await supabase.from('brands').select('category_id').eq('id', brandId).limit(1).maybeSingle();
        if (brandRow && brandRow.category_id) {
          deletedBrandCategoryId = String(brandRow.category_id);
          const { error } = await supabase.from('brands').delete().eq('id', brandId).eq('category_id', brandRow.category_id);
          delErr = error;
        } else {
          // global brand (no category_id)
          const { error } = await supabase.from('brands').delete().eq('id', brandId);
          delErr = error;
        }
      } else {
        // If we have a scopedCategory, delete by name within that category only (tolerant to missing category_id column)
        const scopedCategory = categories.find(cat => Array.isArray(cat.brands) && cat.brands.some(b => String(b).toLowerCase() === target.toLowerCase()));
        if (scopedCategory) {
          deletedBrandCategoryId = scopedCategory.id;
          try {
            const { error } = await supabase.from('brands').delete().eq('name', brandName).eq('category_id', scopedCategory.id);
            // If delete returned a missing-column error, treat as successful local deletion (DB cannot represent scope)
            if (error && isMissingColumnError(error)) {
              delErr = null;
            } else {
              delErr = error;
            }
          } catch (err) {
            // SDK/transport errors - if it's a missing-column issue, ignore; else propagate
            if (String(err).toLowerCase().includes('column') && String(err).toLowerCase().includes('category_id')) {
              delErr = null;
            } else {
              delErr = err;
            }
          }
        } else {
          // global delete by name/slug
          const { error } = await supabase.from('brands').delete().eq('name', brandName);
          delErr = error;
          if (delErr) {
            const { error: slugErr } = await supabase.from('brands').delete().eq('slug', brandSlug);
            delErr = slugErr;
          }
        }
      }
      if (delErr) {
        console.warn('Supabase brand delete failed:', delErr);
        alert('Failed to delete brand: ' + (delErr.message || String(delErr)));
        return;
      }

      // 5) Update local state immediately after successful database deletion
      const matchBrand = (val: any) => {
        if (!val) return false;
        const s = String(val).trim().toLowerCase();
        return (
          s === target.toLowerCase() ||
          (brandName && s === brandName.toLowerCase()) ||
          (brandId != null && s === String(brandId).toLowerCase()) ||
          (brandSlug && s === brandSlug.toLowerCase())
        );
      };

      // Update local state narrowly: if the deleted brand belonged to a specific category, only remove it from that
      // category's `brands` list. If it was a global brand (no category_id), remove from global `brands` and from all categories.
      if (deletedBrandCategoryId) {
        // Remove from the specific category's brand list only
        setCategories(prev => prev.map(c => {
          if (c.id !== deletedBrandCategoryId) return c;
          const existing = Array.isArray(c.brands) ? c.brands : [];
          return { ...c, brands: existing.filter(b => !matchBrand(b)) };
        }));
        // Remove products matching the brand across the category scope
        setProducts(prev => prev.filter(p => !(String(p.category) === String(deletedBrandCategoryId) && matchBrand(p.brand))));
      } else {
        // Global brand deletion: remove from global list and from every category's brand lists
        setBrands(prev => prev.filter(b => !matchBrand(b)));
        setCategories(prev => prev.map(c => {
          const existing = Array.isArray(c.brands) ? c.brands : [];
          return { ...c, brands: existing.filter(b => !matchBrand(b)) };
        }));
        setProducts(prev => prev.filter(p => !matchBrand(p.brand)));
      }
    } catch (e: any) {
      console.warn('Supabase brand delete error:', e?.message || e);
      alert('Failed to delete brand: ' + (e?.message || String(e)));
    }
  };
  

  // Orders
  const addOrder = (order: Omit<Order, 'id' | 'createdAt'> & { createdAt?: number | string }) => {
    const id = Date.now();
    const o: Order = { ...order, id, createdAt: new Date().toISOString(), status: order.status || 'pending' } as Order;
    setOrders(prev => [...prev, o]);
    // Persist order to Supabase (best-effort) with proper mapping
    try {
      if (supabase) {
        (async () => {
          try {
            // Do NOT send a client-generated `id` to Supabase. Let the DB generate UUID via default.
            const payload = {
              name: o.name,
              phone: o.phone,
              governorate: o.governorate || null,
              address: o.address || null,
                    // Ensure we never send a top-level or nested `price` property to the DB
                    items: removePriceKeys(o.items || []),
              total: o.total,
              shipping: (o as any).shipping ?? 0,
              status: o.status || 'pending',
              created_at: new Date().toISOString(),
            } as any;

            const { data, error } = await supabase.from('orders').insert([payload]).select();
            if (error) {
              console.warn('Supabase order insert failed:', error.message || error);
              if ((error as any)?.message?.toLowerCase().includes('permission')) {
                console.warn('Possible RLS or permission issue: ensure anon role can insert orders or use a server-side function.');
              }
            } else {
              // optionally sync representation
              if (Array.isArray(data) && data[0]) {
                const returned = data[0] as any;
                setOrders(prev => prev.map(p => p.id === o.id ? ({ ...p, id: returned.id, createdAt: returned.created_at || p.createdAt }) : p));
              }
            }
          } catch (e: any) {
            console.warn('Supabase order write error:', e?.message || e);
          }
        })();
      }
    } catch (e) {
      console.warn('Supabase order write error', e);
    }
    return id;
  };
  const updateOrder = (id: number, updates: Partial<Order>) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, ...updates } : o));
    try {
      if (supabase) {
        (async () => {
          try {
            // Remove any `price` keys from updates.items before sending to Supabase
            const cleaned = { ...updates } as any;
            if (cleaned.items) cleaned.items = removePriceKeys(cleaned.items);
            await supabase.from('orders').update(cleaned).eq('id', id);
          } catch (e) {
            console.warn('Supabase order update failed', e);
          }
        })();
      }
    } catch (e) {
      console.warn('Supabase order update error', e);
    }
  };
  const deleteOrder = async (id: number) => {
    try {
      const ok = await requestConfirm('Delete this order? This cannot be undone.');
      if (!ok) return;
    } catch (e) {
      return;
    }
    setOrders(prev => prev.filter(o => o.id !== id));
    try {
      if (supabase) {
        (async () => {
          try {
            await supabase.from('orders').delete().eq('id', id);
          } catch (e) {
            console.warn('Supabase order delete failed', e);
          }
        })();
      }
    } catch (e) {
      console.warn('Supabase order delete error', e);
    }
  };

  const getBrandsForCategory = (categoryId: string) => {
    if (!categoryId) return [] as string[];
    const cat = categories.find(c => String(c.id) === String(categoryId));
    if (cat && Array.isArray(cat.brands) && cat.brands.length > 0) return cat.brands;

    // Fallback: derive from products belonging to this category and global brands list
    const productBrandSet = new Set(products.filter(p => String(p.category) === String(categoryId)).map(p => String(p.brand || '')));
    const derived = Array.from(productBrandSet).filter(Boolean);
    if (derived.length > 0) return derived;

    // final fallback: return empty array
    return [] as string[];
  };

  return (
    <DataContext.Provider value={{ categories, brands, products, priceRanges, orders, getBrandsForCategory, actions: { addCategory, updateCategory, deleteCategory, addSubcategory, updateSubcategory, deleteSubcategory, addBrand, updateBrand, deleteBrand, addProduct, updateProduct, deleteProduct, toggleHero, addOrder, updateOrder, deleteOrder, adminClearDatabase } }}>
      {children}
      <ConfirmModal open={confirmState.open} message={confirmState.message} onConfirm={handleConfirm} onCancel={handleCancel} />
    </DataContext.Provider>
  );
}

export const useData = () => { const ctx = useContext(DataContext); if (!ctx) throw new Error('useData must be used within DataProvider'); return ctx; };

export default DataContext;
