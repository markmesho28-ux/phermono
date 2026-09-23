import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Wind,
  Palette,
  Droplets,
  Star,
  Home,
  ChevronRight,
  PlusCircle,
  Edit2,
  Trash2,
  X,
  ClipboardList,
  Upload,
  Info,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useData, uploadImageFile } from "../contexts/DataContext";
import { checkIsAdminRole } from "../utils/admin";
import AdminModal from "./AdminModal";
import type { Category } from "../types";

const ICONS = { Sparkles, Wind, Palette, Droplets, Star };

interface SidebarProps {
  activeCategory: string;
  onSelect: (id: string) => void;
  mobileOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ activeCategory, onSelect, mobileOpen = false, onClose }: SidebarProps) {
  const { user } = useAuth();
  const isAdmin = Boolean(user && checkIsAdminRole(user));
  const { categories: CATEGORIES, actions } = useData();
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<'add' | 'edit'>('add');
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const lastBackdropClickRef = useRef(0);
  // Sidebar open state is controlled by parent via `mobileOpen` prop to maintain a single source of truth.
  // Any close actions should call onClose so the parent can update its state.

  // Sidebar open state is controlled by parent via `mobileOpen` prop to maintain a single source of truth.
  const isOpen = Boolean(mobileOpen);

  useEffect(() => {
    if (isOpen) {
      lastBackdropClickRef.current = Date.now();
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
    // Ensure body overflow is restored when closed
    document.body.style.overflow = '';
    return () => {};
  }, [isOpen]);

  const handleBackdropPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const now = Date.now();
    if (now - lastBackdropClickRef.current < 800) {
      return;
    }
    lastBackdropClickRef.current = now;
    if (onClose) onClose();
  };

  const openAddModal = (e?: React.MouseEvent) => {
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation();
    }
    setMode('add');
    setEditingCat(null);
    setModalOpen(true);
  };

  const openEditModal = (e: React.MouseEvent | undefined, cat: Category) => {
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation();
    }
    setMode('edit');
    setEditingCat(cat);
    setModalOpen(true);
  };

  const SidebarBody = () => (
    <>
      {/* Home Navigation */}
      <button
        type="button"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onSelect("home");
          if (onClose) onClose();
        }}
        onClick={(e) => e.stopPropagation()}
        style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
        className={`sidebar-nav-item w-full flex items-center justify-between px-4 py-3.5 rounded-[20px] border text-sm font-semibold tracking-[0.02em] transition-all duration-300 cursor-pointer pointer-events-auto touch-target ${
          String(activeCategory) === "home"
            ? "active border-[#f0dfa5] bg-[linear-gradient(135deg,#181410_0%,#2a211d_45%,#3a2b1e_100%)] text-white shadow-[0_18px_38px_rgba(26,20,15,0.24)]"
            : "border-transparent bg-white/40 text-stone-700 hover:border-[#f4e3c4] hover:bg-[#fffdf9] hover:text-brand-black"
        }`}
        data-active={String(activeCategory) === "home"}
      >
        <div className="flex items-center justify-between w-full pointer-events-none">
          <div className="flex items-center gap-3 pointer-events-none">
            <div className={`flex h-8 w-8 items-center justify-center rounded-xl border transition-colors pointer-events-none ${String(activeCategory) === "home" ? "border-[#d8b567] bg-[#f4d899] text-brand-black" : "border-[#f1e5d3] bg-[#f7f2ea] text-stone-500"}`}>
              <Home size={16} className="pointer-events-none" />
            </div>
            <span className="pointer-events-none">Home Overview</span>
          </div>
          {String(activeCategory) === "home" && <span className="h-2.5 w-2.5 rounded-full bg-brand-gold shadow-[0_0_0_4px_rgba(208,166,88,0.15)] pointer-events-none" />}
        </div>
      </button>

      {/* Orders Management (Admin only) */}
      {isAdmin && (
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onSelect('orders');
            if (onClose) onClose();
          }}
          onClick={(e) => e.stopPropagation()}
          style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
          className={`mt-1.5 sidebar-nav-item w-full flex items-center justify-between px-4 py-3.5 rounded-[20px] border text-sm font-semibold tracking-[0.02em] transition-all duration-300 cursor-pointer pointer-events-auto touch-target ${
            String(activeCategory) === 'orders'
              ? 'active border-[#f0dfa5] bg-[linear-gradient(135deg,#181410_0%,#2a211d_45%,#3a2b1e_100%)] text-white shadow-[0_18px_38px_rgba(26,20,15,0.24)]'
              : 'border-transparent bg-white/40 text-stone-700 hover:border-[#f4e3c4] hover:bg-[#fffdf9] hover:text-brand-black'
          }`}
          data-active={String(activeCategory) === 'orders'}
        >
          <div className="flex items-center justify-between w-full pointer-events-none">
            <div className="flex items-center gap-3 pointer-events-none">
              <div className={`flex h-8 w-8 items-center justify-center rounded-xl border transition-colors pointer-events-none ${String(activeCategory) === 'orders' ? 'border-[#d8b567] bg-[#f4d899] text-brand-black' : 'border-[#f1e5d3] bg-[#f7f2ea] text-stone-500'}`}>
                <ClipboardList size={16} className="pointer-events-none" />
              </div>
              <span className="pointer-events-none">Orders Management</span>
            </div>
            {String(activeCategory) === 'orders' && <span className="h-2.5 w-2.5 rounded-full bg-brand-gold shadow-[0_0_0_4px_rgba(208,166,88,0.15)] pointer-events-none" />}
          </div>
        </button>
      )}

      {/* Departments Label */}
      <div className="mt-5 mb-3 flex items-center justify-between rounded-full border border-[#f1e4cf] bg-[linear-gradient(135deg,rgba(255,255,255,0.8),rgba(249,242,233,0.8))] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
        <div className="flex items-center gap-3 pointer-events-none">
          <span className="text-[10px] font-black tracking-[0.22em] text-[#5e4638] uppercase pointer-events-none">Departments</span>
          {isAdmin && (
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                openAddModal();
              }}
              onClick={(e) => e.stopPropagation()}
              style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-[#efd7ab] bg-[#fffaf2] text-brand-gold transition-colors hover:bg-[#f9efdc] pointer-events-auto touch-target"
              title="Add Category"
            >
              <div className="pointer-events-none flex items-center justify-center">
                <PlusCircle size={14} className="pointer-events-none" />
              </div>
            </button>
          )}
        </div>
        <span className="pointer-events-none rounded-full bg-[#f7ebd8] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[#7d6147]">PhM Curated</span>
      </div>

      {/* Category Links */}
      <nav className="space-y-1.5">
        {CATEGORIES.map((cat) => {
          const Icon = ICONS[cat.icon as keyof typeof ICONS] || Sparkles;
          const isActive = String(activeCategory) === String(cat.id);

          return (
            <div key={cat.id} className="relative">
              <button
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onSelect(cat.id);
                  if (onClose) onClose();
                }}
                onClick={(e) => e.stopPropagation()}
                style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                className={`sidebar-nav-item w-full flex items-center justify-between px-4 py-3.5 rounded-[20px] border text-sm font-medium tracking-[0.02em] transition-all duration-300 group cursor-pointer pointer-events-auto touch-target ${
                  isActive
                    ? "active border-[#f0dfa5] bg-[linear-gradient(135deg,#181410_0%,#2a211d_45%,#3a2b1e_100%)] text-white shadow-[0_18px_38px_rgba(26,20,15,0.24)] font-semibold"
                    : "border-transparent bg-white/40 text-stone-700 hover:border-[#f4e3c4] hover:bg-[#fffdf9] hover:text-brand-black"
                }`}
                data-active={isActive}
              >
                {/* Left Side (Icon + Text) */}
                <div className="flex items-center gap-3.5 pointer-events-none">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-xl border transition-transform duration-300 group-hover:scale-110 pointer-events-none ${isActive ? "border-[#d8b567] bg-[#f4d899] text-brand-black shadow-sm" : "border-[#f1e5d3] bg-[#f7f2ea] text-stone-500 group-hover:bg-white group-hover:text-brand-gold-dark"}`}>
                    <Icon size={16} strokeWidth={isActive ? 2.5 : 2} className="pointer-events-none" />
                  </div>
                  <span className="pointer-events-none">{cat.label}</span>
                </div>

                {/* Right Side — spacer + arrow */}
                <div className="flex items-center gap-2 pointer-events-none">
                  {isAdmin && (
                    <div className="mr-1 flex gap-1 invisible" aria-hidden="true">
                      <div className="h-5 w-5 p-1" />
                      <div className="h-5 w-5 p-1" />
                    </div>
                  )}
                  <div className="pointer-events-none">
                    <ChevronRight size={14} className={`transition-all duration-200 pointer-events-none ${isActive ? "translate-x-0.5 text-brand-gold opacity-100" : "text-stone-300 opacity-0 group-hover:translate-x-0.5 group-hover:opacity-100"}`} />
                  </div>
                </div>
              </button>

              {/* Admin edit/delete buttons outside the nav button */}
              {isAdmin && (
                <div
                  className="absolute right-8 top-1/2 -translate-y-1/2 flex gap-1 z-10"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      openEditModal(undefined, cat);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                    className="p-1 rounded bg-white/80 hover:bg-white text-stone-700 cursor-pointer shadow-xs flex items-center justify-center touch-target"
                    title="Edit"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      actions.deleteCategory(cat.id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                    className="p-1 rounded bg-white/80 hover:bg-white text-red-500 cursor-pointer shadow-xs flex items-center justify-center touch-target"
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer / About Navigation Button */}
      <div className="pt-3 mt-3 border-t border-stone-100">
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onSelect("about");
            if (onClose) onClose();
          }}
          onClick={(e) => e.stopPropagation()}
          style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
          className={`sidebar-nav-item w-full flex items-center justify-between px-4 py-3.5 rounded-[20px] border text-sm font-medium tracking-[0.02em] transition-all duration-300 group cursor-pointer pointer-events-auto touch-target ${
            String(activeCategory) === "about"
              ? "active border-[#f0dfa5] bg-[linear-gradient(135deg,#181410_0%,#2a211d_45%,#3a2b1e_100%)] text-white shadow-[0_18px_38px_rgba(26,20,15,0.24)] font-semibold"
              : "border-transparent bg-white/40 text-stone-700 hover:border-[#f4e3c4] hover:bg-[#fffdf9] hover:text-brand-black"
          }`}
          data-active={String(activeCategory) === "about"}
        >
          <div className="flex items-center gap-3.5 pointer-events-none">
            <div className={`flex h-8 w-8 items-center justify-center rounded-xl border transition-transform duration-300 group-hover:scale-110 pointer-events-none ${
              String(activeCategory) === "about"
                ? "border-[#d8b567] bg-[#f4d899] text-brand-black shadow-sm"
                : "border-[#f1e5d3] bg-[#f7f2ea] text-stone-500 group-hover:bg-white group-hover:text-brand-gold-dark"
            }`}>
              <Info size={16} strokeWidth={String(activeCategory) === "about" ? 2.5 : 2} className="pointer-events-none" />
            </div>
            <span className="pointer-events-none">About PherMono</span>
          </div>

          <div className="pointer-events-none">
            <ChevronRight size={14} className={`transition-all duration-200 pointer-events-none ${
              String(activeCategory) === "about"
                ? "translate-x-0.5 text-brand-gold opacity-100"
                : "text-stone-300 opacity-0 group-hover:translate-x-0.5 group-hover:opacity-100"
            }`} />
          </div>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile drawer backdrop — full-screen overlay covering the entire viewport including the header */}
      <div
        data-testid="sidebar-backdrop"
        onPointerDown={handleBackdropPointerDown}
        style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
        className={`fixed inset-0 bg-brand-black/60 backdrop-blur-sm z-[90] transition-opacity duration-300 md:hidden ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden="true"
      />

      {/* Mobile off-canvas drawer — full viewport height taking up 80% screen width up to max-w-sm */}
      <aside
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
        className={`fixed left-0 top-0 w-4/5 sm:w-80 max-w-sm h-full z-[95] flex flex-col border-r border-[#f0e2c9] bg-[linear-gradient(180deg,rgba(255,253,251,0.96)_0%,rgba(248,242,233,0.97)_100%)] shadow-[0_24px_80px_rgba(35,25,18,0.18)] backdrop-blur-xl transition-transform duration-300 ease-out md:hidden ${
          isOpen ? "translate-x-0 pointer-events-auto" : "-translate-x-full pointer-events-none"
        }`}
        aria-label="Mobile categories navigation"
      >
        {/* Close button row — pinned at top of the drawer */}
        <div className="flex-none flex items-center justify-end px-4 py-3 border-b border-stone-100 bg-[#FAF8F5]/90">
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (onClose) onClose();
            }}
            onClick={(e) => e.stopPropagation()}
            style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
            className="p-2 rounded-full text-stone-400 hover:text-brand-black hover:bg-stone-200/60 transition-colors cursor-pointer touch-target"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable content — pt-3 ensures first item is clearly visible from the top */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="flex flex-col justify-start px-4 pt-3 pb-8">
            <SidebarBody />
          </div>
        </div>
      </aside>

      {/* Desktop sidebar — untouched */}
      <aside className="hidden md:flex flex-col w-72 shrink-0 border-r border-[#f0e2c9] bg-[linear-gradient(180deg,rgba(255,253,251,0.92)_0%,rgba(248,242,233,0.96)_100%)] backdrop-blur-xl shadow-[inset_-1px_0_0_rgba(240,226,201,0.9)] min-h-[calc(100vh-5rem)] sticky top-28 overflow-y-auto px-4 py-6">
        <div className="flex w-full flex-col rounded-[28px] border border-[#f4e7d3] bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.9),rgba(255,250,244,0.7)_38%,rgba(246,236,223,0.6)_100%)] p-3 shadow-[0_18px_42px_rgba(32,24,18,0.08)]">
          <SidebarBody />
        </div>
      </aside>

      {/* Admin Add/Edit Category Modal — portaled once directly to document.body */}
      <AdminModal open={modalOpen} title={mode==='add' ? 'Add Category' : 'Edit Category'} onClose={()=>setModalOpen(false)}>
        <CategoryForm initial={editingCat} onClose={()=>setModalOpen(false)} mode={mode} />
      </AdminModal>
    </>
  );
}

interface CategoryFormProps {
  initial: Category | null;
  onClose: () => void;
  mode: 'add' | 'edit';
}

function CategoryForm({ initial, onClose, mode }: CategoryFormProps){
  const { actions, categories } = useData();
  const [label, setLabel] = useState(initial?.label||'');
  const [image, setImage] = useState(initial?.image||'');
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const makeSlug = (text: string) => text.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const publicUrl = await uploadImageFile(file, 'products', 'categories');
      setImage(publicUrl);
    } catch (error: any) {
      alert(error?.message || 'Image upload failed.');
    } finally {
      setIsProcessing(false);
      e.target.value = '';
    }
  };

  const submit = (e?: React.MouseEvent | any) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if(mode==='add'){
      if(!label.trim()) return;
      let slug = makeSlug(label);
      let suffix = 1;
      const exists = (s: string) => categories.some((c: Category) => c.id === s);
      let base = slug;
      while(exists(slug)){
        slug = `${base}-${suffix++}`;
      }
      actions.addCategory({ id: slug, label: label.trim(), icon: 'Sparkles', color: '', accent: '', image: image.trim(), subcategories: [{ id: 'all', label: 'All' }], brands: [] });
    } else {
      if (!initial) return;
      actions.updateCategory(initial.id, { label: label.trim(), image: image.trim() });
    }
    onClose();
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-stone-700 mb-1.5">
          Category Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="e.g. Skincare / العناية بالبشرة"
          className="w-full min-h-[44px] px-3.5 py-2.5 text-base bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold placeholder:text-stone-400 text-brand-black transition-all pointer-events-auto"
          style={{ fontSize: '16px' }}
          autoComplete="off"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-stone-700 mb-1.5">
          Category Cover Image <span className="text-stone-400 font-normal">(upload from device)</span>
        </label>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageFileChange}
          className="hidden"
          id="category-image-file-input"
        />

        {image ? (
          <div className="relative rounded-2xl overflow-hidden aspect-[16/9] border border-stone-200 shadow-sm bg-stone-100 group">
            <img src={image} alt="Preview" className="w-full h-full object-cover" />

            {/* Sleek top gradient overlay for crisp contrast and premium depth */}
            <div className="absolute top-0 inset-x-0 h-16 bg-gradient-to-b from-brand-black/85 via-brand-black/45 to-transparent z-10 pointer-events-none" />

            {/* Category name preview */}
            <div className="absolute top-2.5 inset-x-2.5 z-20 pointer-events-none flex flex-col items-center">
              <h3 className="font-serif-luxury text-sm font-bold text-white tracking-wide truncate text-center drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]">
                {label.trim() || 'Category Name'}
              </h3>
            </div>

            {/* Shop Collection preview — solid black pill button matching card design */}
            <div className="absolute bottom-2.5 inset-x-2.5 flex justify-center pointer-events-none">
              <div className="inline-flex items-center gap-1 rounded-full bg-brand-black px-2.5 py-1 text-[10px] font-semibold text-white shadow-luxury tracking-wide">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
                <span>Shop Collection</span>
              </div>
            </div>

            <div className="absolute bottom-2.5 right-2.5 flex gap-1.5 z-10">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1 bg-white/90 hover:bg-white text-brand-black text-xs font-semibold rounded-lg shadow-sm backdrop-blur-sm transition-all flex items-center gap-1 cursor-pointer touch-target"
              >
                <Upload size={12} /> Change
              </button>
              <button
                type="button"
                onClick={() => setImage('')}
                className="p-1 bg-red-600/90 hover:bg-red-600 text-white rounded-lg shadow-sm backdrop-blur-sm transition-all cursor-pointer touch-target"
                title="Remove image"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="w-full flex flex-col items-center justify-center p-6 border-2 border-dashed border-stone-300 hover:border-brand-gold rounded-2xl bg-stone-50/70 hover:bg-brand-gold-light/20 transition-all cursor-pointer group touch-target"
          >
            <div className="w-11 h-11 rounded-full bg-white shadow-xs border border-stone-200 flex items-center justify-center text-stone-600 group-hover:text-brand-gold-dark group-hover:border-brand-gold transition-colors mb-2">
              <Upload size={20} />
            </div>
            <span className="text-xs font-semibold text-stone-800 group-hover:text-brand-black">
              {isProcessing ? 'Processing image...' : 'Upload Image from Device'}
            </span>
            <span className="text-[11px] text-stone-400 mt-0.5">
              Click or tap to choose photo (PNG, JPG, WEBP)
            </span>
          </button>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-stone-600 hover:text-brand-black rounded-xl border border-stone-200 bg-white cursor-pointer pointer-events-auto touch-target"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={isProcessing}
          className="px-5 py-2 bg-brand-black text-white rounded-xl text-sm font-semibold hover:bg-brand-charcoal cursor-pointer pointer-events-auto touch-target shadow-sm"
        >
          Save
        </button>
      </div>
    </div>
  );
}
