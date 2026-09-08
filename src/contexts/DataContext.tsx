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
  useEffect(() => {
    let mounted = true;
    const fetchRemote = async () => {
      if (!supabase) return;
      try {
        const [{ data: productsData }, { data: ordersData }, { data: categoriesData }] = await Promise.all([
          supabase.from('products').select('*'),
          supabase.from('orders').select('*'),
          supabase.from('categories').select('*'),
        ]);

        if (!mounted) return;

        if (Array.isArray(productsData) && productsData.length > 0) {
          setProducts(productsData as any);
        }
        if (Array.isArray(categoriesData) && categoriesData.length > 0) {
          setCategories(categoriesData as any);
        }
        if (Array.isArray(ordersData) && ordersData.length > 0) {
          setOrders(ordersData as any);
        }
      } catch (err) {
        // keep local data on any failure
        console.warn('Supabase sync failed:', err);
      }
    };

    void fetchRemote();
    return () => { mounted = false; };
  }, []);

  // Categories
  const addCategory = (cat: Category) => setCategories(prev => [...prev, cat]);
  const updateCategory = (id: string, updates: Partial<Category>) => setCategories(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  const deleteCategory = (id: string) => { setCategories(prev => prev.filter(c => c.id !== id)); setProducts(prev => prev.filter(p => p.category !== id)); };

  // Subcategories
  const addSubcategory = (categoryId: string, sub: CategorySubcategory) => setCategories(prev => prev.map(c => c.id === categoryId ? { ...c, subcategories: [...c.subcategories, sub] } : c));
  const updateSubcategory = (categoryId: string, subId: string, updates: Partial<CategorySubcategory>) => setCategories(prev => prev.map(c => {
    if (c.id !== categoryId) return c;
    return { ...c, subcategories: c.subcategories.map(s => s.id === subId ? { ...s, ...updates } : s) };
  }));
  const deleteSubcategory = (categoryId: string, subId: string) => { setCategories(prev => prev.map(c => c.id === categoryId ? { ...c, subcategories: c.subcategories.filter(s => s.id !== subId) } : c )); setProducts(prev => prev.filter(p => !(p.category === categoryId && p.subcategory === subId))); };

  // Brands
  const addBrand = (name: string, categoryId?: string) => {
    const clean = String(name || '').trim();
    if (!clean) return;
    setBrands(prev => {
      const exists = prev.some(b => String(b).toLowerCase() === clean.toLowerCase());
      if (exists) return prev;
      return [...prev, clean];
    });
    // Also attach brand to the category's `brands` list so views that prefer
    // `category.brands` (like CategoryView) immediately reflect the change.
    if (categoryId) {
      setCategories(prev => prev.map(c => {
        if (c.id !== categoryId) return c;
        const existing = Array.isArray(c.brands) ? c.brands : [];
        const existsInCategory = existing.some(b => String(b).toLowerCase() === clean.toLowerCase());
        if (existsInCategory) return c;
        return { ...c, brands: [...existing, clean] };
      }));
    }

    try {
      if (supabase) {
        (async () => {
          try {
            const payload = { name: clean, category_id: categoryId || null, created_at: new Date().toISOString() } as any;
            const { error } = await supabase.from('brands').insert([payload]);
            if (error) console.warn('Supabase brand insert failed:', error.message || error);
          } catch (e: any) {
            console.warn('Supabase brand write error:', e?.message || e);
          }
        })();
      }
    } catch (e) {
      console.warn('Supabase brand write error', e);
    }
  };

  const productToRow = (p: Product) => {
    return {
      id: p.id,
      name: p.name,
      brand: p.brand,
      category: p.category,
      subcategory: p.subcategory,
      original_price: (p as any).originalPrice ?? null,
      selling_price: (p as any).sellingPrice ?? null,
      market_price: (p as any).marketPrice ?? null,
      admin_cost: (p as any).adminCost ?? null,
      price: p.price,
      rating: p.rating ?? 0,
      reviews: p.reviews ?? 0,
      skin_type: p.skinType ?? null,
      tag: p.tag ?? null,
      hero: p.hero ?? false,
      image: p.image ?? null,
      description: p.description ?? null,
      created_at: new Date().toISOString(),
    } as Record<string, any>;
  };

  const mapProductUpdatesToRow = (updates: Partial<Product>) => {
    const row: Record<string, any> = {};
    if (updates.name !== undefined) row.name = updates.name;
    if (updates.brand !== undefined) row.brand = updates.brand;
    if (updates.category !== undefined) row.category = updates.category;
    if (updates.subcategory !== undefined) row.subcategory = updates.subcategory;
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

  const addProduct = (prod: Product) => {
    const id = Date.now();
    const newProd: Product = { ...prod, id };
    setProducts(prev => [newProd, ...prev]);
    if (prod.brand && prod.category) {
      addBrand(prod.brand, prod.category);
    }
    // Persist to Supabase (best-effort) with proper field mapping and error handling
    try {
      if (supabase) {
        (async () => {
          try {
            const payload = productToRow(newProd);
            const { data, error } = await supabase.from('products').upsert([payload], { onConflict: 'id' }).select();
            if (error) {
              console.warn('Supabase product upsert failed:', error.message || error);
              if ((error as any)?.code === '23514' || (error as any)?.message?.includes('permission')) {
                console.warn('Possible RLS or permission issue. Ensure table policies allow inserts for anon role or run migrations via a service role.');
              }
            } else {
              // Optionally sync back any returned representation
              if (Array.isArray(data) && data[0]) {
                const returned = data[0] as any;
                setProducts(prev => prev.map(p => p.id === newProd.id ? ({ ...p, id: returned.id, name: returned.name || p.name }) : p));
              }
            }
          } catch (e: any) {
            console.warn('Supabase product write error:', e?.message || e);
          }
        })();
      }
    } catch (e) {
      console.warn('Supabase product write error', e);
    }
    return id;
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
