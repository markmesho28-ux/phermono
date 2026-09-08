import React from "react";
import { Sparkles, Wind, Palette, Droplets, Star, Home } from "lucide-react";
import { useData } from "../contexts/DataContext";

const ICONS = { Sparkles, Wind, Palette, Droplets, Star };

interface BottomNavProps {
  activeCategory: string;
  onSelect: (id: string) => void;
}

export default function BottomNav({ activeCategory, onSelect }: BottomNavProps) {
  const { categories: CATEGORIES } = useData();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-lg border-t border-brand-gold-border/60 md:hidden pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
      <div className="flex items-center px-2 py-2 max-md:gap-2">
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
        <div className="max-md:flex-1 max-md:overflow-x-auto max-md:scrollbar-hide max-md:flex-nowrap max-md:pl-1">
          <div className="max-md:flex max-md:items-stretch max-md:gap-1.5 max-md:min-w-max">
            {CATEGORIES.map((cat) => {
              const Icon = ICONS[cat.icon] || Sparkles;
              const isActive = String(activeCategory) === String(cat.id);

              return (
                <button
                  key={cat.id}
                  onClick={() => onSelect(cat.id)}
                  className={`bottom-nav-item max-md:flex-[0_0_20%] max-md:min-w-[20%] md:flex-1 flex flex-col items-center justify-center py-1 relative transition-colors ${
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
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
