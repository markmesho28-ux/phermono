import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useData } from "../contexts/DataContext";
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
  const { categories: CATEGORIES, actions } = useData();
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<'add' | 'edit'>('add');
  const [editingCat, setEditingCat] = useState<Category | null>(null);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && onClose) onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
      };
    } else {
      document.body.style.overflow = '';
    }
  }, [mobileOpen, onClose]);

  const openAddModal = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMode('add');
    setEditingCat(null);
    setModalOpen(true);
  };

  const openEditModal = (e: React.MouseEvent, cat: Category) => {
    e.preventDefault();
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
        onClick={(e) => { e.preventDefault(); onSelect("home"); if(onClose) onClose(); }}
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
      {user && user.role === 'admin' && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); onSelect('orders'); if(onClose) onClose(); }}
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
          {user && user.role === 'admin' && (
            <button
              type="button"
              onClick={openAddModal}
              className="text-brand-gold cursor-pointer pointer-events-auto p-1 hover:bg-brand-gold-light/50 rounded-full transition-colors flex items-center justify-center"
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
                onClick={(e) => { e.preventDefault(); onSelect(cat.id); if(onClose) onClose(); }}
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
                  {user && user.role === 'admin' && (
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
              {user && user.role === 'admin' && (
                <div className="absolute right-8 top-1/2 -translate-y-1/2 flex gap-1 z-10">
                  <button
                    type="button"
                    onClick={(e) => openEditModal(e, cat)}
                    className="p-1 rounded bg-white/80 hover:bg-white text-stone-700 cursor-pointer shadow-xs flex items-center justify-center"
                    title="Edit"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); actions.deleteCategory(cat.id); }}
                    className="p-1 rounded bg-white/80 hover:bg-white text-red-500 cursor-pointer shadow-xs flex items-center justify-center"
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

      <AdminModal open={modalOpen} title={mode==='add' ? 'Add Category' : 'Edit Category'} onClose={()=>setModalOpen(false)}>
        <CategoryForm initial={editingCat} onClose={()=>setModalOpen(false)} mode={mode} />
      </AdminModal>
    </>
  );

  return (
    <>
      {/* Mobile drawer backdrop — covers only below the sticky site header */}
      <div
        onClick={onClose}
        className={`fixed left-0 right-0 bottom-0 bg-brand-black/60 backdrop-blur-sm z-[80] transition-opacity duration-300 md:hidden ${
          mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        style={{ top: 'var(--header-height, 0px)' }}
        aria-hidden="true"
      />

      {/* Mobile off-canvas drawer — starts exactly at the bottom edge of the sticky header */}
      <aside
        className={`fixed left-0 w-[290px] sm:w-[320px] max-w-[85vw] bg-white z-[85] flex flex-col shadow-2xl transition-transform duration-300 ease-out md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full pointer-events-none"
        }`}
        style={{
          top: 'var(--header-height, 0px)',
          height: 'calc(100dvh - var(--header-height, 0px))',
        }}
        aria-label="Mobile categories navigation"
      >
        {/* Close button row */}
        <div className="flex-none flex items-center justify-end px-4 py-3 border-b border-stone-100 bg-[#FAF8F5]/80">
          <button
            type="button"
            onClick={() => onClose && onClose()}
            className="p-1.5 rounded-full text-stone-400 hover:text-brand-black hover:bg-stone-200/60 transition-colors cursor-pointer"
            aria-label="Close menu"
          >
            <X size={18} />
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

  const makeSlug = (text: string) => text.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');

  const submit = (e: React.MouseEvent) => {
    e.preventDefault();
    if(mode==='add'){
      if(!label.trim()) return;
      let slug = makeSlug(label);
      let suffix = 1;
      const exists = (s: string) => categories.some((c: Category) => c.id === s);
      let base = slug;
      while(exists(slug)){
        slug = `${base}-${suffix++}`;
      }
      actions.addCategory({ id: slug, label: label.trim(), icon: 'Sparkles', color: '', accent: '', subcategories: [{ id: 'all', label: 'All' }], brands: [] });
    } else {
      if (!initial) return;
      actions.updateCategory(initial.id, { label: label.trim() });
    }
    onClose();
  };

  return (
    <div className="space-y-3">
      <input value={label} onChange={e=>setLabel(e.target.value)} placeholder="Category Name" className="w-full p-2 border rounded" />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm cursor-pointer pointer-events-auto">Cancel</button>
        <button type="button" onClick={submit} className="px-3 py-2 bg-black text-white rounded text-sm cursor-pointer pointer-events-auto">Save</button>
      </div>
    </div>
  );
}