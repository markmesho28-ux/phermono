import React from "react";
import { Home, LayoutGrid } from "lucide-react";
import { useData } from "../contexts/DataContext";

interface BottomNavProps {
  activeCategory: string;
  onSelect: (id: string) => void;
  isAdmin?: boolean;
  onAddCategory?: () => void;
  onOpenCategories?: () => void;
  isCategoriesOpen?: boolean;
}

export default function BottomNav({
  activeCategory,
  onSelect,
  isAdmin,
  onAddCategory,
  onOpenCategories,
  isCategoriesOpen = false,
}: BottomNavProps) {
  const { categories: CATEGORIES } = useData();

  const isSpecialPage = ['home', 'favorites', 'orders', 'profile', 'admin', 'tracking', 'assistant'].includes(String(activeCategory));
  const activeCategoryObj = CATEGORIES.find(c => String(c.id) === String(activeCategory));
  const isCategoriesActive = isCategoriesOpen || (!isSpecialPage && Boolean(activeCategoryObj));

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-30 w-full max-w-full bg-white/95 backdrop-blur-lg border-t border-brand-gold-border/60 md:hidden pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <div className="flex w-full items-center justify-around px-4 py-2">
          {/* Home */}
          <button
            type="button"
            onClick={() => onSelect("home")}
            className={`bottom-nav-item flex flex-col items-center justify-center py-1 relative transition-colors cursor-pointer touch-target ${
              String(activeCategory) === "home" ? "active text-brand-black" : "text-stone-400 hover:text-stone-700"
            }`}
            data-active={String(activeCategory) === "home"}
            aria-label="Home"
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

          {/* Categories Toggle - Opens Mobile Sidebar Drawer */}
          <button
            type="button"
            onClick={() => onOpenCategories && onOpenCategories()}
            className={`bottom-nav-item flex flex-col items-center justify-center py-1 relative transition-colors cursor-pointer touch-target ${
              isCategoriesActive ? "active text-brand-black" : "text-stone-400 hover:text-stone-700"
            }`}
            data-active={isCategoriesActive}
            aria-label="Categories"
          >
            <div
              className={`p-1.5 rounded-xl transition-all ${
                isCategoriesActive ? "bg-brand-gold text-brand-black shadow-sm" : "bg-stone-100 text-stone-600"
              }`}
            >
              <LayoutGrid size={18} strokeWidth={isCategoriesActive ? 2.5 : 2} />
            </div>
            <span className="text-[10px] font-semibold mt-0.5 truncate max-w-[80px]">
              {activeCategoryObj ? activeCategoryObj.label : "Categories"}
            </span>
            {isCategoriesActive && (
              <span className="w-1 h-1 rounded-full bg-brand-gold mt-0.5" />
            )}
          </button>

          {/* Admin Add Category */}
          {isAdmin && (
            <button
              key="add-category"
              type="button"
              onClick={() => onAddCategory && onAddCategory()}
              className="bottom-nav-item flex flex-col items-center justify-center py-1 relative transition-colors cursor-pointer text-stone-400 hover:text-stone-700 touch-target"
              aria-label="Add category"
              data-active={false}
            >
              <div className="p-1.5 rounded-xl transition-all bg-brand-black text-white shadow-sm">
                <span className="text-brand-gold font-bold text-sm leading-none">+</span>
              </div>
              <span className="text-[10px] font-semibold mt-0.5">Add</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
