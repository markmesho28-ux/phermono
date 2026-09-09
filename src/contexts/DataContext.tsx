import React, { createContext, useContext, useEffect, useState } from 'react';
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
  id: row?.id ?? row?.slug ?? String(row?.name || 'category'),
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

const mapSubcategoryRow = (row: any): CategorySubcategory => ({
  id: row?.id ?? row?.slug ?? String(row?.name || 'subcategory'),
  label: row?.name ?? row?.label ?? row?.slug ?? '',
});

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

        const normalizedSubcategories = Array.isArray(subcategoriesData) ? subcategoriesData.map(mapSubcategoryRow) : [];
        const nextCategories = Array.isArray(categoriesData)
          ? categoriesData.map((row) => mapCategoryRow(row, normalizedSubcategories, brandsData || []))
          : [];

        const nextBrands = Array.isArray(brandsData)
          ? Array.from(new Set((brandsData as any[]).map((brand) => String(brand?.name ?? '')).filter(Boolean)))
          : [];

        if (Array.isArray(productsData) && productsData.length > 0) {
          // Normalize product rows from DB into the app's Product shape.
          const normalized = (productsData as any[]).map((r) => {
            return {
              id: r.id ?? Date.now(),
              name: r.name ?? r.label ?? '',
              brand: r.brand ?? r.brand_name ?? '',
              // products table may use category_id; map it to `category` which the UI expects
              category: r.category_id ?? r.category ?? null,
              // subcategory may be stored as `subcategory` or `subcategory_id`
              subcategory: r.subcategory ?? r.subcategory_id ?? null,
              originalPrice: r.original_price ?? r.market_price ?? null,
              sellingPrice: r.selling_price ?? r.price ?? null,
              marketPrice: r.market_price ?? null,
              adminCost: r.admin_cost ?? null,
              price: r.price ?? null,
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
        if (nextCategories.length > 0) {
          setCategories(nextCategories);
        }
        if (nextBrands.length > 0) {
          setBrands(nextBrands);
        }
        // Determine whether brands are scoped to categories (brands have category_id) or global
        const brandsHaveCategory = Array.isArray(brandsData) && (brandsData as any[]).some(b => b && b.hasOwnProperty('category_id'));
        // Replace categories' brand lists depending on schema: if brands are scoped, filter by category_id; else treat brands as global
        if (brandsHaveCategory) {
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

      const payload: any = { name: label, slug: slugify(label), description: '', metadata: {} };
      const { data, error } = await supabase.from('categories').insert([payload]).select().single();
      if (error) {
        console.warn('Supabase category insert failed:', error.message || error);
        alert('Failed to create category: ' + (error.message || String(error)));
        return;
      }

      const newCategory: Category = {
        ...cat,
        id: data?.id ?? cat.id,
        label: data?.name ?? label,
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
  const updateCategory = (id: string, updates: Partial<Category>) => setCategories(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  const deleteCategory = (id: string) => { setCategories(prev => prev.filter(c => c.id !== id)); setProducts(prev => prev.filter(p => p.category !== id)); };

  // Subcategories
  const addSubcategory = async (categoryId: string, sub: CategorySubcategory) => {
    const label = String(sub?.label || '').trim();
    if (!label || !supabase) return;

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr || !authData?.user) {
        alert('Admin sign-in required to create subcategories.');
        return;
      }
      const supaUser = (authData as any).user;
      const { data: profile, error: pfErr } = await supabase.from('profiles').select('id,role,is_admin').eq('id', supaUser.id).single();
      if (pfErr || !(profile && (profile.role === 'admin' || profile.is_admin === true))) {
        alert('Admin sign-in required to create subcategories.');
        return;
      }

      const payload: any = { category_id: categoryId, name: label, slug: slugify(label), description: '', metadata: {} };
      const { data, error } = await supabase.from('subcategories').insert([payload]).select().single();
      if (error) {
        console.warn('Supabase subcategory insert failed:', error.message || error);
        alert('Failed to create subcategory: ' + (error.message || String(error)));
        return;
      }

      const inbound = { id: data?.id ?? sub.id, label: data?.name ?? label };
      setCategories(prev => prev.map(c => {
        if (c.id !== categoryId) return c;
        return { ...c, subcategories: [...(Array.isArray(c.subcategories) ? c.subcategories : []).filter(item => item.id !== inbound.id), inbound] } as any;
      }));
    } catch (e: any) {
      console.warn('Supabase subcategory write error:', e?.message || e);
      alert('Failed to create subcategory: ' + (e?.message || String(e)));
    }
  };
  const updateSubcategory = (categoryId: string, subId: string, updates: Partial<CategorySubcategory>) => setCategories(prev => prev.map(c => {
    if (c.id !== categoryId) return c;
    return { ...c, subcategories: c.subcategories.map(s => s.id === subId ? { ...s, ...updates } : s) };
  }));
  const deleteSubcategory = (categoryId: string, subId: string) => { setCategories(prev => prev.map(c => c.id === categoryId ? { ...c, subcategories: c.subcategories.filter(s => s.id !== subId) } : c )); setProducts(prev => prev.filter(p => !(p.category === categoryId && p.subcategory === subId))); };

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

      const { data: sampleData } = await supabase.from('brands').select('*').limit(1);
      const hasCategoryId = Array.isArray(sampleData) && sampleData.length > 0 && Object.prototype.hasOwnProperty.call(sampleData[0], 'category_id');

      const payload: any = { name: clean, slug: slugify(clean), description: '', metadata: {} };
      if (hasCategoryId && categoryId) payload.category_id = categoryId;

      const { data, error } = await supabase.from('brands').insert([payload]).select().single();
      if (error) {
        console.warn('Supabase brand insert failed:', error.message || error);
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
          const existing = Array.isArray(c.brands) ? c.brands : [];
          const existsInCategory = existing.some(b => String(b).toLowerCase() === brandName.toLowerCase());
          if (existsInCategory) return c;
          return { ...c, brands: [...existing, brandName] };
        }));
      } else {
        setCategories(prev => prev.map(c => ({ ...c, brands: Array.from(new Set([...(c.brands || []), brandName])) } as any)));
      }
    } catch (e: any) {
      console.warn('Supabase brand write error:', e?.message || e);
      alert('Failed to create brand: ' + (e?.message || String(e)));
    }
  };

  const mapProductUpdatesToRow = (updates: Partial<Product>) => {
    const row: Record<string, any> = {};
    if (updates.name !== undefined) row.name = updates.name;
    if (updates.brand !== undefined) row.brand = updates.brand;
    if (updates.category !== undefined) row.category_id = updates.category;
    if (updates.subcategory !== undefined) row.subcategory_id = updates.subcategory;
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

  const addProduct = async (prod: Product) => {
    const id = Date.now();
    const newProd: Product = { ...prod, id };
    setProducts(prev => [newProd, ...prev]);
    if (prod.brand && prod.category) {
      void addBrand(prod.brand, prod.category);
    }

    if (!supabase) return id;

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr || !authData?.user) {
        alert('Admin sign-in required to create products.');
        return id;
      }
      const supaUser = (authData as any).user;
      const { data: profile, error: pfErr } = await supabase.from('profiles').select('id,role,is_admin').eq('id', supaUser.id).single();
      if (pfErr || !(profile && (profile.role === 'admin' || profile.is_admin === true))) {
        alert('Admin sign-in required to create products.');
        return id;
      }

      const { data: sampleData } = await supabase.from('products').select('*').limit(1);
      const hasCategoryId = Array.isArray(sampleData) && sampleData.length > 0 && Object.prototype.hasOwnProperty.call(sampleData[0], 'category_id');
      const hasSubcategoryId = Array.isArray(sampleData) && sampleData.length > 0 && Object.prototype.hasOwnProperty.call(sampleData[0], 'subcategory_id');

      const payload: any = {};
      payload.name = newProd.name;
      payload.brand = newProd.brand;
      if (hasCategoryId) payload.category_id = newProd.category; else payload.category = newProd.category;
      if (hasSubcategoryId) payload.subcategory_id = newProd.subcategory; else payload.subcategory = newProd.subcategory;
      payload.price = (newProd as any).price ?? null;
      payload.image = newProd.image ?? null;
      payload.description = newProd.description ?? null;

      const { data, error } = await supabase.from('products').insert([payload]).select().single();
      if (error) {
        console.warn('Supabase product insert failed:', error.message || error);
        alert('Failed to create product: ' + (error.message || String(error)));
        return id;
      }

      const inserted: Product = { ...newProd, id: data?.id ?? newProd.id };
      setProducts(prev => [...prev.filter(item => item.id !== inserted.id), inserted]);
      return inserted.id;
    } catch (e: any) {
      console.warn('Supabase product write error:', e?.message || e);
      alert('Failed to create product: ' + (e?.message || String(e)));
      return id;
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
  const deleteProduct = (id: number) => {
    setProducts(prev => prev.filter(p => p.id !== id));
    void (async () => {
      try {
        if (!supabase) return;
        const { error } = await supabase.from('products').delete().eq('id', id);
        if (error) console.warn('Supabase product delete failed:', error.message || error);
      } catch (e: any) {
        console.warn('Supabase product delete error:', e?.message || e);
      }
    })();
  };
  const toggleHero = (id: number) => setProducts(prev => prev.map(p => p.id === id ? { ...p, hero: !p.hero } : p));

  const updateBrand = (oldName: string, newName: string) => {
    const clean = String(newName || '').trim();
    if (!clean) return;
    setBrands(prev => prev.map(b => b === oldName ? clean : b));
    setCategories(prev => prev.map(c => {
      const existing = Array.isArray(c.brands) ? c.brands : [];
      return {
        ...c,
        brands: existing.map(b => b === oldName ? clean : b),
      };
    }));
    setProducts(prev => prev.map(p => p.brand === oldName ? { ...p, brand: clean } : p));
    try {
      if (supabase) {
        (async () => {
          try {
            await supabase.from('brands').update({ name: clean }).eq('name', oldName);
          } catch (e: any) {
            console.warn('Supabase brand update failed:', e?.message || e);
          }
        })();
      }
    } catch (e) {
      console.warn('Supabase brand update error', e);
    }
  };

  const deleteBrand = (name: string) => {
    setBrands(prev => prev.filter(b => b !== name));
    setCategories(prev => prev.map(c => {
      const existing = Array.isArray(c.brands) ? c.brands : [];
      return { ...c, brands: existing.filter(b => b !== name) };
    }));
    setProducts(prev => prev.map(p => p.brand === name ? { ...p, brand: '' } : p));
    try {
      if (supabase) {
        (async () => {
          try {
            await supabase.from('brands').delete().eq('name', name);
          } catch (e: any) {
            console.warn('Supabase brand delete failed:', e?.message || e);
          }
        })();
      }
    } catch (e) {
      console.warn('Supabase brand delete error', e);
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
  const deleteOrder = (id: number) => {
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
    <DataContext.Provider value={{ categories, brands, products, priceRanges, orders, actions: { addCategory, updateCategory, deleteCategory, addSubcategory, updateSubcategory, deleteSubcategory, addBrand, updateBrand, deleteBrand, addProduct, updateProduct, deleteProduct, toggleHero, addOrder, updateOrder, deleteOrder } }}>
      {children}
    </DataContext.Provider>
  );
}

export const useData = () => { const ctx = useContext(DataContext); if (!ctx) throw new Error('useData must be used within DataProvider'); return ctx; };

export default DataContext;
