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
      <div className="flex items-center justify-around px-2 py-2">
        {/* Home */}
        <button
          onClick={() => onSelect("home")}
          className={`flex-1 flex flex-col items-center justify-center py-1 relative transition-colors ${
            activeCategory === "home" ? "text-brand-black" : "text-stone-400 hover:text-stone-700"
          }`}
        >
          <div
            className={`p-1.5 rounded-xl transition-all ${
              activeCategory === "home" ? "bg-brand-gold text-brand-black shadow-sm" : ""
            }`}
          >
            <Home size={18} strokeWidth={activeCategory === "home" ? 2.5 : 2} />
          </div>
          <span className="text-[10px] font-semibold mt-0.5">Home</span>
          {activeCategory === "home" && (
            <span className="w-1 h-1 rounded-full bg-brand-gold mt-0.5" />
          )}
        </button>

        {/* Categories */}
        {CATEGORIES.map((cat) => {
          const Icon = ICONS[cat.icon] || Sparkles;
          const isActive = activeCategory === cat.id;

          return (
            <button
              key={cat.id}
              onClick={() => onSelect(cat.id)}
              className={`flex-1 flex flex-col items-center justify-center py-1 relative transition-colors ${
                isActive ? "text-brand-black" : "text-stone-400 hover:text-stone-700"
              }`}
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
    </nav>
  );
}
