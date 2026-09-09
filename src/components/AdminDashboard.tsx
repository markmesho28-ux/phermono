import React, { useMemo, useState } from 'react';
import { Box, PlusCircle, Tag, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import type { Category, Product } from '../types';

export default function AdminDashboard() {
  const { user } = useAuth();
  const { categories, products, actions } = useData();
  const [categoryName, setCategoryName] = useState('');
  const [productName, setProductName] = useState('');

  const inventoryValue = useMemo(
    () => products.reduce((sum, product) => {
      const price = typeof product.sellingPrice === 'number' ? product.sellingPrice : (product.price || 0);
      return sum + price;
    }, 0),
    [products],
  );

  if (!user || user.role !== 'admin') {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-2">Admin Dashboard</h2>
        <p className="text-sm text-stone-500">Access denied. Admin privileges are required.</p>
      </div>
    );
  }

  const handleAddCategory = () => {
    const label = categoryName.trim();
    if (!label) return;

    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'new-category';
    const exists = categories.some((cat) => cat.id === id || cat.label.toLowerCase() === label.toLowerCase());
    if (exists) {
      setCategoryName('');
      return;
    }

    const category: Category = {
      id,
      label,
      icon: 'Sparkles',
      color: '#f59e0b',
      accent: '#f5d08b',
      subcategories: [{ id: 'all', label: 'All' }],
      brands: [],
    };

    actions.addCategory(category);
    setCategoryName('');
  };

  const handleAddProduct = () => {
    const label = productName.trim();
    if (!label) return;

    const defaultCategory = categories[0];
    const baseProduct = products[0];
    const newProduct: Product = {
      id: Date.now(),
      name: label,
      brand: 'PherMono',
      category: defaultCategory?.id ?? 'skincare',
      subcategory: defaultCategory?.subcategories?.[0]?.id ?? 'all',
      price: 0,
      sellingPrice: 0,
      marketPrice: 0,
      rating: 5,
      reviews: 0,
      image: baseProduct?.image ?? 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=900&q=80',
      description: 'New admin-added item.',
    };

    actions.addProduct(newProduct);
    setProductName('');
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-brand-gold-dark">Control Center</p>
          <h2 className="text-3xl font-bold text-brand-black mt-2">Admin Dashboard</h2>
        </div>
        <div className="rounded-2xl border border-brand-gold/30 bg-brand-gold/10 px-4 py-3 text-right">
          <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Inventory Value</div>
          <div className="text-xl font-bold text-brand-black">EGP {inventoryValue.toFixed(2)}</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-brand-black font-semibold">
            <Tag size={16} className="text-brand-gold" />
            Categories
          </div>
          <div className="mt-3 text-3xl font-bold text-brand-black">{categories.length}</div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-brand-black font-semibold">
            <Box size={16} className="text-brand-gold" />
            Products
          </div>
          <div className="mt-3 text-3xl font-bold text-brand-black">{products.length}</div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-stone-500">Admin</div>
          <div className="mt-2 text-lg font-bold text-brand-black">{user.name || 'Administrator'}</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-brand-black mb-4">Add Category</h3>
          <div className="flex gap-2">
            <input
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              placeholder="Category name"
              className="flex-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-brand-black outline-none focus:border-brand-gold"
            />
            <button
              type="button"
              onClick={handleAddCategory}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-black px-3.5 py-2.5 text-sm font-semibold text-white"
            >
              <PlusCircle size={16} /> Add
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {categories.map((category) => (
              <div key={category.id} className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
                <span className="text-sm font-medium text-brand-black">{category.label}</span>
                <button
                  type="button"
                  onClick={() => actions.deleteCategory(category.id)}
                  className="rounded-full p-1.5 text-red-500 hover:bg-red-50"
                  title="Delete category"
                  aria-label={`Delete ${category.label}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-brand-black mb-4">Add Product</h3>
          <div className="flex gap-2">
            <input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="Product name"
              className="flex-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-brand-black outline-none focus:border-brand-gold"
            />
            <button
              type="button"
              onClick={handleAddProduct}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-black px-3.5 py-2.5 text-sm font-semibold text-white"
            >
              <PlusCircle size={16} /> Add
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {products.slice(0, 6).map((product) => (
              <div key={product.id} className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
                <span className="text-sm font-medium text-brand-black">{product.name}</span>
                <button
                  type="button"
                  onClick={() => actions.deleteProduct(product.id)}
                  className="rounded-full p-1.5 text-red-500 hover:bg-red-50"
                  title="Delete product"
                  aria-label={`Delete ${product.name}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
