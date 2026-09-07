import React, { createContext, useContext, useEffect, useState } from 'react';
import { CATEGORIES as SEED_CATEGORIES, BRANDS as SEED_BRANDS, PRODUCTS as SEED_PRODUCTS, PRICE_RANGES as SEED_PRICE_RANGES } from '../data/products';
import type { Category, CategorySubcategory, DataContextValue, Order, Product, PriceRange } from '../types';

const DataContext = createContext<DataContextValue | null>(null);
const STORAGE_KEY = 'phermono_data_v1';
const seededCategories: Category[] = SEED_CATEGORIES as Category[];
const seededBrands: string[] = SEED_BRANDS as string[];
const seededPriceRanges: PriceRange[] = SEED_PRICE_RANGES as PriceRange[];

function seededProducts(): Product[] {
  return SEED_PRODUCTS.map((p) => ({
    ...p,
    skinType: p.skinType ?? undefined,
    tag: p.tag ?? undefined,
    hero: !!(p.tag && String(p.tag).toLowerCase().includes('best seller')),
  } as Product));
}

function getInitialData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed) {
        const loadedProducts = Array.isArray(parsed.products) && parsed.products.length > 0 ? parsed.products : seededProducts();
        const loadedCategories = Array.isArray(parsed.categories) && parsed.categories.length > 0 ? parsed.categories : seededCategories;
        const loadedBrands = Array.isArray(parsed.brands) && parsed.brands.length > 0 ? parsed.brands : seededBrands;
        const loadedRanges = Array.isArray(parsed.priceRanges) && parsed.priceRanges.length > 0 ? parsed.priceRanges : seededPriceRanges;
        const loadedOrders = Array.isArray(parsed.orders) ? parsed.orders : [];
        return {
          categories: loadedCategories,
          brands: loadedBrands,
          products: loadedProducts,
          priceRanges: loadedRanges,
          orders: loadedOrders,
        };
      }
    }
  } catch (e) {}
  return {
    categories: seededCategories,
    brands: seededBrands,
    products: seededProducts(),
    priceRanges: seededPriceRanges,
    orders: [],
  };
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [initial] = useState(() => getInitialData());
  const [categories, setCategories] = useState<Category[]>(initial.categories);
  const [brands, setBrands] = useState<string[]>(initial.brands);
  const [products, setProducts] = useState<Product[]>(initial.products);
  const [priceRanges] = useState<PriceRange[]>(initial.priceRanges);
  const [orders, setOrders] = useState<Order[]>(initial.orders);

  useEffect(() => {
    if (categories.length > 0 || products.length > 0) {
      const payload = { categories, brands, products, priceRanges, orders };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch (e) {
        console.warn('LocalStorage save error:', e);
      }
    }
  }, [categories, brands, products, priceRanges, orders]);

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

    if (categoryId) {
      setCategories(prev => prev.map(c => {
        if (c.id !== categoryId) return c;
        const existing = Array.isArray(c.brands) ? c.brands : [];
        const exists = existing.some(b => String(b).toLowerCase() === clean.toLowerCase());
        if (exists) return { ...c, brands: existing };
        return { ...c, brands: [...existing, clean] };
      }));
    }
  };
  const updateBrand = (oldName: string, newName: string) => {
    setBrands(prev => prev.map(b => b === oldName ? newName : b));
    setProducts(prev => prev.map(p => p.brand === oldName ? { ...p, brand: newName } : p));
    setCategories(prev => prev.map(c => ({ ...c, brands: (c.brands || []).map(b => b === oldName ? newName : b) })));
  };
  const deleteBrand = (name: string) => {
    setBrands(prev => prev.filter(b => b !== name));
    setProducts(prev => prev.filter(p => p.brand !== name));
    setCategories(prev => prev.map(c => ({ ...c, brands: (c.brands || []).filter(b => b !== name) })));
  };

  // Products
  const addProduct = (prod: Product) => {
    const id = Date.now();
    const newProd: Product = { ...prod, id };
    setProducts(prev => [newProd, ...prev]);
    if (prod.brand && prod.category) {
      addBrand(prod.brand, prod.category);
    }
    return id;
  };
  const updateProduct = (id: number, updates: Partial<Product>) => setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  const deleteProduct = (id: number) => setProducts(prev => prev.filter(p => p.id !== id));
  const toggleHero = (id: number) => setProducts(prev => prev.map(p => p.id === id ? { ...p, hero: !p.hero } : p));

  // Orders
  const addOrder = (order: Omit<Order, 'id' | 'createdAt'> & { createdAt?: number | string }) => {
    const id = Date.now();
    const o: Order = { ...order, id, createdAt: new Date().toISOString(), status: order.status || 'pending' } as Order;
    setOrders(prev => [...prev, o]);
    return id;
  };
  const updateOrder = (id: number, updates: Partial<Order>) => setOrders(prev => prev.map(o => o.id === id ? { ...o, ...updates } : o));
  const deleteOrder = (id: number) => setOrders(prev => prev.filter(o => o.id !== id));

  return (
    <DataContext.Provider value={{ categories, brands, products, priceRanges, orders, actions: { addCategory, updateCategory, deleteCategory, addSubcategory, updateSubcategory, deleteSubcategory, addBrand, updateBrand, deleteBrand, addProduct, updateProduct, deleteProduct, toggleHero, addOrder, updateOrder, deleteOrder } }}>
      {children}
    </DataContext.Provider>
  );
}

export const useData = () => { const ctx = useContext(DataContext); if (!ctx) throw new Error('useData must be used within DataProvider'); return ctx; };

export default DataContext;
