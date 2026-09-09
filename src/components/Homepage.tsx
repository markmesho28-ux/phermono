import React from "react";
import ProductCard from "./ProductCard";
import { useData } from "../contexts/DataContext";
import type { Product } from "../types";

interface HomepageProps {
  onAddToCart: (product: Product) => void;
  onQuickView: (product: Product) => void;
  onWishlist: (product: Product) => void;
  wishlist: Product[];
  onCategorySelect?: (id: string) => void;
  onBrandSelect?: (brand: string) => void;
}

export default function Homepage({
  onAddToCart,
  onQuickView,
  onWishlist,
  wishlist,
  onCategorySelect,
}: HomepageProps) {
  const { products } = useData();

  // New arrivals: strictly by creation date (most recent first). Only include rows that have a valid `createdAt`.
  const sortedProductsByNewest = [...products]
    .filter((p) => p.createdAt)
    .sort((a, b) => Number(new Date(String((b as any).createdAt))) - Number(new Date(String((a as any).createdAt))));
  const newArrivals = sortedProductsByNewest.slice(0, 8);

  // Best sellers: strictly products explicitly flagged by admin. Do NOT fallback to random products.
  const bestSellers = [...products]
    .filter((p) => Boolean(p.hero) || String(p.tag || '').toLowerCase() === 'best seller' || Boolean((p as any).is_best_seller) || Boolean((p as any).best_seller))
    .slice(0, 8);

  const renderedBestSellers = bestSellers; // intentionally no fallback
  const renderedNewArrivals = newArrivals; // intentionally no fallback

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 pt-4 pb-20 md:pb-8 animate-fadeIn select-none">
      <div className="space-y-8 md:space-y-10">
        <section className="rounded-[28px] border border-brand-gold/20 bg-gradient-to-b from-brand-black via-brand-charcoal to-brand-stone p-4 md:p-6 shadow-2xl">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] md:text-[11px] font-bold uppercase tracking-[0.28em] text-brand-gold/90">Curated favourites</p>
              <h2 className="mt-2 font-serif-luxury text-3xl md:text-5xl text-white leading-none">Best Sellers</h2>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-5">
            {renderedBestSellers.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCart={onAddToCart}
                onQuickView={onQuickView}
                onWishlist={onWishlist}
                isWishlisted={wishlist.some((w) => w.id === product.id)}
                showStatusBadges={false}
              />
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-brand-gold/20 bg-[#f7f3ed] p-4 md:p-6 shadow-luxury">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] md:text-[11px] font-bold uppercase tracking-[0.28em] text-brand-gold-dark">Fresh arrivals</p>
              <h2 className="mt-2 font-serif-luxury text-3xl md:text-5xl text-brand-black leading-none">New Arrivals</h2>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-5">
            {renderedNewArrivals.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCart={onAddToCart}
                onQuickView={onQuickView}
                onWishlist={onWishlist}
                isWishlisted={wishlist.some((w) => w.id === product.id)}
                showStatusBadges={false}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
