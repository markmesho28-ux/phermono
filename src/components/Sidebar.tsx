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
import { useData } from "../contexts/DataContext";
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

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const now = Date.now();
    if (now - lastBackdropClickRef.current < 600) {
      return;
    }
    lastBackdropClickRef.current = now;
    if (onClose) onClose();
  };

  const openAddModal = (e: React.MouseEvent) => {
    // Only stop propagation; avoid preventDefault to allow instant touch-to-click conversion
    e.stopPropagation();
    setMode('add');
    setEditingCat(null);
    setModalOpen(true);
  };

  const openEditModal = (e: React.MouseEvent, cat: Category) => {
    e.stopPropagation();
    setMode('edit');
    setEditingCat(cat);
    setModalOpen(true);
  };

  const SidebarBody = () => (
    <>
      {/* Home Navigation */}
      <button
        type="button"
        onPointerDown={(e) => { e.stopPropagation(); onSelect("home"); if (onClose) onClose(); }}
        onClick={() => { onSelect("home"); if (onClose) onClose(); }}
        style={{ touchAction: 'manipulation' }}
        className={`sidebar-nav-item w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-300 cursor-pointer pointer-events-auto touch-target ${
          String(activeCategory) === "home" ? "active bg-brand-black text-white shadow-luxury" : "text-stone-600 hover:bg-brand-gold-light/60 hover:text-brand-black"
        }`}
        data-active={String(activeCategory) === "home"}
      >
        <div className="flex items-center justify-between w-full pointer-events-none">
          <div className="flex items-center gap-3 pointer-events-none">
            <Home size={18} className={`pointer-events-none ${String(activeCategory) === "home" ? "text-brand-gold" : "text-stone-400"}`} />
            <span className="pointer-events-none">Home Overview</span>
          </div>
          {String(activeCategory) === "home" && <span className="w-1.5 h-1.5 rounded-full bg-brand-gold pointer-events-none" />}
        </div>
      </button>

      {/* Orders Management (Admin only) */}
      {isAdmin && (
        <button
          type="button"
          onPointerDown={(e) => { e.stopPropagation(); onSelect('orders'); if (onClose) onClose(); }}
          onClick={() => { onSelect('orders'); if (onClose) onClose(); }}
          style={{ touchAction: 'manipulation' }}
          className={`mt-1.5 sidebar-nav-item w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-300 cursor-pointer pointer-events-auto touch-target ${
            String(activeCategory) === 'orders' ? 'active bg-brand-black text-white shadow-luxury' : 'text-stone-600 hover:bg-brand-gold-light/60 hover:text-brand-black'
          }`}
          data-active={String(activeCategory) === 'orders'}
        >
          <div className="flex items-center justify-between w-full pointer-events-none">
            <div className="flex items-center gap-3 pointer-events-none">
              <ClipboardList size={18} className={`pointer-events-none ${String(activeCategory) === 'orders' ? 'text-brand-gold' : 'text-stone-400'}`} />
              <span className="pointer-events-none">Orders Management</span>
            </div>
            {String(activeCategory) === 'orders' && <span className="w-1.5 h-1.5 rounded-full bg-brand-gold pointer-events-none" />}
          </div>
        </button>
      )}

      {/* Departments Label */}
      <div className="flex items-center justify-between px-3 mt-5 mb-3">
        <div className="flex items-center gap-3 pointer-events-none">
          <span className="text-[10px] font-bold tracking-widest text-brand-darkgray uppercase pointer-events-none">Departments</span>
          {isAdmin && (
            <button
              type="button"
              onClick={openAddModal}
              className="text-brand-gold cursor-pointer pointer-events-auto p-1 hover:bg-brand-gold-light/50 rounded-full transition-colors flex items-center justify-center touch-target"
              title="Add Category"
            >
              <div className="pointer-events-none flex items-center justify-center">
                <PlusCircle size={18} className="pointer-events-none" />
              </div>
            </button>
          )}
        </div>
        <span className="text-[10px] font-medium text-brand-gold-dark bg-brand-gold-light px-2 py-0.5 rounded-full pointer-events-none">PhM Curated</span>
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
                onPointerDown={(e) => { e.stopPropagation(); onSelect(cat.id); if (onClose) onClose(); }}
                onClick={(e) => { e.stopPropagation(); onSelect(cat.id); if (onClose) onClose(); }}
                className={`sidebar-nav-item w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-300 group cursor-pointer pointer-events-auto touch-target ${
                  isActive ? "active bg-gradient-to-r from-brand-black to-brand-charcoal text-white shadow-luxury font-semibold" : "text-stone-600 hover:bg-brand-gold-light/70 hover:text-brand-black"
                }`}
                data-active={isActive}
              >
                {/* Left Side (Icon + Text) */}
                <div className="flex items-center gap-3.5 pointer-events-none">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 pointer-events-none ${isActive ? "bg-brand-gold text-brand-black shadow-sm" : "bg-brand-sand text-stone-600 group-hover:bg-white group-hover:text-brand-gold-dark"}`}>
                    <Icon size={16} strokeWidth={isActive ? 2.5 : 2} className="pointer-events-none" />
                  </div>
                  <span className="pointer-events-none">{cat.label}</span>
                </div>

                {/* Right Side — spacer + arrow */}
                <div className="flex items-center gap-2 pointer-events-none">
                  {isAdmin && (
                    <div className="flex gap-1 mr-1 invisible" aria-hidden="true">
                      <div className="p-1 w-5 h-5" />
                      <div className="p-1 w-5 h-5" />
                    </div>
                  )}
                  <div className="pointer-events-none">
                    <ChevronRight size={14} className={`transition-all duration-200 pointer-events-none ${isActive ? "text-brand-gold translate-x-0.5 opacity-100" : "text-stone-300 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5"}`} />
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
                    onPointerDown={(e) => { e.stopPropagation(); }}
                    onClick={(e) => { e.stopPropagation(); openEditModal(e, cat); }}
                    className="p-1 rounded bg-white/80 hover:bg-white text-stone-700 cursor-pointer shadow-xs flex items-center justify-center touch-target"
                    title="Edit"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => { e.stopPropagation(); }}
                    onClick={(e) => { e.stopPropagation(); actions.deleteCategory(cat.id); }}
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
          onPointerDown={(e) => { e.stopPropagation(); onSelect("about"); if (onClose) onClose(); }}
          onClick={() => { onSelect("about"); if (onClose) onClose(); }}
          style={{ touchAction: 'manipulation' }}
          className={`sidebar-nav-item w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-300 group cursor-pointer pointer-events-auto touch-target ${
            String(activeCategory) === "about"
              ? "active bg-gradient-to-r from-brand-black to-brand-charcoal text-white shadow-luxury font-semibold"
              : "text-stone-600 hover:bg-brand-gold-light/70 hover:text-brand-black"
          }`}
          data-active={String(activeCategory) === "about"}
        >
          <div className="flex items-center gap-3.5 pointer-events-none">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 pointer-events-none ${
              String(activeCategory) === "about"
                ? "bg-brand-gold text-brand-black shadow-sm"
                : "bg-brand-sand text-stone-600 group-hover:bg-white group-hover:text-brand-gold-dark"
            }`}>
              <Info size={16} strokeWidth={String(activeCategory) === "about" ? 2.5 : 2} className="pointer-events-none" />
            </div>
            <span className="pointer-events-none">About PherMono</span>
          </div>

          <div className="pointer-events-none">
            <ChevronRight size={14} className={`transition-all duration-200 pointer-events-none ${
              String(activeCategory) === "about"
                ? "text-brand-gold translate-x-0.5 opacity-100"
                : "text-stone-300 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5"
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
        onClick={handleBackdropClick}
        className={`fixed inset-0 bg-brand-black/60 backdrop-blur-sm z-[90] transition-opacity duration-300 md:hidden ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden="true"
      />

      {/* Mobile off-canvas drawer — full viewport height taking up 80% screen width up to max-w-sm */}
      <aside
        onClick={(e) => e.stopPropagation()}
        className={`fixed left-0 top-0 w-4/5 sm:w-80 max-w-sm h-full bg-white z-[95] flex flex-col shadow-2xl transition-transform duration-300 ease-out md:hidden ${
          isOpen ? "translate-x-0 pointer-events-auto" : "-translate-x-full pointer-events-none"
        }`}
        aria-label="Mobile categories navigation"
      >
        {/* Close button row — pinned at top of the drawer */}
        <div className="flex-none flex items-center justify-end px-4 py-3 border-b border-stone-100 bg-[#FAF8F5]/90">
          <button
            type="button"
            onPointerDown={(e)=>{ e.stopPropagation(); if (onClose) onClose(); }}
            onClick={(e) => {
              e.stopPropagation();
              if (onClose) onClose();
            }}
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
      <aside className="hidden md:flex flex-col w-64 shrink-0 bg-white/90 backdrop-blur-md border-r border-brand-gold-border/40 min-h-[calc(100vh-5rem)] sticky top-28 overflow-y-auto px-4 py-6">
        <SidebarBody />
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

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const maxDim = 1000;
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
            setImage(canvas.toDataURL('image/jpeg', 0.85));
          } else {
            setImage(String(event.target?.result || ''));
          }
        } catch (err) {
          setImage(String(event.target?.result || ''));
        } finally {
          setIsProcessing(false);
        }
      };
      img.onerror = () => setIsProcessing(false);
      img.src = String(event.target?.result || '');
    };
    reader.onerror = () => setIsProcessing(false);
    reader.readAsDataURL(file);
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

            {/* Category name preview — clean black bold text directly on the image, zero background, zero border */}
            <div className="absolute top-2.5 inset-x-2.5 pointer-events-none">
              <p className="text-brand-black font-bold text-xs leading-tight drop-shadow-[0_1px_3px_rgba(255,255,255,0.9)] truncate text-center">
                {label.trim() || 'Category Name'}
              </p>
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
