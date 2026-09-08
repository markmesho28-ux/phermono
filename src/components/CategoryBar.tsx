import React from 'react';

type Category = { id: string; label: string };

interface CategoryBarProps {
  categories: Category[];
  activeId?: string | null;
  isAdmin?: boolean;
  onSelect?: (id: string) => void;
  onAddCategory?: () => void;
}

export default function CategoryBar({ categories, activeId = null, isAdmin = false, onSelect, onAddCategory }: CategoryBarProps) {
  return (
    <div dir="rtl" className="flex items-center gap-3 px-4 py-2">
      {/* Admin Add button placed first so in RTL it appears at the far right visually. */}
      {isAdmin && (
        <div className="flex-shrink-0">
          <button
            type="button"
            onClick={() => onAddCategory && onAddCategory()}
            className="flex items-center gap-2 px-3 py-2 rounded-full bg-brand-black text-white text-sm font-semibold shadow-sm hover:bg-brand-charcoal transition-colors whitespace-nowrap"
            aria-label="Add category"
          >
            + إضافة فئة
          </button>
        </div>
      )}

      {/* Scrollable categories area; the Add button remains fixed and outside of this scrolling region. */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex items-center gap-3 whitespace-nowrap">
          {categories.map((c) => {
            const active = c.id === activeId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect && onSelect(c.id)}
                className={`flex-shrink-0 px-3 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                  active ? 'bg-brand-gold text-black' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
                aria-pressed={active}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
