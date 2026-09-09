import React, { createContext, useContext, useEffect, useState } from 'react';
import ConfirmModal from '../components/ConfirmModal';
import supabase from '../lib/supabase';
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
// Confirmed columns: id, name, category_id (UUID FK), brand (text), price,
//   original_price, selling_price, market_price, admin_cost, image, description,
//   rating, reviews, skin_type, tag, hero, created_at, updated_at.
// Columns that do NOT exist: category (plain text), subcategory_id, subcategory, brand_id.
const PRODUCT_SCHEMA = {
  productsHasCategoryId: true,
  productsHasCategory: false,
  productsHasSubcategoryId: false,
  productsHasSubcategory: false,
  productsHasBrandId: false,
  productsHasBrand: true,
} as const;

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
    .filter((sub) => sub?.category_id === row?.id)
    .map((sub) => ({
      id: sub?.id ?? sub?.slug ?? String(sub?.name || 'subcategory'),
      label: sub?.name ?? sub?.label ?? sub?.slug ?? '',
    })),
  brands: (brandRows || [])
    .filter((brand) => brand?.category_id === row?.id || (!brand?.category_id && row?.id))
    .map((brand) => String(brand?.name ?? brand?.label ?? brand?.slug ?? ''))
    .filter(Boolean),
});

const resolvePrice = (primary: any, secondary: any) => {
  const numPrimary = primary !== null && primary !== undefined ? Number(primary) : null;
  const numSecondary = secondary !== null && secondary !== undefined ? Number(secondary) : null;
  if (numPrimary !== null && !isNaN(numPrimary) && numPrimary > 0) return numPrimary;
  if (numSecondary !== null && !isNaN(numSecondary) && numSecondary > 0) return numSecondary;
  if (numPrimary !== null && !isNaN(numPrimary)) return numPrimary;
  if (numSecondary !== null && !isNaN(numSecondary)) return numSecondary;
  return null;
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
        const nextBrands = Array.isArray(brandsData)
          ? (brandsData as any[])
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

        if (Array.isArray(productsData) && productsData.length > 0) {
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

            // resolve subcategory: prefer subcategory_id, else try to map slug/name -> id within fetched subcategories
            let subVal: any = r.subcategory_id ?? r.subcategory ?? null;
            if (subVal && typeof subVal === 'string' && Array.isArray(subcategoriesData)) {
              const found = (subcategoriesData as any[]).find((s: any) => s.id === subVal || String(s.slug) === String(subVal) || String(s.name) === String(subVal));
              if (found) subVal = found.id;
            }

            return {
              id: r.id ?? Date.now(),
              name: r.name ?? r.label ?? '',
              brand: r.brand ?? r.brand_name ?? '',
              createdAt: r.created_at ?? r.createdAt ?? null,
              category: categoryVal ?? null,
              subcategory: subVal ?? null,
              originalPrice: r.original_price != null ? Number(r.original_price) : (r.market_price != null ? Number(r.market_price) : null),
              sellingPrice: r.selling_price != null ? Number(r.selling_price) : null,
              marketPrice: r.market_price != null ? Number(r.market_price) : null,
              adminCost: r.admin_cost != null ? Number(r.admin_cost) : null,
              price: r.price != null ? Number(r.price) : 0,
              rating: r.rating ?? 0,
              reviews: r.reviews ?? 0,
              skinType: r.skin_type ?? null,
              tag: r.tag ?? null,
              hero: r.hero ?? false,
              image: r.image ?? null,
              description: r.description ?? null,
            } as any;
          });
          setProducts(normalized as any);
        }
        // Supabase is the source of truth — replace local lists
        setCategories(nextCategories);
        setBrands(nextBrands);
        // Determine whether brands are scoped to categories (brands have category_id) or global
        const detectedBrandsHaveCategory = Array.isArray(brandsData) && (brandsData as any[]).some(b => b && Object.prototype.hasOwnProperty.call(b, 'category_id'));
        setBrandsHaveCategory(detectedBrandsHaveCategory);

        // Replace categories' brand lists depending on schema: if brands are scoped, filter by category_id; else treat brands as global
        if (detectedBrandsHaveCategory) {
          setCategories(prev => prev.map(cat => ({ ...cat, brands: (brandsData as any[]).filter(b => b.category_id === cat.id).map(b => String(b.name)) } as any)));
        } else {
          // global brands: attach same brand list to all categories
          setCategories(prev => prev.map(cat => ({ ...cat, brands: nextBrands } as any)));
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
  }, []);

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
    if (!supabase) return;
    // Confirm with admin before destructive delete
    try {
      const ok = await requestConfirm('Delete this category and all its sub-items? This cannot be undone.');
      if (!ok) return;
    } catch (e) {
      return;
    }
    try {
      // 1) Delete products belonging to this category (try both category_id and category columns)
      if (schemaInfo.productsHasCategoryId) {
        const { error: prodErr1 } = await supabase.from('products').delete().eq('category_id', id);
        if (prodErr1) {
          console.warn('Failed to delete products by category_id before deleting category:', prodErr1);
          alert('Failed to delete category products: ' + (prodErr1.message || String(prodErr1)));
          return;
        }
      }
      // also attempt delete by plain category column when present
      if (schemaInfo.productsHasCategory) {
        const { error: prodErr2 } = await supabase.from('products').delete().eq('category', id);
        if (prodErr2) {
          console.warn('Failed to delete products by category before deleting category:', prodErr2);
          alert('Failed to delete category products: ' + (prodErr2.message || String(prodErr2)));
          return;
        }
      }

      // 2) Delete subcategories and (if applicable) brands scoped to this category to avoid orphan rows
      const { error: subErr } = await supabase.from('subcategories').delete().eq('category_id', id);
      if (subErr) {
        console.warn('Failed to delete subcategories for category:', subErr);
        alert('Failed to delete category subcategories: ' + (subErr.message || String(subErr)));
        return;
      }
      // The brands table may not have a category_id column in this schema. Only attempt to delete
      // brands scoped by category if the runtime-detected flag `brandsHaveCategory` is true.
      if (brandsHaveCategory) {
        const { error: brandErr } = await supabase.from('brands').delete().eq('category_id', id);
        if (brandErr) {
          console.warn('Failed to delete brands for category:', brandErr);
          alert('Failed to delete category brands: ' + (brandErr.message || String(brandErr)));
          return;
        }
      } else {
        // Brands are global or independent — do not delete brand rows when removing a category.
        // If a cleanup of brand names tied to this category is desired, implement a name-based delete
        // or a separate relation migration. For safety, skip deletion here.
        console.debug('Brands table has no category_id column; skipping brand delete.');
      }

      // 3) Delete the category row itself
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) {
        console.warn('Supabase category delete failed:', error);
        alert('Failed to delete category: ' + (error.message || String(error)));
        return;
      }

      // remove local only after successful delete
      setCategories(prev => prev.filter(c => c.id !== id));
      setProducts(prev => prev.filter(p => p.category !== id));
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

      // 2) Delete subcategory row
      const { error } = await supabase.from('subcategories').delete().eq('id', subId);
      if (error) {
        console.warn('Supabase subcategory delete failed:', error);
        alert('Failed to delete subcategory: ' + (error.message || String(error)));
        return;
      }

      // 3) Update local state
      setCategories(prev => prev.map(c => c.id === categoryId ? { ...c, subcategories: c.subcategories.filter(s => s.id !== subId) } : c ));
      setProducts(prev => prev.filter(p => !(p.category === categoryId && p.subcategory === subId)));
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
        // Ensure local state includes this brand
        setBrands(prev => {
          const exists = prev.some(b => String(b).toLowerCase() === brandName.toLowerCase());
          if (exists) return prev;
          return [...prev, brandName];
        });
        if (hasCategoryId && categoryId) {
          setCategories(prev => prev.map(c => {
            if (c.id !== categoryId) return c;
            const existingBrands = Array.isArray(c.brands) ? c.brands : [];
            const existsInCategory = existingBrands.some(b => String(b).toLowerCase() === brandName.toLowerCase());
            if (existsInCategory) return c;
            return { ...c, brands: [...existingBrands, brandName] };
          }));
        } else {
          setCategories(prev => prev.map(c => ({ ...c, brands: Array.from(new Set([...(c.brands || []), brandName])) } as any)));
        }
        return existing[0] as any;
      }

      // Not found — insert
      const payload: any = { name: clean, slug, description: '', metadata: {} };

      // Helper to test UUID shape
      const isUuid = (v: string | undefined | null) => {
        if (!v) return false;
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v));
      };

      // Resolve and only set category_id when it is a valid UUID or can be resolved to one
      if (hasCategoryId && categoryId) {
        if (isUuid(categoryId)) {
          payload.category_id = categoryId;
        } else {
          // try to resolve a slug/name -> id from categories table
          try {
            const { data: catRow } = await supabase.from('categories').select('id').or(`slug.eq.${categoryId},name.eq.${categoryId}`).limit(1).maybeSingle();
            if (catRow && catRow.id && isUuid(catRow.id)) payload.category_id = catRow.id;
          } catch (err) {
            // resolution failed — omit category_id to avoid inserting invalid uuid text
            console.debug('Could not resolve category slug to UUID for brand insert:', err);
          }
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

      const { data, error } = await supabase.from('brands').insert([payload]).select().single();
      if (error) {
        console.warn('Supabase brand insert failed:', error.message || error);
        if ((error as any)?.code === '23505' || String(error?.message || '').toLowerCase().includes('duplicate')) {
          // Conflict: brand already exists (race). Try to fetch the existing row deterministically.
          const { data: fallback } = await supabase.from('brands').select('*').eq('slug', slug).limit(1).maybeSingle();
          if (fallback) {
            const brandName = (fallback as any).name ?? clean;
            setBrands(prev => (prev.some(b => b.toLowerCase() === brandName.toLowerCase()) ? prev : [...prev, brandName]));
            return fallback as any;
          }
        }
        alert('Failed to create brand: ' + (error.message || String(error)));
        return;
      }

      const brandName = data?.name ?? clean;
      setBrands(prev => {
        const exists = prev.some(b => String(b).toLowerCase() === brandName.toLowerCase());
        if (exists) return prev;
        return [...prev, brandName];
      });

      if (hasCategoryId && categoryId) {
        setCategories(prev => prev.map(c => {
          if (c.id !== categoryId) return c;
          const existingBrands = Array.isArray(c.brands) ? c.brands : [];
          const existsInCategory = existingBrands.some(b => String(b).toLowerCase() === brandName.toLowerCase());
          if (existsInCategory) return c;
          return { ...c, brands: [...existingBrands, brandName] };
        }));
      } else {
        setCategories(prev => prev.map(c => ({ ...c, brands: Array.from(new Set([...(c.brands || []), brandName])) } as any)));
      }

      return data as any;
    } catch (e: any) {
      console.warn('Supabase brand write error:', e?.message || e);
      alert('Failed to create brand: ' + (e?.message || String(e)));
    }
  };

  const mapProductUpdatesToRow = (updates: Partial<Product>) => {
    const row: Record<string, any> = {};
    if (updates.name !== undefined) row.name = updates.name;
    if (updates.brand !== undefined) {
      if (schemaInfo.productsHasBrandId) row.brand_id = updates.brand;
      else if (schemaInfo.productsHasBrand) row.brand = updates.brand;
      else row.brand = updates.brand;
    }
    if (updates.category !== undefined) {
      if (schemaInfo.productsHasCategoryId) row.category_id = updates.category;
      else if (schemaInfo.productsHasCategory) row.category = updates.category;
      // else: neither column confirmed — skip to avoid 400 on update
    }
    if (updates.subcategory !== undefined) {
      if (schemaInfo.productsHasSubcategoryId) row.subcategory_id = updates.subcategory;
      else if (schemaInfo.productsHasSubcategory) row.subcategory = updates.subcategory;
      // else: neither column confirmed — skip to avoid 400 on update
    }
    if ((updates as any).originalPrice !== undefined) row.original_price = (updates as any).originalPrice;
    if ((updates as any).sellingPrice !== undefined) row.selling_price = (updates as any).sellingPrice;
    if ((updates as any).marketPrice !== undefined) row.market_price = (updates as any).marketPrice;
    if ((updates as any).adminCost !== undefined) row.admin_cost = (updates as any).adminCost;
    if (updates.price !== undefined) row.price = updates.price;
    if (updates.rating !== undefined) row.rating = updates.rating;
    if (updates.reviews !== undefined) row.reviews = updates.reviews;
    if (updates.skinType !== undefined) row.skin_type = updates.skinType;
    if (updates.tag !== undefined) row.tag = updates.tag;
    if (updates.hero !== undefined) row.hero = updates.hero;
    if (updates.image !== undefined) row.image = updates.image;
    if (updates.description !== undefined) row.description = updates.description;
    row.updated_at = new Date().toISOString();
    return row;
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
      const payload: any = {};
      payload.name = prod.name;

      // Handle brand: if DB expects brand_id, ensure brand exists in brands table and use its id
      if (schemaInfo.productsHasBrandId) {
        let brandId: any = null;
        if (prod.brand) {
          // Ensure brand exists, creating it when necessary (addBrand avoids duplicates)
          const created = await addBrand(prod.brand, prod.category || undefined);
          // created may be a brand row
          if (created && (created as any).id) brandId = (created as any).id;
          else {
            // Try to find brand by slug/name
            const slug = slugify(prod.brand || '');
            const { data: found } = await supabase.from('brands').select('id').eq('slug', slug).limit(1).maybeSingle();
            if (found && (found as any).id) brandId = (found as any).id;
          }
        }
        if (brandId) payload.brand_id = brandId;
      } else if (schemaInfo.productsHasBrand) {
        payload.brand = prod.brand ?? null;
      }

      // Category mapping
      if (schemaInfo.productsHasCategoryId) payload.category_id = prod.category ?? null;
      else if (schemaInfo.productsHasCategory) payload.category = prod.category ?? null;

      // Subcategory mapping
      if (schemaInfo.productsHasSubcategoryId) payload.subcategory_id = prod.subcategory ?? null;
      else if (schemaInfo.productsHasSubcategory) payload.subcategory = prod.subcategory ?? null;

      payload.price = (prod as any).price ?? null;
      payload.selling_price = (prod as any).sellingPrice ?? (prod as any).price ?? null;
      payload.market_price = (prod as any).marketPrice ?? null;
      payload.admin_cost = (prod as any).adminCost ?? null;
      payload.image = prod.image ?? null;
      payload.description = prod.description ?? null;

      const { data, error } = await supabase.from('products').insert([payload]).select().single();
      if (error) {
        console.warn('Supabase product insert failed:', error.message || error);
        alert('Failed to create product: ' + (error.message || String(error)));
        return tempId;
      }

      // Map returned row into app Product shape
      const returned = data as any;
      const inserted: Product = {
        id: returned.id ?? Date.now(),
        name: returned.name ?? '',
        brand: (schemaInfo.productsHasBrandId ? (returned.brand_id ?? returned.brand) : returned.brand) ?? prod.brand ?? '',
        category: (schemaInfo.productsHasCategoryId ? (returned.category_id ?? returned.category) : returned.category) ?? prod.category ?? null,
        subcategory: (schemaInfo.productsHasSubcategoryId ? (returned.subcategory_id ?? returned.subcategory) : returned.subcategory) ?? prod.subcategory ?? null,
        createdAt: returned.created_at ?? returned.createdAt ?? null,
        originalPrice: returned.original_price != null ? Number(returned.original_price) : (returned.market_price != null ? Number(returned.market_price) : null),
        sellingPrice: resolvePrice(returned.selling_price, returned.price),
        marketPrice: returned.market_price != null ? Number(returned.market_price) : null,
        adminCost: returned.admin_cost != null ? Number(returned.admin_cost) : null,
        price: resolvePrice(returned.price, returned.selling_price) ?? 0,
        rating: returned.rating ?? 0,
        reviews: returned.reviews ?? 0,
        skinType: returned.skin_type ?? null,
        tag: returned.tag ?? null,
        hero: returned.hero ?? false,
        image: returned.image ?? null,
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
        const row = mapProductUpdatesToRow(updates);
        if (Object.keys(row).length === 0) return;
        const { error } = await supabase.from('products').update(row).eq('id', id).select().single();
        if (error) {
          console.warn('Supabase product update failed:', error.message || error);
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
  const toggleHero = (id: number) => setProducts(prev => prev.map(p => p.id === id ? { ...p, hero: !p.hero } : p));

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
      const { data: found } = await supabase.from('brands').select('id').eq('name', oldName).limit(1).maybeSingle();
      if (found && found.id) {
        const { error } = await supabase.from('brands').update({ name: clean, slug: slugify(clean) }).eq('id', found.id).select().single();
        if (error) {
          console.warn('Supabase brand update failed:', error.message || error);
          alert('Failed to update brand: ' + (error.message || String(error)));
        }
      } else {
        // fallback: update by name if id not found
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

  const deleteBrand = async (name: string) => {
    if (!supabase) return;
    try {
      const ok = await requestConfirm('Delete this brand? This cannot be undone.');
      if (!ok) return;
      
      // Find brand row to get its id (if any)
      let brandId: any = null;
      try {
        const { data: found } = await supabase.from('brands').select('id').eq('name', name).limit(1).maybeSingle();
        if (found && found.id) brandId = found.id;
      } catch (err) {
        // ignore — we'll fall back to deleting by name
      }

      // 1) Delete products referencing this brand (by id or by name)
      if (brandId && schemaInfo.productsHasBrandId) {
        const { error: perr } = await supabase.from('products').delete().eq('brand_id', brandId);
        if (perr) {
          console.warn('Failed to delete products by brand_id:', perr);
          alert('Failed to delete brand products: ' + (perr.message || String(perr)));
          return;
        }
      }
      // Also try deleting by brand name column if present
      if (schemaInfo.productsHasBrand) {
        const { error: perr2 } = await supabase.from('products').delete().eq('brand', name);
        if (perr2) {
          console.warn('Failed to delete products by brand name:', perr2);
          alert('Failed to delete brand products: ' + (perr2.message || String(perr2)));
          return;
        }
      }

      // 2) Delete brand row itself (prefer id when available)
      let delErr = null as any;
      if (brandId) {
        const { error } = await supabase.from('brands').delete().eq('id', brandId);
        delErr = error;
      } else {
        const { error } = await supabase.from('brands').delete().eq('name', name);
        delErr = error;
      }
      if (delErr) {
        console.warn('Supabase brand delete failed:', delErr);
        alert('Failed to delete brand: ' + (delErr.message || String(delErr)));
        return;
      }

      // 3) Update local state after successful DB deletes
      setBrands(prev => prev.filter(b => b !== name));
      setCategories(prev => prev.map(c => {
        const existing = Array.isArray(c.brands) ? c.brands : [];
        return { ...c, brands: existing.filter(b => b !== name) };
      }));
      setProducts(prev => prev.filter(p => p.brand !== name && p.brand !== brandId));
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
              items: o.items || [],
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
            await supabase.from('orders').update({ ...updates }).eq('id', id);
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

  return (
    <DataContext.Provider value={{ categories, brands, products, priceRanges, orders, actions: { addCategory, updateCategory, deleteCategory, addSubcategory, updateSubcategory, deleteSubcategory, addBrand, updateBrand, deleteBrand, addProduct, updateProduct, deleteProduct, toggleHero, addOrder, updateOrder, deleteOrder, adminClearDatabase } }}>
      {children}
      <ConfirmModal open={confirmState.open} message={confirmState.message} onConfirm={handleConfirm} onCancel={handleCancel} />
    </DataContext.Provider>
  );
}

export const useData = () => { const ctx = useContext(DataContext); if (!ctx) throw new Error('useData must be used within DataProvider'); return ctx; };

export default DataContext;
