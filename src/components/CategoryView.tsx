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

type ModalMode = 'addProduct' | 'editProduct' | 'addSub' | 'editSub' | 'addBrand' | null;
type EditingState = Product | { categoryId: string; sub: CategorySubcategory } | null;

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
  const { categories, priceRanges, actions, brands: ALL_BRANDS } = useData();
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

  const categoryProducts = useMemo(() => allProducts.filter((p) => p.category === categoryId), [allProducts, categoryId]);

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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 pb-28 md:pb-12 space-y-8 animate-fadeIn">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-black via-brand-charcoal to-brand-stone text-white p-8 sm:p-10 shadow-luxury border border-brand-gold/20">
        <div className="absolute top-0 right-0 w-80 h-80 bg-brand-gold/15 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-gold/20 border border-brand-gold/40 text-brand-gold text-xs font-bold uppercase tracking-wider mb-3">
            <Sparkles size={13} />
            <span>PhM Department</span>
          </div>
          <h1 className="font-serif-luxury text-4xl sm:text-5xl font-bold tracking-tight text-white mb-2">{category.label}</h1>
          <p className="font-tagline text-base sm:text-lg text-brand-gold mb-2">Ur favorite Mono choice in {category.label.toLowerCase()}</p>
          <p className="text-xs sm:text-sm text-stone-300 leading-relaxed max-w-lg">Showing {filteredProducts.length} of {categoryProducts.length} authentic formulations. Filter by sub-category or official brand below.</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Tag size={14} className="text-brand-gold" />
            <span className="text-xs font-bold uppercase tracking-wider text-brand-darkgray">Sub-Categories Breakdown</span>
            {user && user.role === 'admin' && <button onClick={openAddSub} className="ml-2 text-brand-gold"><PlusCircle size={14} /></button>}
          </div>
          <span className="text-xs text-stone-400 font-medium">{selectedSubcategory === "all" ? "All Sub-Categories" : category.subcategories.find(s=>s.id===selectedSubcategory)?.label}</span>
        </div>
        <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-1">
          {category.subcategories.map((sub) => {
            const isActive = selectedSubcategory === sub.id;
            const subCount = sub.id === "all" ? categoryProducts.length : categoryProducts.filter((p)=>p.subcategory===sub.id).length;
            return (
              <div key={sub.id} className="relative">
                <button onClick={()=>setSelectedSubcategory(sub.id)} className={`shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold tracking-wide transition-all duration-300 shadow-sm active:scale-95 ${isActive?"bg-brand-black text-brand-gold border border-brand-gold/60":"bg-white text-stone-600 border border-stone-200 hover:border-brand-gold/50 hover:text-brand-black"}`}>
                  <span>{sub.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive?"bg-brand-gold text-brand-black font-extrabold":"bg-stone-100 text-stone-500"}`}>{subCount}</span>
                </button>
                {user && user.role==='admin' && sub.id !== 'all' && (
                  <div className="absolute -right-2 top-0 flex flex-col gap-1">
                    <button onClick={()=>{ setEditing({categoryId: categoryId, sub}); setModalMode('editSub'); setModalOpen(true); }} className="p-1 bg-white rounded-full shadow"><Edit2 size={12} /></button>
                    <button onClick={()=>{ actions.deleteSubcategory(categoryId, sub.id); }} className="p-1 bg-white rounded-full shadow text-red-500"><Trash2 size={12} /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-brand-gold-border/50 shadow-luxury">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-brand-gold" />
              <h2 className="text-xs font-bold tracking-widest text-brand-black uppercase flex items-center gap-2">
                <span>Filter by Brand {selectedBrand !== "all" && <span className="text-brand-gold-dark font-extrabold">• ({selectedBrand})</span>}</span>
                {user && user.role === 'admin' && (
                  <button onClick={openAddBrand} className="text-brand-gold p-1 rounded hover:bg-brand-cream/50" aria-label="Add Brand"><PlusCircle size={14} /></button>
                )}
              </h2>
            </div>
            <div className="flex items-center gap-3">
            {selectedBrand !== "all" && (<button onClick={()=>setSelectedBrand('all')} className="text-xs font-bold text-stone-500 hover:text-red-500 transition-colors flex items-center gap-1"><X size={12} /> Reset Brand</button>)}
            {availableBrands.length > 8 && (<button onClick={()=>setShowAllBrands(!showAllBrands)} className="text-xs font-bold text-brand-gold-dark hover:text-brand-black transition-colors flex items-center gap-1">{showAllBrands ? <>Show Less <ChevronUp size={13} /></> : <>View All ({availableBrands.length}) <ChevronDown size={13} /></>}</button>)}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-2.5">
          <button onClick={()=>setSelectedBrand('all')} className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-semibold border transition-all duration-200 active:scale-95 ${selectedBrand==='all'?'bg-brand-black text-brand-gold border-brand-black font-bold shadow-sm':'bg-brand-cream/60 text-stone-700 border-stone-200 hover:border-brand-gold/50 hover:bg-white'}`}>
            <span>All Brands</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${selectedBrand==='all'?'bg-brand-gold text-brand-black font-bold':'bg-stone-200/80 text-stone-500'}`}>{selectedSubcategory==='all'?categoryProducts.length:categoryProducts.filter((p)=>p.subcategory===selectedSubcategory).length}</span>
          </button>
          { (showAllBrands ? availableBrands : availableBrands.slice(0,8)).map((brand)=>{
            const isSelected = selectedBrand===brand;
            const brandCount = categoryProducts.filter(p=>p.brand===brand && (selectedSubcategory==='all' || p.subcategory===selectedSubcategory)).length;
            return (
              <button key={brand} onClick={()=>setSelectedBrand(prev=>prev===brand?'all':brand)} className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-semibold border transition-all duration-200 active:scale-95 ${isSelected?'bg-brand-gold text-brand-black border-brand-gold shadow-sm font-bold scale-102':'bg-brand-cream/60 text-stone-700 border-stone-200 hover:border-brand-gold/50 hover:bg-white'}`}>
                <span>{brand}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isSelected?'bg-brand-black text-brand-gold font-bold':'bg-stone-200/80 text-stone-500'}`}>{brandCount}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
          { (selectedSubcategory!=='all' || (selectedBrand && selectedBrand!=='all') || selectedPriceRange!=='all' || selectedSkinType!=='all') && (<button onClick={()=>{ setSelectedSubcategory('all'); setSelectedBrand('all'); setSelectedPriceRange('all'); setSelectedSkinType('all'); }} className="flex items-center gap-1 text-xs font-semibold text-stone-400 hover:text-red-500"> <X size={13} /> Clear All Filters</button>) }
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-stone-400 font-medium hidden sm:inline">Showing <strong className="text-brand-black">{filteredProducts.length}</strong> items</span>
          {user && user.role==='admin' && (
            <button onClick={openAddProduct} className="flex items-center gap-2 px-3 py-2 bg-black text-white rounded hidden sm:inline"><PlusCircle size={14} /> Add Product</button>
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

      

      {filteredProducts.length>0 ? (
        <>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Products</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {filteredProducts.map((product)=> (
              <ProductCard key={product.id} product={product} onAddToCart={onAddToCart} onQuickView={onQuickView} onWishlist={onWishlist} isWishlisted={wishlist.some(w=>w.id===product.id)} onEdit={user&&user.role==='admin'?openEditProduct:undefined} onDelete={user&&user.role==='admin'?handleDeleteProduct:undefined} />
            ))}
          </div>
        </>
      ) : (
        <div className="bg-white rounded-3xl p-12 text-center border border-brand-gold-border/40 shadow-luxury my-8 max-w-lg mx-auto">
          <div className="w-16 h-16 rounded-full bg-brand-gold-light text-brand-gold-dark flex items-center justify-center mx-auto mb-4 border border-brand-gold/30"><Filter size={24} /></div>
          <h3 className="font-serif-luxury text-2xl font-bold text-brand-black mb-2">No Products Found</h3>
          <p className="text-sm text-stone-500 mb-6">There are no products matching this combination of sub-category and brand filters.</p>
          <button onClick={()=>{ setSelectedSubcategory('all'); setSelectedBrand('all'); setSelectedPriceRange('all'); setSelectedSkinType('all'); }} className="px-6 py-3 bg-brand-black text-brand-gold font-bold text-xs uppercase tracking-wider rounded-full hover:bg-brand-charcoal transition-all shadow-md">Reset All Filters</button>
        </div>
      )}

      <AdminModal open={modalOpen} title={modalMode==='addProduct'?'Add Product': modalMode==='editProduct'?'Edit Product': modalMode==='addSub'?'Add Subcategory': modalMode==='editSub'?'Edit Subcategory': modalMode==='addBrand'?'Add Brand':''} onClose={()=>setModalOpen(false)}>
        <ModalContent mode={modalMode} category={category} editing={editing} onClose={()=>setModalOpen(false)} actions={actions} availableBrands={availableBrands} onBrandAdded={(name)=>{ if(name){ setSelectedBrand(name); setShowAllBrands(true); } }} />
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
  onBrandAdded?: (name: string) => void;
}

function ModalContent({ mode, category, editing, onClose, actions, availableBrands, onBrandAdded }: ModalContentProps){
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

  const [form, setForm] = useState<ProductFormState>(() => {
    if (mode === 'editProduct' && editing && 'id' in editing) {
      return {
        ...editing,
        adminCost: editing.adminCost !== undefined ? String(editing.adminCost) : '',
        marketPrice: editing.marketPrice !== undefined ? String(editing.marketPrice) : '',
        sellingPrice: editing.sellingPrice !== undefined ? String(editing.sellingPrice) : '',
        image: editing.image || '',
      };
    }
    return {
      name: '',
      brand: (availableBrands && availableBrands[0]) || '',
      category: category?.id || '',
      subcategory: category?.subcategories?.[0]?.id || 'all',
      adminCost: '',
      marketPrice: '',
      sellingPrice: '',
      rating: 0,
      reviews: 0,
      image: '',
      description: '',
    };
  });

  useEffect(()=>{
    if (mode === 'editProduct' && editing && 'id' in editing) {
      const mapped: ProductFormState = {
        ...editing,
        adminCost: editing.adminCost !== undefined ? String(editing.adminCost) : '',
        marketPrice: editing.marketPrice !== undefined ? String(editing.marketPrice) : '',
        sellingPrice: editing.sellingPrice !== undefined ? String(editing.sellingPrice) : '',
        image: editing.image || '',
      };
      setForm(mapped);
    }
    if (mode === 'addProduct') {
      setForm((f) => ({
        ...f,
        category: category?.id || '',
        subcategory: category?.subcategories?.[0]?.id || 'all',
        brand: (availableBrands && availableBrands[0]) || '',
        adminCost: '',
        marketPrice: '',
        sellingPrice: '',
      }));
    }
    if (mode === 'addBrand' || mode === 'addSub') {
      setForm((f) => ({ ...f, name: '' }));
    }
  }, [mode, editing, category, availableBrands]);

  const submit = ()=>{
    if (mode === 'addProduct') {
      if (!form.brand || form.brand === '') {
        alert('Please select a Brand before saving the product.');
        return;
      }
      if (!form.subcategory || form.subcategory === '') {
        alert('Please select a Sub-category before saving the product.');
        return;
      }
      if (!form.marketPrice || String(form.marketPrice).trim() === '' || isNaN(Number(String(form.marketPrice).trim()))) {
        alert('Please enter a valid General Price.');
        return;
      }
      if (!form.sellingPrice || String(form.sellingPrice).trim() === '' || isNaN(Number(String(form.sellingPrice).trim()))) {
        alert('Please enter a valid Store Price.');
        return;
      }
      const parsedAdmin = form.adminCost && String(form.adminCost).trim() !== '' ? parseFloat(String(form.adminCost).trim()) : undefined;
      const parsedMarket = parseFloat(String(form.marketPrice).trim());
      const parsedSell = parseFloat(String(form.sellingPrice).trim());
      const prod: Product = {
        id: Date.now(),
        name: form.name.trim(),
        brand: form.brand,
        category: category.id,
        subcategory: form.subcategory,
        adminCost: parsedAdmin,
        marketPrice: parsedMarket,
        sellingPrice: parsedSell,
        price: parsedSell,
        originalPrice: parsedMarket,
        rating: Number(form.rating) || 0,
        reviews: Number(form.reviews) || 0,
        image: form.image || '',
        description: form.description,
      };
      actions.addProduct(prod);
    } else if (mode === 'editProduct') {
      if (!form.id) {
        alert('Product is missing an id and cannot be updated.');
        return;
      }
      if (!form.marketPrice || String(form.marketPrice).trim() === '' || isNaN(Number(String(form.marketPrice).trim()))) {
        alert('Please enter a valid General Price.');
        return;
      }
      if (!form.sellingPrice || String(form.sellingPrice).trim() === '' || isNaN(Number(String(form.sellingPrice).trim()))) {
        alert('Please enter a valid Store Price.');
        return;
      }
      const market = parseFloat(String(form.marketPrice).trim());
      const sell = parseFloat(String(form.sellingPrice).trim());
      const adminCost = form.adminCost && String(form.adminCost).trim() !== '' ? parseFloat(String(form.adminCost).trim()) : undefined;
      const updated: Partial<Product> = {
        name: form.name.trim(),
        brand: form.brand,
        category: category.id,
        subcategory: form.subcategory,
        adminCost,
        marketPrice: market,
        sellingPrice: sell,
        price: sell,
        originalPrice: market,
        rating: Number(form.rating) || 0,
        reviews: Number(form.reviews) || 0,
        image: form.image || '',
        description: form.description,
      };
      actions.updateProduct(form.id, updated);
    } else if (mode === 'addSub') {
      const id = form.name.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
      if (form.name && form.name.trim()) actions.addSubcategory(category.id, { id, label: form.name.trim() });
    } else if (mode === 'editSub') {
      if (!editing || !("sub" in editing)) return;
      actions.updateSubcategory(category.id, editing.sub.id, { label: form.name });
    } else if (mode === 'addBrand') {
      const name = (form.name || '').trim();
      if (name) {
        const exists = (availableBrands || []).some((b) => String(b).toLowerCase() === name.toLowerCase());
        if (exists) {
          alert('Brand already exists in this category.');
          return;
        }
        actions.addBrand(name, category.id);
        if (typeof onBrandAdded === 'function') onBrandAdded(name);
      }
    }
    onClose();
  };

  return (
    <div className="space-y-3">
      {(mode==='addProduct'||mode==='editProduct') && (
        <div className="grid grid-cols-2 gap-2">
          <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Name" className="p-2 border rounded" />
          <select value={form.brand} onChange={e=>setForm({...form,brand:e.target.value})} className="p-2 border rounded" required>
            {(availableBrands && availableBrands.length ? availableBrands : []).map(b => <option key={b} value={b}>{b}</option>)}
            {!availableBrands?.length && <option value="">No Brands</option>}
          </select>
          <select value={form.subcategory} onChange={e=>setForm({...form,subcategory:e.target.value})} className="p-2 border rounded" required>
            {category.subcategories.map(s=> <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <div className="space-y-2">
            <input value={form.adminCost} type="text" inputMode="decimal" onChange={e=>setForm({...form,adminCost:e.target.value})} placeholder="Our Price" className="p-2 border rounded" />
            <input value={form.marketPrice} type="text" inputMode="decimal" onChange={e=>setForm({...form,marketPrice:e.target.value})} placeholder="General Price" className="p-2 border rounded" />
            <input value={form.sellingPrice} type="text" inputMode="decimal" onChange={e=>setForm({...form,sellingPrice:e.target.value})} placeholder="Store Price" className="p-2 border rounded" />
          </div>
          <div className="col-span-2 space-y-2">
            <input type="file" accept="image/*" onChange={(e)=>{
              const file = e.target.files && e.target.files[0];
              if(!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                const result = typeof reader.result === 'string' ? reader.result : '';
                setForm(f => ({ ...f, image: result }));
              };
              reader.readAsDataURL(file);
            }} className="p-2 border rounded w-full" />
            {form.image && (
              <div className="w-36 h-36 rounded overflow-hidden border"><img src={form.image} alt="preview" className="w-full h-full object-cover"/></div>
            )}
          </div>
          <textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Description" className="p-2 border rounded col-span-2" />
        </div>
      )}
      {(mode==='addSub'||mode==='editSub'||mode==='addBrand') && (
        <div>
          <input value={form.name||''} onChange={e=>setForm({...form,name:e.target.value})} placeholder={mode==='addBrand'?'Brand name':'Subcategory label'} className="w-full p-2 border rounded" />
        </div>
      )}
      <div className="flex justify-end gap-2"><button onClick={onClose}>Cancel</button><button onClick={submit} className="px-3 py-2 bg-black text-white rounded">Save</button></div>
    </div>
  );
}
