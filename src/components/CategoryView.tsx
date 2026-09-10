import React, { useState, useEffect, useMemo } from "react";
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
    if (selectedSubcategory !== "all") result = result.filter((p) => p.subcategory === selectedSubcategory);
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
      result = result.filter((p) => p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || p.subcategory.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q));
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
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 pt-4 pb-28 md:pb-12 space-y-8 animate-fadeIn overflow-hidden">
      {/* Category Hero (clean, unboxed) */}
      <div className="relative p-8 sm:p-10 text-white">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-gold/20 border border-brand-gold/40 text-gray-900 text-xs font-bold uppercase tracking-wider mb-3">
            <Sparkles size={13} />
            <span>PhM Department</span>
          </div>
          <h1 className="font-serif-luxury text-4xl sm:text-5xl font-bold tracking-tight text-gray-900 mb-2">{category.label}</h1>
          <p className="font-tagline text-base sm:text-lg text-gray-800 mb-2">Ur favorite Mono choice in {category.label.toLowerCase()}</p>
        </div>
      </div>

      {/* ── SUB-CATEGORIES BREAKDOWN ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Tag size={14} className="text-brand-gold" />
            <span className="text-xs font-bold uppercase tracking-wider text-brand-darkgray">Sub-Categories Breakdown</span>
            {user && user.role === 'admin' && (
              <button type="button" onClick={openAddSub} className="ml-2 text-brand-gold cursor-pointer">
                <PlusCircle size={14} />
              </button>
            )}
          </div>
          <span className="text-xs text-stone-400 font-medium">
            {selectedSubcategory === "all" ? "All Sub-Categories" : category.subcategories.find(s=>s.id===selectedSubcategory)?.label}
          </span>
        </div>
        <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-1">
          {category.subcategories.map((sub) => {
            const isActive = selectedSubcategory === sub.id;
            const subCount = sub.id === "all" ? categoryProducts.length : categoryProducts.filter((p)=>p.subcategory===sub.id).length;
            return (
              <div key={sub.id} className="relative">
                <button
                  type="button"
                  onClick={()=>setSelectedSubcategory(sub.id)}
                  className={`category-filter-tab shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold tracking-wide transition-all duration-300 shadow-sm active:scale-95 touch-target border ${isActive ? "bg-brand-black text-white border-brand-black shadow-luxury" : "bg-white text-brand-black border-stone-200 hover:border-brand-gold/50 hover:text-brand-black"}`}
                  data-active={isActive}
                >
                  <span className="pointer-events-none">{sub.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full pointer-events-none ${isActive?"bg-brand-gold text-brand-black font-extrabold":"filter-tab-count-badge"}`}>{subCount}</span>
                </button>
                {user && user.role==='admin' && sub.id !== 'all' && (
                  <div className="absolute -right-2 top-0 flex flex-col gap-1">
                    <button type="button" onClick={()=>{ setEditing({categoryId: categoryId, sub}); setModalMode('editSub'); setModalOpen(true); }} className="p-1 bg-white rounded-full shadow cursor-pointer"><Edit2 size={12} /></button>
                    <button type="button" onClick={()=>{ actions.deleteSubcategory(categoryId, sub.id); }} className="p-1 bg-white rounded-full shadow text-red-500 cursor-pointer"><Trash2 size={12} /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── FILTER BY BRAND ── (identical structure/design to Sub-Categories Breakdown above) */}
      <div>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <Tag size={14} className="text-brand-gold" />
            <span className="text-xs font-bold uppercase tracking-wider text-brand-darkgray">Filter by Brand</span>
            {user && user.role === 'admin' && (
              <button type="button" onClick={openAddBrand} className="ml-2 text-brand-gold cursor-pointer" aria-label="Add Brand">
                <PlusCircle size={14} />
              </button>
            )}
          </div>
          <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
            <span className="inline-flex min-w-0 justify-end">
              {selectedBrand !== "all" ? (
                <button type="button" onClick={()=>setSelectedBrand('all')} className="flex items-center gap-1 text-xs font-bold text-stone-500 transition-colors hover:text-red-500">
                  <X size={12} /> Reset Brand
                </button>
              ) : (
                <span className="invisible text-xs font-bold">Reset Brand</span>
              )}
            </span>
            {availableBrands.length > 8 ? (
              <button type="button" onClick={()=>setShowAllBrands(!showAllBrands)} className="flex items-center gap-1 whitespace-nowrap text-xs font-bold text-brand-gold-dark transition-colors hover:text-brand-black">
                {showAllBrands ? <><span>Show Less</span> <ChevronUp size={13} /></> : <><span>View All ({availableBrands.length})</span> <ChevronDown size={13} /></>}
              </button>
            ) : (
              <span className="invisible whitespace-nowrap text-xs font-bold">View All (0)</span>
            )}
          </div>
        </div>
        <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-1">
          {/* All Brands pill */}
          <button
            type="button"
            onClick={()=>setSelectedBrand('all')}
            className={`category-filter-tab shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold tracking-wide transition-all duration-300 shadow-sm active:scale-95 touch-target border ${selectedBrand==='all' ? "bg-brand-black text-white border-brand-black shadow-luxury" : "bg-white text-brand-black border-stone-200 hover:border-brand-gold/50 hover:text-brand-black"}`}
            data-active={selectedBrand === 'all'}
          >
            <span className="pointer-events-none">All Brands</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full pointer-events-none ${selectedBrand==='all'?"bg-brand-gold text-brand-black font-extrabold":"filter-tab-count-badge"}`}>
              {selectedSubcategory==='all' ? categoryProducts.length : categoryProducts.filter((p)=>p.subcategory===selectedSubcategory).length}
            </span>
          </button>
          {(showAllBrands ? availableBrands : availableBrands.slice(0,8)).map((brand)=>{
            const isSelected = selectedBrand===brand;
            const brandCount = categoryProducts.filter(p=>p.brand===brand && (selectedSubcategory==='all' || p.subcategory===selectedSubcategory)).length;
            return (
              <div key={brand} className="relative">
                <button
                  type="button"
                  onClick={()=>setSelectedBrand(prev=>prev===brand?'all':brand)}
                  className={`category-filter-tab shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold tracking-wide transition-all duration-300 shadow-sm active:scale-95 touch-target border ${isSelected ? "bg-brand-black text-white border-brand-black shadow-luxury" : "bg-white text-brand-black border-stone-200 hover:border-brand-gold/50 hover:text-brand-black"}`}
                  data-active={isSelected}
                >
                  <span className="pointer-events-none">{brand}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full pointer-events-none ${isSelected?"bg-brand-gold text-brand-black font-extrabold":"filter-tab-count-badge"}`}>{brandCount}</span>
                </button>
                {user && user.role==='admin' && (
                  <div className="absolute -right-2 top-0 flex flex-col gap-1">
                    <button type="button" onClick={()=>openEditBrand(brand)} className="p-1 bg-white rounded-full shadow cursor-pointer"><Edit2 size={12} /></button>
                    <button type="button" onClick={()=>actions.deleteBrand(brand)} className="p-1 bg-white rounded-full shadow text-red-500 cursor-pointer"><Trash2 size={12} /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── SORT / FILTER BAR (sticky) ── */}
      <div
        style={{ top: 'var(--header-height, 124px)' }}
        className="category-control-bar sticky z-20 w-full max-w-full overflow-hidden bg-brand-cream/95 px-3 py-2 backdrop-blur-md shadow-sm sm:px-6"
      >
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex min-w-0">
              {(selectedSubcategory!=='all' || (selectedBrand && selectedBrand!=='all') || selectedPriceRange!=='all' || selectedSkinType!=='all') ? (
                <button type="button" onClick={()=>{ setSelectedSubcategory('all'); setSelectedBrand('all'); setSelectedPriceRange('all'); setSelectedSkinType('all'); }} className="flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-stone-400 hover:text-red-500 cursor-pointer">
                  <X size={13} /> Clear All Filters
                </button>
              ) : (
                <span className="invisible whitespace-nowrap text-xs font-semibold">Clear All Filters</span>
              )}
            </span>
            <span className="hidden text-xs font-medium text-stone-400 sm:inline">Showing <strong className="text-brand-black">{filteredProducts.length}</strong> items</span>
          </div>
          <div className="flex w-full min-w-0 items-center justify-end sm:w-auto">
            <div className="relative w-full min-w-0 sm:w-auto">
              <select value={sortBy} onChange={(e)=>setSortBy(e.target.value)} className="w-full min-w-0 appearance-none rounded-full border border-stone-200 bg-white py-2 pl-4 pr-9 text-xs font-semibold text-brand-black shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-gold/40 cursor-pointer sm:w-auto">
                <option value="price-asc">Price: Low to High (السعر من الأقل)</option>
                <option value="price-desc">Price: High to Low (السعر من الأكبر)</option>
                <option value="discount">Best Deals / Offers (أفضل العروض بناءً على نسبة الخصم)</option>
              </select>
              <ArrowUpDown size={12} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
            </div>
          </div>
        </div>
      </div>

      {user && user.role === 'admin' && (
        <div className="flex w-full justify-end pb-2">
          <button type="button" onClick={openAddProduct} className="inline-flex items-center gap-2 rounded-full bg-brand-black px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-brand-gold shadow-sm transition-all hover:bg-brand-charcoal">
            <PlusCircle size={14} /> Add Product
          </button>
        </div>
      )}

      {/* ── PRODUCT GRID ── */}
      {filteredProducts.length>0 ? (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">Products</h3>
              {user && user.role === 'admin' && (
                <button
                  type="button"
                  onClick={openAddProduct}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-brand-gold/40 bg-brand-gold/10 text-brand-gold shadow-sm transition hover:bg-brand-gold hover:text-brand-black"
                  aria-label="Add Product"
                  title="Add Product"
                >
                  <PlusCircle size={15} />
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {filteredProducts.map((product)=>(
              <ProductCard key={product.id} product={product} onAddToCart={onAddToCart} onQuickView={onQuickView} onWishlist={onWishlist} isWishlisted={wishlist.some(w=>w.id===product.id)} onEdit={user&&user.role==='admin'?openEditProduct:undefined} onDelete={user&&user.role==='admin'?handleDeleteProduct:undefined} />
            ))}
          </div>
        </>
      ) : (
        <div className="bg-white rounded-3xl p-12 text-center border border-brand-gold-border/40 shadow-luxury my-8 max-w-lg mx-auto">
          <div className="w-16 h-16 rounded-full bg-brand-gold-light text-brand-gold-dark flex items-center justify-center mx-auto mb-4 border border-brand-gold/30"><Filter size={24} /></div>
          <h3 className="font-serif-luxury text-2xl font-bold text-brand-black mb-2">No Products Found</h3>
          <p className="text-sm text-stone-500 mb-6">There are no products matching this combination of sub-category and brand filters.</p>
          <button type="button" onClick={()=>{ setSelectedSubcategory('all'); setSelectedBrand('all'); setSelectedPriceRange('all'); setSelectedSkinType('all'); }} className="px-6 py-3 bg-brand-black text-brand-gold font-bold text-xs uppercase tracking-wider rounded-full hover:bg-brand-charcoal transition-all shadow-md cursor-pointer">Reset All Filters</button>
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
    subcategory: string;
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

  const [form, setForm] = useState<ProductFormState>(() => {
    if (mode === 'editProduct' && editing && 'id' in editing) {
      const sellingValue = (editing as any).sellingPrice ?? '';
      const marketValue = (editing as any).marketPrice ?? (editing as any).originalPrice ?? '';
      const adminValue = (editing as any).adminCost ?? (editing as any).cost ?? '';
      const imageValue = (editing as any).image_url ?? (editing as any).image ?? '';
      const descriptionValue = (editing as any).description ?? (editing as any).details ?? '';
      return {
        ...editing,
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
  });

  useEffect(() => {
    setSimpleLabel(
      mode === 'editSub' && editing && 'sub' in editing ? editing.sub.label || '' :
      mode === 'editBrand' && editing && 'brand' in editing ? editing.brand || '' : ''
    );

    if (mode === 'editProduct' && editing && 'id' in editing) {
      const sellingValue = (editing as any).sellingPrice ?? '';
      const marketValue = (editing as any).marketPrice ?? (editing as any).originalPrice ?? '';
      const adminValue = (editing as any).adminCost ?? (editing as any).cost ?? '';
      const imageValue = (editing as any).image_url ?? (editing as any).image ?? '';
      const descriptionValue = (editing as any).description ?? (editing as any).details ?? '';
      const mapped: ProductFormState = {
        ...editing,
        adminCost: adminValue !== undefined && adminValue !== null ? String(adminValue) : '',
        marketPrice: marketValue !== undefined && marketValue !== null ? String(marketValue) : '',
        sellingPrice: sellingValue !== undefined && sellingValue !== null ? String(sellingValue) : '',
        image: imageValue || '',
        description: descriptionValue || '',
      };
      setForm(mapped);
    } else if (mode === 'addProduct') {
      const defaultSub = assignableSubcategories[0]?.id || 'general';
      const defaultBrand = mergedBrands[0] || '';
      setForm({
        name: '',
        category: category?.id || '',
        subcategory: defaultSub,
        brand: defaultBrand,
        adminCost: '',
        marketPrice: '',
        sellingPrice: '',
        rating: 5,
        reviews: 1,
        image: '',
        description: '',
      });
    }
  }, [mode, editing, category, mergedBrands, assignableSubcategories]);

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
              onChange={(e) => setForm({ ...form, name: e.target.value })}
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
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
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
                value={form.subcategory}
                onChange={(e) => setForm({ ...form, subcategory: e.target.value })}
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
                onChange={(e) => setForm({ ...form, adminCost: e.target.value })}
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
                onChange={(e) => setForm({ ...form, marketPrice: e.target.value })}
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
                onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
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
                onChange={(e) => setForm({ ...form, image: e.target.value })}
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
                  onClick={() => setForm({ ...form, image: '' })}
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
              onChange={(e) => setForm({ ...form, description: e.target.value })}
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
            value={simpleLabel}
            onChange={(e) => setSimpleLabel(e.target.value)}
            placeholder={mode === 'addBrand' || mode === 'editBrand' ? 'e.g. CeraVe' : 'e.g. Face Cleansers'}
            className="w-full min-h-[34px] rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-[15px] focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/40 sm:min-h-[38px]"
            autoFocus
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
