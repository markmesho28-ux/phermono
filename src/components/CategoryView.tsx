import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { X, ChevronDown, ChevronUp, Filter, Sparkles, ArrowUpDown, Tag, PlusCircle, Edit2, Trash2 } from "lucide-react";
import ProductCard from "./ProductCard";
import { useData } from "../contexts/DataContext";
import { useAuth } from "../contexts/AuthContext";
import AdminModal from "./AdminModal";
import type { Category, CategorySubcategory, DataActions, Product } from "../types";

interface CategoryViewProps {
  categoryId: string;
  initialBrand?: string | null;
  searchQuery?: string;
  onAddToCart: (product: Product) => void;
  onQuickView: (product: Product) => void;
  onWishlist: (product: Product) => void;
  wishlist?: Product[];
}

type ModalMode = 'addProduct' | 'editProduct' | 'addSub' | 'editSub' | 'addBrand' | 'editBrand' | null;
type EditingState = Product | { categoryId: string; sub: CategorySubcategory } | { categoryId: string; brand: string } | null;

export default function CategoryView({
  categoryId,
  initialBrand = null,
  searchQuery = "",
  onAddToCart,
  onQuickView,
  onWishlist,
  wishlist = [],
}: CategoryViewProps) {
  const { products: contextProducts, categories, priceRanges, actions, brands: ALL_BRANDS } = useData();
  const { user } = useAuth();
  const category = categories.find((c) => c.id === categoryId) ?? null;

  // admin modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editing, setEditing] = useState<EditingState>(null);

  // filters
  const [selectedSubcategory, setSelectedSubcategory] = useState("all");
  const [selectedBrand, setSelectedBrand] = useState(initialBrand || "all");
  const [selectedPriceRange, setSelectedPriceRange] = useState("all");
  const [selectedSkinType, setSelectedSkinType] = useState("all");
  const [sortBy, setSortBy] = useState("price-asc");
  const [showAllBrands, setShowAllBrands] = useState(false);

  useEffect(() => {
    setSelectedSubcategory("all");
    setSelectedBrand(initialBrand || "all");
    setSelectedPriceRange("all");
    setSelectedSkinType("all");
    setSortBy("popular");
    setShowAllBrands(false);
  }, [categoryId, initialBrand]);

  // Always use products from DataContext (Supabase source). Do not fall back to any externally
  // supplied arrays to avoid showing mock/demo items when the database is empty.
  const effectiveProducts = contextProducts;
  const categoryProducts = useMemo(() => effectiveProducts.filter((p) => p.category === categoryId), [effectiveProducts, categoryId]);

  const availableBrands = useMemo(() => {
    if (!category) return [] as string[];
    if (category.brands && category.brands.length) return category.brands;
    const brandSet = new Set(categoryProducts.map((p) => p.brand));
    return ALL_BRANDS.filter((b) => brandSet.has(b));
  }, [category, categoryProducts, ALL_BRANDS]);

  const filteredProducts = useMemo(() => {
    let result = [...categoryProducts];
    if (selectedSubcategory !== "all") result = result.filter((p) => p.subcategoryId === selectedSubcategory);
    if (selectedBrand && selectedBrand !== "all") result = result.filter((p) => p.brand === selectedBrand);
    if (selectedPriceRange !== "all") {
      const range = priceRanges.find((r) => r.id === selectedPriceRange);
      if (range) {
        const min = typeof range.min === 'number' ? range.min : 0;
        const max = typeof range.max === 'number' ? range.max : Number.POSITIVE_INFINITY;
        result = result.filter((p) => {
          const sell = typeof p.sellingPrice === 'number' ? p.sellingPrice : (p.price || 0);
          return sell >= min && sell < max;
        });
      }
    }
    if (selectedSkinType !== "all") result = result.filter((p) => p.skinType === selectedSkinType || p.skinType === "All");
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((p) => p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || String(p.subcategoryId || '').toLowerCase().includes(q) || p.description?.toLowerCase().includes(q));
    }
    switch (sortBy) {
      case "price-asc": result.sort((a,b)=>{
        const pa = typeof a.sellingPrice === 'number' ? a.sellingPrice : 0;
        const pb = typeof b.sellingPrice === 'number' ? b.sellingPrice : 0;
        return pa-pb;
      }); break;
      case "price-desc": result.sort((a,b)=>{
        const pa = typeof a.sellingPrice === 'number' ? a.sellingPrice : 0;
        const pb = typeof b.sellingPrice === 'number' ? b.sellingPrice : 0;
        return pb-pa;
      }); break;
      case "rating": result.sort((a,b)=>b.rating-a.rating); break;
      case "popular": result.sort((a,b)=>b.reviews-a.reviews); break;
      case "discount": result.sort((a,b)=>{
        const da = a.marketPrice ? ((a.marketPrice - (typeof a.sellingPrice === 'number' ? a.sellingPrice : 0))/a.marketPrice) : 0;
        const db = b.marketPrice ? ((b.marketPrice - (typeof b.sellingPrice === 'number' ? b.sellingPrice : 0))/b.marketPrice) : 0;
        return db-da;
      }); break;
      default: break;
    }
    return result;
  }, [categoryProducts, selectedSubcategory, selectedBrand, selectedPriceRange, selectedSkinType, searchQuery, sortBy, priceRanges]);

  if (!category) return null;

  // Admin actions
  const openAddProduct = () => { setModalMode('addProduct'); setEditing(null); setModalOpen(true); };
  const openEditProduct = (product: Product) => { setModalMode('editProduct'); setEditing(product); setModalOpen(true); };
  const handleDeleteProduct = (product: Product) => { actions.deleteProduct(product.id); };

  // Subcategory add
  const openAddSub = () => { setModalMode('addSub'); setEditing(null); setModalOpen(true); };

  // Brand add
  const openAddBrand = () => { setModalMode('addBrand'); setEditing(null); setModalOpen(true); };
  const openEditBrand = (brand: string) => { setEditing({ categoryId: categoryId, brand }); setModalMode('editBrand'); setModalOpen(true); };

  return (
    <div className="mx-auto w-full max-w-[1500px] px-3 pb-24 pt-4 sm:px-5 lg:px-8 md:pb-12">
      <div className="relative overflow-hidden rounded-[32px] border border-[#ead7b5] bg-[radial-gradient(circle_at_top_left,_#fffdfb_0%,_#f8f1e8_30%,_#efe4d3_100%)] p-5 shadow-[0_22px_60px_rgba(40,28,18,0.10)] sm:p-7 lg:p-9">
        <div className="pointer-events-none absolute inset-y-0 right-[-10%] hidden w-1/2 bg-[radial-gradient(circle,_rgba(175,120,68,0.18)_0%,_rgba(175,120,68,0.06)_28%,_transparent_70%)] lg:block" />
        <div className="relative z-10 flex w-full flex-col gap-4">
          <div className="max-w-2xl text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d8b880]/70 bg-[#1b1715] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-[#f7d9a3] shadow-[0_10px_24px_rgba(27,23,21,0.15)]">
              <Sparkles size={12} />
              <span>PhM Department</span>
            </div>
            <h1 className="mt-4 text-left font-serif-luxury text-3xl font-black tracking-[-0.04em] text-[#1d130d] sm:text-4xl lg:text-5xl">
              {category.label}
            </h1>
            <p className="mt-3 max-w-xl text-left text-sm text-[#574a3d] sm:text-base">
              Curated essentials and elevated rituals for {category.label.toLowerCase()} with tailored beauty picks and premium formulas.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-7 space-y-5">
        <div className="rounded-[28px] border border-[#ead7b5] bg-white/80 p-3 shadow-[0_16px_32px_rgba(32,24,17,0.05)] backdrop-blur-sm sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f2e5cf] text-[#8a5d2d]">
                <Tag size={14} />
              </div>
              <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[#5b4637]">Sub-Categories</span>
              {user && user.role === 'admin' && (
                <button type="button" onClick={openAddSub} className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#d9b57c] bg-[#f9f1e7] text-[#7b5333] transition hover:bg-[#f1d8a8] touch-target" aria-label="Add Subcategory">
                  <PlusCircle size={13} />
                </button>
              )}
            </div>
            <span className="truncate text-[11px] font-semibold text-[#8c7c6d]">
              {selectedSubcategory === "all" ? "All Sub-Categories" : category.subcategories.find(s=>s.id===selectedSubcategory)?.label}
            </span>
          </div>

          <div className="flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {category.subcategories.map((sub) => {
              const isActive = selectedSubcategory === sub.id;
              const subCount = sub.id === "all" ? categoryProducts.length : categoryProducts.filter((p)=>p.subcategoryId===sub.id).length;
              return (
                <div key={sub.id} className="relative shrink-0">
                  <button
                    type="button"
                    onClick={()=>setSelectedSubcategory(sub.id)}
                    className={`flex items-center gap-2 rounded-full border px-4 py-2.5 text-[11px] font-bold tracking-[0.12em] uppercase transition-all duration-300 active:scale-95 touch-target ${isActive ? 'border-[#1b1715] bg-[#1b1715] text-[#f8ebd9] shadow-[0_14px_24px_rgba(27,23,21,0.12)]' : 'border-[#e8dcc6] bg-[#fffdfb] text-[#2d231b] hover:border-[#d6b67d] hover:text-[#1d130d]'}`}
                    data-active={isActive}
                  >
                    <span className="pointer-events-none">{sub.label}</span>
                    <span className={`inline-flex min-w-[1.55rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] font-extrabold ${isActive ? 'bg-[#f3d29c] text-[#1d130d]' : 'bg-[#f7f0e6] text-[#6b5441]'}`}>
                      {subCount}
                    </span>
                  </button>
                  {user && user.role==='admin' && sub.id !== 'all' && (
                    <div className="absolute -right-2 top-0 flex flex-col gap-1">
                      <button type="button" onClick={()=>{ setEditing({categoryId: categoryId, sub}); setModalMode('editSub'); setModalOpen(true); }} className="h-6 w-6 rounded-full bg-white shadow-md text-[#4b3d2e] touch-target"><Edit2 size={11} className="mx-auto" /></button>
                      <button type="button" onClick={()=>{ actions.deleteSubcategory(categoryId, sub.id); }} className="h-6 w-6 rounded-full bg-white shadow-md text-red-500 touch-target"><Trash2 size={11} className="mx-auto" /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-[28px] border border-[#ead7b5] bg-white/80 p-3 shadow-[0_16px_32px_rgba(32,24,17,0.05)] backdrop-blur-sm sm:p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f2e5cf] text-[#8a5d2d]">
                <Tag size={14} />
              </div>
              <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[#5b4637]">Filter by Brand</span>
              {user && user.role === 'admin' && (
                <button type="button" onClick={openAddBrand} className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#d9b57c] bg-[#f9f1e7] text-[#7b5333] transition hover:bg-[#f1d8a8] touch-target" aria-label="Add Brand">
                  <PlusCircle size={13} />
                </button>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 sm:gap-3">
              <span className="inline-flex min-w-0 justify-end">
                {selectedBrand !== "all" ? (
                  <button type="button" onClick={()=>setSelectedBrand('all')} className="flex items-center gap-1 text-[11px] font-bold text-[#7a655d] transition-colors hover:text-red-500 touch-target">
                    <X size={12} /> Reset Brand
                  </button>
                ) : (
                  <span className="invisible text-[11px] font-bold">Reset Brand</span>
                )}
              </span>
              {availableBrands.length > 8 ? (
                <button type="button" onClick={()=>setShowAllBrands(!showAllBrands)} className="flex items-center gap-1 whitespace-nowrap text-[11px] font-bold text-[#7b5333] transition-colors hover:text-[#1d130d] touch-target">
                  {showAllBrands ? <><span>Show Less</span> <ChevronUp size={13} /></> : <><span>View All ({availableBrands.length})</span> <ChevronDown size={13} /></>}
                </button>
              ) : (
                <span className="invisible whitespace-nowrap text-[11px] font-bold">View All (0)</span>
              )}
            </div>
          </div>

          <div className="flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={()=>setSelectedBrand('all')}
              className={`shrink-0 rounded-full border px-4 py-2.5 text-[11px] font-bold tracking-[0.12em] uppercase transition-all duration-300 active:scale-95 touch-target ${selectedBrand==='all' ? 'border-[#1b1715] bg-[#1b1715] text-[#f8ebd9] shadow-[0_14px_24px_rgba(27,23,21,0.12)]' : 'border-[#e8dcc6] bg-[#fffdfb] text-[#2d231b] hover:border-[#d6b67d] hover:text-[#1d130d]'}`}
              data-active={selectedBrand === 'all'}
            >
              <span className="inline-flex items-center gap-2">
                <span>All Brands</span>
                <span className={`inline-flex min-w-[1.55rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] font-extrabold ${selectedBrand==='all' ? 'bg-[#f3d29c] text-[#1d130d]' : 'bg-[#f7f0e6] text-[#6b5441]'}`}>
                  {selectedSubcategory==='all' ? categoryProducts.length : categoryProducts.filter((p)=>p.subcategoryId===selectedSubcategory).length}
                </span>
              </span>
            </button>

            {(showAllBrands ? availableBrands : availableBrands.slice(0,8)).map((brand)=>{
              const isSelected = selectedBrand===brand;
              const brandCount = categoryProducts.filter(p=>p.brand===brand && (selectedSubcategory==='all' || p.subcategoryId===selectedSubcategory)).length;
              return (
                <div key={brand} className="relative shrink-0">
                  <button
                    type="button"
                    onClick={()=>setSelectedBrand(prev=>prev===brand?'all':brand)}
                    className={`rounded-full border px-4 py-2.5 text-[11px] font-bold tracking-[0.12em] uppercase transition-all duration-300 active:scale-95 touch-target ${isSelected ? 'border-[#1b1715] bg-[#1b1715] text-[#f8ebd9] shadow-[0_14px_24px_rgba(27,23,21,0.12)]' : 'border-[#e8dcc6] bg-[#fffdfb] text-[#2d231b] hover:border-[#d6b67d] hover:text-[#1d130d]'}`}
                    data-active={isSelected}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span>{brand}</span>
                      <span className={`inline-flex min-w-[1.55rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] font-extrabold ${isSelected ? 'bg-[#f3d29c] text-[#1d130d]' : 'bg-[#f7f0e6] text-[#6b5441]'}`}>
                        {brandCount}
                      </span>
                    </span>
                  </button>
                  {user && user.role==='admin' && (
                    <div className="absolute -right-2 top-0 flex flex-col gap-1">
                      <button type="button" onClick={()=>openEditBrand(brand)} className="h-6 w-6 rounded-full bg-white shadow-md text-[#4b3d2e] touch-target"><Edit2 size={11} className="mx-auto" /></button>
                      <button type="button" onClick={()=>actions.deleteBrand(brand)} className="h-6 w-6 rounded-full bg-white shadow-md text-red-500 touch-target"><Trash2 size={11} className="mx-auto" /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-[24px] border border-[#ead7b5] bg-[#faf5ee]/90 px-3 py-2.5 shadow-[0_14px_28px_rgba(27,23,21,0.04)] backdrop-blur-sm sm:px-4">
          <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex min-w-0">
                {(selectedSubcategory!=='all' || (selectedBrand && selectedBrand!=='all') || selectedPriceRange!=='all' || selectedSkinType!=='all') ? (
                  <button type="button" onClick={()=>{ setSelectedSubcategory('all'); setSelectedBrand('all'); setSelectedPriceRange('all'); setSelectedSkinType('all'); }} className="flex items-center gap-1 whitespace-nowrap text-[11px] font-bold text-[#7d6a5d] transition-colors hover:text-red-500 touch-target">
                    <X size={12} /> Clear All Filters
                  </button>
                ) : (
                  <span className="invisible whitespace-nowrap text-[11px] font-bold">Clear All Filters</span>
                )}
              </span>
              <span className="hidden text-[11px] font-medium text-[#7d6a5d] sm:inline">Showing <strong className="text-[#1d130d]">{filteredProducts.length}</strong> items</span>
            </div>

            <div className="flex w-full items-center justify-end sm:w-auto">
              <div className="relative w-full min-w-0 sm:w-[240px]">
                <select value={sortBy} onChange={(e)=>setSortBy(e.target.value)} className="w-full appearance-none rounded-full border border-[#e4d6bc] bg-white py-2.5 pl-4 pr-10 text-[11px] font-semibold text-[#1d130d] shadow-[0_8px_18px_rgba(33,25,20,0.04)] transition-colors focus:outline-none focus:ring-2 focus:ring-[#d7b57e]/40 cursor-pointer">
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                  <option value="discount">Best Deals / Offers</option>
                </select>
                <ArrowUpDown size={12} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#7d6a5d]" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {user && user.role === 'admin' && (
        <div className="mt-4 flex w-full justify-end">
          <button type="button" onClick={openAddProduct} className="inline-flex items-center gap-2 rounded-full bg-[#1b1715] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-[#f3d29c] shadow-[0_12px_24px_rgba(27,23,21,0.14)] transition-all hover:bg-[#2b241f] touch-target">
            <PlusCircle size={14} /> Add Product
          </button>
        </div>
      )}

      {filteredProducts.length>0 ? (
        <>
          <div className="mt-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black uppercase tracking-[0.12em] text-[#2a221d]">Products</h3>
              {user && user.role === 'admin' && (
                <button
                  type="button"
                  onClick={openAddProduct}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#d9b57c] bg-[#f7efe5] text-[#7b5333] shadow-sm transition hover:bg-[#f1d8a8]"
                  aria-label="Add Product"
                  title="Add Product"
                >
                  <PlusCircle size={15} />
                </button>
              )}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map((product)=>(
              <ProductCard key={product.id} product={product} onAddToCart={onAddToCart} onQuickView={onQuickView} onWishlist={onWishlist} isWishlisted={wishlist.some(w=>w.id===product.id)} onEdit={user&&user.role==='admin'?openEditProduct:undefined} onDelete={user&&user.role==='admin'?handleDeleteProduct:undefined} />
            ))}
          </div>
        </>
      ) : (
        <div className="mx-auto my-8 max-w-lg rounded-[30px] border border-[#ead7b5] bg-white/90 p-8 text-center shadow-[0_18px_42px_rgba(33,25,20,0.06)] sm:p-12">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-[#d9b57c] bg-[#f7efe5] text-[#7b5333]"><Filter size={24} /></div>
          <h3 className="mb-2 text-2xl font-black tracking-[-0.03em] text-[#1d130d]">No Products Found</h3>
          <p className="mb-6 text-sm text-[#655b53]">There are no products matching this combination of sub-category and brand filters.</p>
          <button type="button" onClick={()=>{ setSelectedSubcategory('all'); setSelectedBrand('all'); setSelectedPriceRange('all'); setSelectedSkinType('all'); }} className="rounded-full bg-[#1b1715] px-6 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-[#f3d29c] shadow-[0_12px_24px_rgba(27,23,21,0.14)] transition-all hover:bg-[#2f2823] touch-target">Reset All Filters</button>
        </div>
      )}

      <AdminModal
        open={modalOpen}
        title={
          modalMode === 'addProduct'
            ? 'Add Product'
            : modalMode === 'editProduct'
            ? 'Edit Product'
            : modalMode === 'addSub'
            ? 'Add Subcategory'
            : modalMode === 'editSub'
            ? 'Edit Subcategory'
            : modalMode === 'addBrand'
            ? 'Add Brand'            : modalMode === 'editBrand'
            ? 'Edit Brand'            : ''
        }
        onClose={() => {
          setModalOpen(false);
          setModalMode(null);
          setEditing(null);
        }}
      >
        <ModalContent
          mode={modalMode}
          category={category}
          editing={editing}
          onClose={() => {
            setModalOpen(false);
            setModalMode(null);
            setEditing(null);
          }}
          actions={actions}
          availableBrands={availableBrands}
          allBrands={ALL_BRANDS}
          onProductSaved={() => {
            // Reset filters so the new/edited product is visible immediately
            setSelectedSubcategory("all");
            setSelectedBrand("all");
            setSelectedPriceRange("all");
            setSelectedSkinType("all");
            setModalOpen(false);
            setModalMode(null);
            setEditing(null);
          }}
          onBrandAdded={(name) => {
            if (name) {
              setSelectedBrand(name);
              setShowAllBrands(true);
            }
          }}
        />
      </AdminModal>
    </div>
  );
}

interface ModalContentProps {
  mode: ModalMode;
  category: Category;
  editing: EditingState;
  onClose: () => void;
  actions: DataActions;
  availableBrands: string[];
  allBrands?: string[];
  onProductSaved?: (product: Product) => void;
  onBrandAdded?: (name: string) => void;
}

function ModalContent({
  mode,
  category,
  editing,
  onClose,
  actions,
  availableBrands,
  allBrands = [],
  onProductSaved,
  onBrandAdded,
}: ModalContentProps) {
  type ProductFormState = {
    name: string;
    brand: string;
    category: string;
    subcategory: string | null;
    adminCost: string;
    marketPrice: string;
    sellingPrice: string;
    rating: number;
    reviews: number;
    image: string;
    description: string;
    id?: number;
  };

  // Dedicated state for simple text forms (addSub, editSub, addBrand)
  const [simpleLabel, setSimpleLabel] = useState('');

  // Combine category brands, global brands, and available brands. Keep any currently
  // edited brand in the option list so the selected value stays valid.
  const mergedBrands = useMemo(() => {
    const set = new Set<string>();
    (availableBrands || []).forEach((b) => b && set.add(b));
    (category.brands || []).forEach((b) => b && set.add(b));
    (allBrands || []).forEach((b) => b && set.add(b));
    if (mode === 'editProduct' && editing && 'brand' in editing && editing.brand) {
      set.add(editing.brand);
    }
    return Array.from(set);
  }, [availableBrands, category.brands, allBrands, mode, editing]);

  // Filter out the "all" pseudo-subcategory for assignment
  const assignableSubcategories = useMemo(() => {
    return (category.subcategories || []).filter((s) => s.id !== 'all');
  }, [category.subcategories]);

  const buildProductFormState = useCallback((): ProductFormState => {
    if (mode === 'editProduct' && editing && 'id' in editing) {
      const sellingValue = (editing as any).sellingPrice ?? '';
      const marketValue = (editing as any).marketPrice ?? (editing as any).originalPrice ?? '';
      const adminValue = (editing as any).adminCost ?? (editing as any).cost ?? '';
      const imageValue = (editing as any).image_url ?? (editing as any).image ?? '';
      const descriptionValue = (editing as any).description ?? (editing as any).details ?? '';
      return {
        ...editing,
        subcategory: (editing as any).subcategory ?? null,
        adminCost: adminValue !== undefined && adminValue !== null ? String(adminValue) : '',
        marketPrice: marketValue !== undefined && marketValue !== null ? String(marketValue) : '',
        sellingPrice: sellingValue !== undefined && sellingValue !== null ? String(sellingValue) : '',
        image: imageValue || '',
        description: descriptionValue || '',
      };
    }

    return {
      name: '',
      brand: mergedBrands[0] || '',
      category: category?.id || '',
      subcategory: assignableSubcategories[0]?.id || category?.subcategories?.[0]?.id || 'general',
      adminCost: '',
      marketPrice: '',
      sellingPrice: '',
      rating: 5,
      reviews: 1,
      image: '',
      description: '',
    };
  }, [assignableSubcategories, category?.id, category?.subcategories, editing, mergedBrands, mode]);

  const [form, setForm] = useState<ProductFormState>(buildProductFormState);
  const lastInitialisedKeyRef = useRef<string>('');

  const editIdentity = (() => {
    if (mode === 'editProduct' && editing && 'id' in editing) return `product:${String((editing as any).id ?? '')}`;
    if (mode === 'editSub' && editing && 'sub' in editing) return `sub:${editing.sub.id}`;
    if (mode === 'editBrand' && editing && 'brand' in editing) return `brand:${editing.brand}`;
    return mode === 'addProduct' ? `add:${category?.id || 'new'}` : '';
  })();

  useEffect(() => {
    if (!editIdentity || lastInitialisedKeyRef.current === editIdentity) {
      return;
    }

    lastInitialisedKeyRef.current = editIdentity;
    setSimpleLabel(
      mode === 'editSub' && editing && 'sub' in editing ? editing.sub.label || '' :
      mode === 'editBrand' && editing && 'brand' in editing ? editing.brand || '' : ''
    );
    setForm(buildProductFormState());
  }, [buildProductFormState, editIdentity, editing, mode]);

  // Compress image file to max 600px to avoid filling localStorage quota
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 600;
        let w = img.width;
        let h = img.height;
        if (w > h) {
          if (w > maxDim) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          }
        } else {
          if (h > maxDim) {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          setForm((f) => ({ ...f, image: canvas.toDataURL('image/jpeg', 0.8) }));
        } else {
          setForm((f) => ({ ...f, image: String(event.target?.result || '') }));
        }
      };
      img.src = String(event.target?.result || '');
    };
    reader.readAsDataURL(file);
  };

  const submit = () => {
    if (mode === 'addProduct') {
      const trimmedName = form.name.trim();
      if (!trimmedName) {
        alert('Please enter a Product Name before saving.');
        return;
      }
      const trimmedBrand = form.brand.trim();
      if (!trimmedBrand) {
        alert('Please select or specify a Brand before saving.');
        return;
      }
      const chosenSub =
        form.subcategory && form.subcategory !== 'all'
          ? form.subcategory
          : assignableSubcategories[0]?.id || 'general';

      if (!form.sellingPrice || String(form.sellingPrice).trim() === '' || isNaN(Number(form.sellingPrice))) {
        alert('Please enter a valid Store Price.');
        return;
      }
      const parsedSell =
        form.sellingPrice && String(form.sellingPrice).trim() !== '' && !isNaN(Number(form.sellingPrice))
          ? parseFloat(String(form.sellingPrice).trim())
          : undefined;
      const parsedMarket =
        form.marketPrice && String(form.marketPrice).trim() !== '' && !isNaN(Number(form.marketPrice))
          ? parseFloat(String(form.marketPrice).trim())
          : undefined;
      const parsedAdmin =
        form.adminCost && String(form.adminCost).trim() !== '' && !isNaN(Number(form.adminCost))
          ? parseFloat(String(form.adminCost).trim())
          : undefined;

      const fallbackImage =
        form.image.trim() ||
        'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&q=80';

      const prod: Product = {
        id: Date.now(),
        name: trimmedName,
        brand: trimmedBrand,
        category: category.id,
        subcategory: chosenSub,
        adminCost: parsedAdmin,
        marketPrice: parsedMarket,
        sellingPrice: parsedSell,
        originalPrice: parsedMarket ?? null,
        rating: Number(form.rating) || 5,
        reviews: Number(form.reviews) || 1,
        image: fallbackImage,
        description: form.description.trim(),
      };

      actions.addProduct(prod);
      if (onProductSaved) {
        onProductSaved(prod);
      }
      onClose();
    } else if (mode === 'editProduct') {
      if (!form.id) {
        alert('Product is missing an ID and cannot be updated.');
        return;
      }
      const trimmedName = form.name.trim();
      if (!trimmedName) {
        alert('Please enter a Product Name before saving.');
        return;
      }
      const trimmedBrand = form.brand.trim();
      if (!trimmedBrand) {
        alert('Please select or specify a Brand before saving.');
        return;
      }
      if (!form.sellingPrice || String(form.sellingPrice).trim() === '' || isNaN(Number(form.sellingPrice))) {
        alert('Please enter a valid Store Price.');
        return;
      }
      const parsedSell =
        form.sellingPrice && String(form.sellingPrice).trim() !== '' && !isNaN(Number(form.sellingPrice))
          ? parseFloat(String(form.sellingPrice).trim())
          : undefined;
      const parsedMarket =
        form.marketPrice && String(form.marketPrice).trim() !== '' && !isNaN(Number(form.marketPrice))
          ? parseFloat(String(form.marketPrice).trim())
          : undefined;
      const parsedAdmin =
        form.adminCost && String(form.adminCost).trim() !== '' && !isNaN(Number(form.adminCost))
          ? parseFloat(String(form.adminCost).trim())
          : undefined;

      const updated: Partial<Product> = {
        name: trimmedName,
        brand: trimmedBrand,
        category: category.id,
        subcategory: form.subcategory,
        adminCost: parsedAdmin,
        marketPrice: parsedMarket,
        sellingPrice: parsedSell,
        originalPrice: parsedMarket ?? null,
        rating: Number(form.rating) || 0,
        reviews: Number(form.reviews) || 0,
        image: form.image.trim() || (editing as any)?.image_url || (editing as any)?.image || undefined,
        image_url: form.image.trim() || (editing as any)?.image_url || (editing as any)?.image || undefined,
        description: form.description.trim() || (editing as any)?.description || (editing as any)?.details || '',
        details: form.description.trim() || (editing as any)?.description || (editing as any)?.details || '',
      } as any;

      actions.updateProduct(form.id, updated);
      if (onProductSaved) {
        // Merge the updated fields into the form snapshot to ensure UI updates include the saved values
        onProductSaved({ ...form, ...updated } as Product);
      }
      onClose();
    } else if (mode === 'addSub') {
      const trimmed = simpleLabel.trim();
      if (!trimmed) return;
      // If this label already exists locally, reuse it and avoid inserting
      const existingLocal = (category.subcategories || []).find(s => String(s.label).toLowerCase() === trimmed.toLowerCase());
      if (existingLocal) {
        // ensure UI will select the existing subcategory where appropriate
        onClose();
        return;
      }

      const id = trimmed.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
      // addSubcategory is idempotent and will return an existing row if a concurrent insert occurred
      (async () => {
        try {
          const created = await actions.addSubcategory(category.id, { id, label: trimmed });
          if (created && created.id) {
            // optional: setSelectedSubcategory(created.id) if you want immediate selection
          }
        } catch (e) {
          // errors are handled inside addSubcategory
        }
      })();
      onClose();
    } else if (mode === 'editSub') {
      if (!editing || !('sub' in editing)) return;
      actions.updateSubcategory(category.id, editing.sub.id, { label: simpleLabel.trim() });
      onClose();
    } else if (mode === 'addBrand') {
      const name = simpleLabel.trim();
      if (!name) return;
      const exists = (availableBrands || []).some((b) => String(b).toLowerCase() === name.toLowerCase());
      if (exists) {
        alert('Brand already exists in this category.');
        return;
      }
      actions.addBrand(name, category.id);
      if (typeof onBrandAdded === 'function') onBrandAdded(name);
      onClose();
    } else if (mode === 'editBrand') {
      if (!editing || !('brand' in editing)) return;
      const name = simpleLabel.trim();
      if (!name) return;
      if (String(editing.brand).toLowerCase() === name.toLowerCase()) {
        onClose();
        return;
      }
      const exists = (availableBrands || []).some((b) => String(b).toLowerCase() === name.toLowerCase() && b !== editing.brand);
      if (exists) {
        alert('Brand already exists in this category.');
        return;
      }
      actions.updateBrand(editing.brand, name);
      onClose();
    }
  };

  return (
    <div className="space-y-1.5 text-brand-black sm:space-y-2">
      {(mode === 'addProduct' || mode === 'editProduct') && (
        <div className="space-y-1.5 sm:space-y-2">
          <div>
            <label className="mb-[3px] block text-[10px] font-semibold text-stone-700 sm:text-[10.5px]">
              Product Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Cerave Hydrating Cleanser"
              className="w-full min-h-[36px] rounded-md border border-stone-200 bg-stone-50 px-2 py-1.5 text-[16px] text-brand-black placeholder:text-stone-400 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/40 sm:min-h-[38px] sm:px-2.5 sm:py-2"
            />
          </div>

          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 sm:gap-2">
            <div>
              <label className="mb-[3px] block text-[10px] font-semibold text-stone-700 sm:text-[10.5px]">
                Brand <span className="text-red-500">*</span>
              </label>
              <select
                value={form.brand}
                onChange={(e) => setForm((prev) => ({ ...prev, brand: e.target.value }))}
                className="w-full min-h-[36px] rounded-md border border-stone-200 bg-stone-50 px-2 py-1.5 text-[16px] focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/40 sm:min-h-[38px] sm:px-2.5 sm:py-2"
              >
                <option value="">Select Brand</option>
                {mergedBrands.length > 0 ? (
                  mergedBrands.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))
                ) : (
                  <option value="">No brands available</option>
                )}
              </select>
            </div>

            <div>
              <label className="mb-[3px] block text-[10px] font-semibold text-stone-700 sm:text-[10.5px]">
                Sub-Category <span className="text-red-500">*</span>
              </label>
              <select
                value={form.subcategory ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, subcategory: e.target.value }))}
                className="w-full min-h-[36px] rounded-md border border-stone-200 bg-stone-50 px-2 py-1.5 text-[16px] focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/40 sm:min-h-[38px] sm:px-2.5 sm:py-2"
              >
                {assignableSubcategories.length > 0 ? (
                  assignableSubcategories.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))
                ) : (
                  <option value="general">General</option>
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2">
            <div>
              <label className="mb-[3px] block text-[9.5px] font-semibold text-stone-600 sm:text-[10px]">
                Cost
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={form.adminCost}
                onChange={(e) => setForm((prev) => ({ ...prev, adminCost: e.target.value }))}
                placeholder="150"
                className="w-full min-h-[36px] rounded-md border border-stone-200 bg-stone-50 px-2 py-1.5 text-[16px] focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/40 sm:min-h-[38px] sm:px-2.5 sm:py-2"
              />
            </div>
            <div>
              <label className="mb-[3px] block text-[9.5px] font-semibold text-stone-600 sm:text-[10px]">General</label>
              <input
                type="text"
                inputMode="decimal"
                value={form.marketPrice}
                onChange={(e) => setForm((prev) => ({ ...prev, marketPrice: e.target.value }))}
                placeholder="280"
                className="w-full min-h-[36px] rounded-md border border-stone-200 bg-stone-50 px-2 py-1.5 text-[16px] focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/40 sm:min-h-[38px] sm:px-2.5 sm:py-2"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="mb-[3px] block text-[9.5px] font-semibold text-stone-600 sm:text-[10px]">
                Store <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={form.sellingPrice}
                onChange={(e) => setForm((prev) => ({ ...prev, sellingPrice: e.target.value }))}
                placeholder="220"
                className="w-full min-h-[36px] rounded-md border border-stone-200 bg-stone-50 px-2 py-1.5 text-[16px] font-bold text-brand-black focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/40 sm:min-h-[38px] sm:px-2.5 sm:py-2"
              />
            </div>
          </div>

          <div>
            <label className="mb-[3px] block text-[10px] font-semibold text-stone-700 sm:text-[10.5px]">Product Image</label>
            <div className="space-y-1.5 sm:space-y-2">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageFileChange}
                className="w-full min-h-[36px] rounded-md border border-stone-200 bg-stone-50 px-2 py-1.5 text-[11px] text-stone-500 file:mr-2 file:rounded-full file:border-0 file:bg-brand-black file:px-2 file:py-1.5 file:text-[10px] file:font-semibold file:text-white hover:file:bg-brand-charcoal file:cursor-pointer sm:min-h-[38px] sm:px-2.5 sm:py-2"
              />
              <input
                type="text"
                placeholder="Image URL"
                value={form.image.startsWith('data:') ? '' : form.image}
                onChange={(e) => setForm((prev) => ({ ...prev, image: e.target.value }))}
                className="w-full min-h-[36px] rounded-md border border-stone-200 bg-stone-50 px-2 py-1.5 text-[16px] placeholder:text-stone-400 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/40 sm:min-h-[38px] sm:px-2.5 sm:py-2"
              />
            </div>
            {form.image && (
              <div className="mt-1 flex items-center gap-2">
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md border border-stone-200 bg-white sm:h-10 sm:w-10">
                  <img src={form.image} alt="Preview" className="h-full w-full object-cover" />
                </div>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, image: '' }))}
                  className="text-[10px] text-red-500 hover:underline"
                >
                  Remove
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="mb-[3px] block text-[10px] font-semibold text-stone-700 sm:text-[10.5px]">Description</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Details..."
              className="w-full min-h-[64px] resize-none rounded-md border border-stone-200 bg-stone-50 px-2 py-1.5 text-[16px] placeholder:text-stone-400 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/40 sm:min-h-[72px] sm:px-2.5 sm:py-2"
            />
          </div>
        </div>
      )}

      {(mode === 'addSub' || mode === 'editSub' || mode === 'addBrand' || mode === 'editBrand') && (
        <div>
          <label className="mb-1 block text-xs font-semibold text-stone-700">
            {mode === 'addBrand' || mode === 'editBrand' ? 'Brand Name' : 'Subcategory Label'}
          </label>
          <input
            type="text"
            value={simpleLabel}
            onChange={(e) => setSimpleLabel(e.target.value)}
            placeholder={mode === 'addBrand' || mode === 'editBrand' ? 'e.g. CeraVe' : 'e.g. Face Cleansers'}
            className="w-full min-h-[44px] rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-base focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/40 pointer-events-auto sm:min-h-[44px]"
            style={{ fontSize: '16px' }}
            autoComplete="off"
          />
        </div>
      )}

      <div className="sticky bottom-0 flex items-center justify-end gap-1.5 border-t border-stone-100 bg-white pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:gap-2 sm:pt-2">
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded-md px-2.5 py-1.5 text-[10px] font-semibold text-stone-600 transition-colors hover:text-brand-black sm:px-3"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          className="cursor-pointer rounded-md bg-brand-black px-2.5 py-1.5 text-[10px] font-semibold text-white shadow-luxury transition-all hover:bg-brand-charcoal active:scale-98 sm:px-3"
        >
          {mode === 'addProduct' ? 'Save' : 'Save'}
        </button>
      </div>
    </div>
  );
}
