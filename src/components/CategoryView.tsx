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
  allProducts?: Product[];
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
  allProducts = [],
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

  const effectiveProducts = contextProducts && contextProducts.length > 0 ? contextProducts : allProducts;
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
        const pa = typeof a.sellingPrice==='number' ? a.sellingPrice : (a.price||0);
        const pb = typeof b.sellingPrice==='number' ? b.sellingPrice : (b.price||0);
        return pa-pb;
      }); break;
      case "price-desc": result.sort((a,b)=>{
        const pa = typeof a.sellingPrice==='number' ? a.sellingPrice : (a.price||0);
        const pb = typeof b.sellingPrice==='number' ? b.sellingPrice : (b.price||0);
        return pb-pa;
      }); break;
      case "rating": result.sort((a,b)=>b.rating-a.rating); break;
      case "popular": result.sort((a,b)=>b.reviews-a.reviews); break;
      case "discount": result.sort((a,b)=>{
        const da = a.marketPrice ? ((a.marketPrice - (typeof a.sellingPrice==='number'?a.sellingPrice:(a.price||0)))/a.marketPrice) : 0;
        const db = b.marketPrice ? ((b.marketPrice - (typeof b.sellingPrice==='number'?b.sellingPrice:(b.price||0)))/b.marketPrice) : 0;
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 pb-28 md:pb-12 space-y-8 animate-fadeIn">
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
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Tag size={14} className="text-brand-gold" />
            <span className="text-xs font-bold uppercase tracking-wider text-brand-darkgray">Filter by Brand</span>
            {user && user.role === 'admin' && (
              <button type="button" onClick={openAddBrand} className="ml-2 text-brand-gold cursor-pointer" aria-label="Add Brand">
                <PlusCircle size={14} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {selectedBrand !== "all" && (
              <button type="button" onClick={()=>setSelectedBrand('all')} className="text-xs font-bold text-stone-500 hover:text-red-500 transition-colors flex items-center gap-1">
                <X size={12} /> Reset Brand
              </button>
            )}
            {availableBrands.length > 8 && (
              <button type="button" onClick={()=>setShowAllBrands(!showAllBrands)} className="text-xs font-bold text-brand-gold-dark hover:text-brand-black transition-colors flex items-center gap-1">
                {showAllBrands ? <><span>Show Less</span> <ChevronUp size={13} /></> : <><span>View All ({availableBrands.length})</span> <ChevronDown size={13} /></>}
              </button>
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
        className="category-control-bar sticky z-20 bg-brand-cream/95 backdrop-blur-md py-2 -mx-4 sm:-mx-6 px-4 sm:px-6 border-b border-brand-gold-border/30 shadow-sm"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {(selectedSubcategory!=='all' || (selectedBrand && selectedBrand!=='all') || selectedPriceRange!=='all' || selectedSkinType!=='all') && (
              <button type="button" onClick={()=>{ setSelectedSubcategory('all'); setSelectedBrand('all'); setSelectedPriceRange('all'); setSelectedSkinType('all'); }} className="flex items-center gap-1 text-xs font-semibold text-stone-400 hover:text-red-500 cursor-pointer">
                <X size={13} /> Clear All Filters
              </button>
            )}
            <span className="text-xs text-stone-400 font-medium hidden sm:inline">Showing <strong className="text-brand-black">{filteredProducts.length}</strong> items</span>
          </div>
          <div className="flex items-center gap-3">
            {user && user.role==='admin' && (
              <button type="button" onClick={openAddProduct} className="flex items-center gap-2 px-3 py-2 bg-black text-white rounded text-xs cursor-pointer hidden sm:inline-flex">
                <PlusCircle size={14} /> Add Product
              </button>
            )}
            <div className="relative">
              <select value={sortBy} onChange={(e)=>setSortBy(e.target.value)} className="appearance-none bg-white border border-stone-200 text-brand-black text-xs font-semibold rounded-full pl-4 pr-9 py-2 focus:outline-none focus:ring-2 focus:ring-brand-gold/40 cursor-pointer shadow-sm">
                <option value="price-asc">Price: Low to High (السعر من الأقل)</option>
                <option value="price-desc">Price: High to Low (السعر من الأكبر)</option>
                <option value="discount">Best Deals / Offers (أفضل العروض بناءً على نسبة الخصم)</option>
              </select>
              <ArrowUpDown size={12} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

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
  const [customBrandMode, setCustomBrandMode] = useState(false);

  // Combine category brands, global brands, and available brands
  const mergedBrands = useMemo(() => {
    const set = new Set<string>();
    (availableBrands || []).forEach((b) => b && set.add(b));
    (category.brands || []).forEach((b) => b && set.add(b));
    (allBrands || []).forEach((b) => b && set.add(b));
    return Array.from(set);
  }, [availableBrands, category.brands, allBrands]);

  // Filter out the "all" pseudo-subcategory for assignment
  const assignableSubcategories = useMemo(() => {
    return (category.subcategories || []).filter((s) => s.id !== 'all');
  }, [category.subcategories]);

  const [form, setForm] = useState<ProductFormState>(() => {
    if (mode === 'editProduct' && editing && 'id' in editing) {
      return {
        ...editing,
        adminCost: editing.adminCost !== undefined ? String(editing.adminCost) : '',
        marketPrice: editing.marketPrice !== undefined ? String(editing.marketPrice) : '',
        sellingPrice: editing.sellingPrice !== undefined ? String(editing.sellingPrice) : '',
        image: editing.image || '',
        description: editing.description || '',
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
      const mapped: ProductFormState = {
        ...editing,
        adminCost: editing.adminCost !== undefined ? String(editing.adminCost) : '',
        marketPrice: editing.marketPrice !== undefined ? String(editing.marketPrice) : '',
        sellingPrice: editing.sellingPrice !== undefined ? String(editing.sellingPrice) : '',
        image: editing.image || '',
        description: editing.description || '',
      };
      setForm(mapped);
      setCustomBrandMode(Boolean(editing.brand && !mergedBrands.includes(editing.brand)));
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
        description: '',
        image: '',
        rating: 5,
        reviews: 1,
      });
      setCustomBrandMode(false);
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
      const parsedSell = parseFloat(String(form.sellingPrice).trim());
      const parsedMarket =
        form.marketPrice && String(form.marketPrice).trim() !== '' && !isNaN(Number(form.marketPrice))
          ? parseFloat(String(form.marketPrice).trim())
          : parsedSell;
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
        price: parsedSell,
        originalPrice: parsedMarket,
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
      const parsedSell = parseFloat(String(form.sellingPrice).trim());
      const parsedMarket =
        form.marketPrice && String(form.marketPrice).trim() !== '' && !isNaN(Number(form.marketPrice))
          ? parseFloat(String(form.marketPrice).trim())
          : parsedSell;
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
        price: parsedSell,
        originalPrice: parsedMarket,
        image: form.image.trim() || undefined,
        description: form.description.trim(),
      };

      actions.updateProduct(form.id, updated);
      if (onProductSaved) {
        onProductSaved({ ...form, ...updated } as Product);
      }
      onClose();
    } else if (mode === 'addSub') {
      const trimmed = simpleLabel.trim();
      if (!trimmed) return;
      const id = trimmed.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
      actions.addSubcategory(category.id, { id, label: trimmed });
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
    <div className="space-y-1.5 text-brand-black">
      {(mode === 'addProduct' || mode === 'editProduct') && (
        <div className="space-y-1.5">
          <div>
            <label className="block text-[10px] font-semibold text-stone-700 mb-0.5">
              Product Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Cerave Hydrating Cleanser"
              className="w-full py-1.5 px-2 text-xs bg-stone-50 border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
            />
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <div className="flex items-center justify-between mb-0.5 gap-1">
                <label className="block text-[10px] font-semibold text-stone-700">
                  Brand <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setCustomBrandMode(!customBrandMode)}
                  className="text-[8px] text-brand-gold-dark hover:underline cursor-pointer whitespace-nowrap"
                >
                  {customBrandMode ? 'Use list' : '+ Custom'}
                </button>
              </div>
              {customBrandMode || mergedBrands.length === 0 ? (
                <input
                  type="text"
                  placeholder="Brand"
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  className="w-full py-1.5 px-2 text-xs bg-stone-50 border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
                />
              ) : (
                <select
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  className="w-full py-1.5 px-2 text-xs bg-stone-50 border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
                >
                  <option value="">Select</option>
                  {mergedBrands.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-stone-700 mb-0.5">
                Sub-Category <span className="text-red-500">*</span>
              </label>
              <select
                value={form.subcategory}
                onChange={(e) => setForm({ ...form, subcategory: e.target.value })}
                className="w-full py-1.5 px-2 text-xs bg-stone-50 border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
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

          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <label className="block text-[9px] font-semibold text-stone-600 mb-0.5">
                Cost
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={form.adminCost}
                onChange={(e) => setForm({ ...form, adminCost: e.target.value })}
                placeholder="150"
                className="w-full py-1.5 px-2 text-xs bg-stone-50 border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
              />
            </div>
            <div>
              <label className="block text-[9px] font-semibold text-stone-600 mb-0.5">General</label>
              <input
                type="text"
                inputMode="decimal"
                value={form.marketPrice}
                onChange={(e) => setForm({ ...form, marketPrice: e.target.value })}
                placeholder="280"
                className="w-full py-1.5 px-2 text-xs bg-stone-50 border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
              />
            </div>
            <div>
              <label className="block text-[9px] font-semibold text-stone-600 mb-0.5">
                Store <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={form.sellingPrice}
                onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
                placeholder="220"
                className="w-full py-1.5 px-2 text-xs bg-stone-50 border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold font-bold text-brand-black"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-stone-700 mb-0.5">Product Image</label>
            <div className="space-y-1">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageFileChange}
                className="w-full text-[9px] text-stone-500 file:mr-1.5 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-[9px] file:font-semibold file:bg-brand-black file:text-white hover:file:bg-brand-charcoal file:cursor-pointer py-1 px-1.5 border border-stone-200 rounded-md bg-stone-50"
              />
              <input
                type="text"
                placeholder="Image URL"
                value={form.image.startsWith('data:') ? '' : form.image}
                onChange={(e) => setForm({ ...form, image: e.target.value })}
                className="w-full py-1.5 px-2 text-[10px] bg-stone-50 border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold placeholder:text-stone-400"
              />
            </div>
            {form.image && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="w-10 h-10 rounded-md overflow-hidden border border-stone-200 bg-white shrink-0">
                  <img src={form.image} alt="Preview" className="w-full h-full object-cover" />
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
            <label className="block text-[10px] font-semibold text-stone-700 mb-0.5">Description</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Details..."
              className="w-full py-1.5 px-2 text-xs bg-stone-50 border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold placeholder:text-stone-400 resize-none"
            />
          </div>
        </div>
      )}

      {/* addSub / editSub / addBrand — simple text forms */}
      {(mode === 'addSub' || mode === 'editSub' || mode === 'addBrand' || mode === 'editBrand') && (
        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            {mode === 'addBrand' || mode === 'editBrand' ? 'Brand Name' : 'Subcategory Label'}
          </label>
          <input
            value={simpleLabel}
            onChange={(e) => setSimpleLabel(e.target.value)}
            placeholder={mode === 'addBrand' || mode === 'editBrand' ? 'e.g. CeraVe' : 'e.g. Face Cleansers'}
            className="w-full p-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
            autoFocus
          />
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-1.5 pt-1.5 border-t border-stone-100 sticky bottom-0 bg-white">
        <button
          type="button"
          onClick={onClose}
          className="px-2.5 py-1.5 text-[10px] font-semibold text-stone-600 hover:text-brand-black rounded-md transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          className="px-3 py-1.5 text-[10px] font-semibold bg-brand-black text-white rounded-md shadow-luxury hover:bg-brand-charcoal transition-all active:scale-98 cursor-pointer"
        >
          {mode === 'addProduct' ? 'Save' : 'Save'}
        </button>
      </div>
    </div>
  );
}
