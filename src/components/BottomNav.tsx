import React, { useState } from "react";
import { Sparkles, Wind, Palette, Droplets, Star, Home, Edit2, Trash2 } from "lucide-react";
import { useData } from "../contexts/DataContext";
import AdminModal from "./AdminModal";
import type { Category } from "../types";

const ICONS = { Sparkles, Wind, Palette, Droplets, Star };

interface BottomNavProps {
  activeCategory: string;
  onSelect: (id: string) => void;
  isAdmin?: boolean;
  onAddCategory?: () => void;
}

export default function BottomNav({ activeCategory, onSelect, isAdmin, onAddCategory }: BottomNavProps) {
  const { categories: CATEGORIES, actions } = useData();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [draftLabel, setDraftLabel] = useState("");

  const openEditCategory = (e: React.MouseEvent, cat: Category) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingCategory(cat);
    setDraftLabel(cat.label);
    setModalOpen(true);
  };

  const closeEditCategory = () => {
    setModalOpen(false);
    setEditingCategory(null);
    setDraftLabel("");
  };

  const saveEditCategory = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!editingCategory) return;
    const nextLabel = draftLabel.trim();
    if (!nextLabel) return;
    actions.updateCategory(editingCategory.id, { label: nextLabel });
    closeEditCategory();
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-30 w-full max-w-full bg-white/95 backdrop-blur-lg border-t border-brand-gold-border/60 md:hidden pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <div className="flex w-full items-center px-2 py-2 max-md:gap-2">
          {/* Home */}
          <button
            onClick={() => onSelect("home")}
            className={`bottom-nav-item flex-shrink-0 flex flex-col items-center justify-center py-1 relative transition-colors ${
                String(activeCategory) === "home" ? "active text-brand-black" : "text-stone-400 hover:text-stone-700"
              }`}
              data-active={String(activeCategory) === "home"}
          >
            <div
              className={`p-1.5 rounded-xl transition-all ${
                String(activeCategory) === "home" ? "bg-brand-gold text-brand-black shadow-sm" : ""
              }`}
            >
                <Home size={18} strokeWidth={String(activeCategory) === "home" ? 2.5 : 2} />
            </div>
            <span className="text-[10px] font-semibold mt-0.5">Home</span>
            {activeCategory === "home" && (
              <span className="w-1 h-1 rounded-full bg-brand-gold mt-0.5" />
            )}
          </button>

          {/* Departments: mobile horizontal scroll with five visible items */}
          <div className="max-md:min-w-0 max-md:flex-1 max-md:overflow-x-auto max-md:scrollbar-hide max-md:pl-1">
            <div className="max-md:flex max-md:items-stretch max-md:gap-1.5 max-md:min-w-0">
              {CATEGORIES.map((cat) => {
                const Icon = ICONS[cat.icon] || Sparkles;
                const isActive = String(activeCategory) === String(cat.id);

                return (
                  <div key={cat.id} className="relative max-md:flex-[0_0_auto] max-md:min-w-0">
                    <button
                      type="button"
                      onClick={() => onSelect(cat.id)}
                      className={`bottom-nav-item w-full flex flex-col items-center justify-center py-1 relative transition-colors ${
                        isActive ? "active text-brand-black" : "text-stone-400 hover:text-stone-700"
                      }`}
                      data-active={isActive}
                    >
                      <div
                        className={`p-1.5 rounded-xl transition-all ${
                          isActive ? "bg-brand-gold text-brand-black shadow-sm" : ""
                        }`}
                      >
                        <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                      </div>
                      <span className="text-[10px] font-semibold mt-0.5 truncate max-w-[56px]">
                        {cat.label.split(" ")[0]}
                      </span>
                      {isActive && (
                        <span className="w-1 h-1 rounded-full bg-brand-gold mt-0.5" />
                      )}
                    </button>
                    {isAdmin && (
                      <div className="absolute -right-2 top-0 flex flex-col gap-1 z-10">
                        <button type="button" onClick={(e) => openEditCategory(e, cat)} className="p-1 bg-white rounded-full shadow cursor-pointer" aria-label={`Edit ${cat.label}`}>
                          <Edit2 size={12} />
                        </button>
                        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); actions.deleteCategory(cat.id); }} className="p-1 bg-white rounded-full shadow text-red-500 cursor-pointer" aria-label={`Delete ${cat.label}`}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {isAdmin && (
                <button
                  key="add-category"
                  onClick={() => onAddCategory && onAddCategory()}
                  className={`bottom-nav-item max-md:flex-[0_0_auto] max-md:min-w-0 flex flex-col items-center justify-center py-1 relative transition-colors flex-shrink-0`}
                  aria-label="Add category"
                  data-active={false}
                >
                  <div className={`p-1.5 rounded-xl transition-all bg-brand-black text-white`}>
                    <span className="text-brand-gold font-bold">+</span>
                  </div>
                  <span className="text-[10px] font-semibold mt-0.5 truncate max-w-[56px]">Add</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {isAdmin && (
        <AdminModal open={modalOpen} title="Edit Category" onClose={closeEditCategory}>
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-stone-700 mb-1">Category Name</label>
            <input
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              placeholder="Category Name"
              className="w-full p-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
              autoFocus
            />
            <div className="flex items-center justify-end gap-1.5 pt-1.5 border-t border-stone-100">
              <button type="button" onClick={closeEditCategory} className="px-2.5 py-1.5 text-[10px] font-semibold text-stone-600 hover:text-brand-black rounded-md transition-colors cursor-pointer">
                Cancel
              </button>
              <button type="button" onClick={saveEditCategory} className="px-3 py-1.5 text-[10px] font-semibold bg-brand-black text-white rounded-md shadow-luxury hover:bg-brand-charcoal transition-all active:scale-98 cursor-pointer">
                Save
              </button>
            </div>
          </div>
        </AdminModal>
      )}
    </>
  );
}
