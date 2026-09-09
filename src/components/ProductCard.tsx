import React, { useState } from "react";
import { ShoppingBag, Heart, Eye, Star, Check, Edit2, Trash2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useData } from "../contexts/DataContext";
import type { Product } from "../types";

const TAG_STYLES: Record<string, string> = {
  "Best Seller": "phm-best-seller-badge font-bold",
  New: "bg-white/90 text-brand-black border border-stone-200 shadow-sm",
};

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product) => void;
  onQuickView: (product: Product) => void;
  onWishlist: (product: Product) => void;
  isWishlisted: boolean;
  showStatusBadges?: boolean;
  onEdit?: (product: Product) => void;
  onDelete?: (product: Product) => void;
}

export default function ProductCard({
  product,
  onAddToCart,
  onQuickView,
  onWishlist,
  isWishlisted,
  showStatusBadges = true,
  onEdit,
  onDelete,
}: ProductCardProps) {
  const [hovered, setHovered] = useState(false);
  const [addedAnim, setAddedAnim] = useState(false);
  const { user } = useAuth();
  const { actions } = useData();

  const market = typeof product.marketPrice === 'number' ? product.marketPrice : (typeof product.originalPrice === 'number' ? product.originalPrice : undefined);
  const sell = typeof product.sellingPrice === 'number' ? product.sellingPrice : (typeof product.price === 'number' ? product.price : 0);
  const discount = market ? Math.round(((market - sell) / market) * 100) : null;
  const shouldShowBestSeller = showStatusBadges && (product.hero || product.tag === 'Best Seller');
  const shouldShowNew = showStatusBadges && product.tag === 'New';

  const handleAddClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onAddToCart(product);
    setAddedAnim(true);
    setTimeout(() => setAddedAnim(false), 1200);
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => {
        if (typeof window !== 'undefined' && window.innerWidth < 768) {
          e.stopPropagation();
          onQuickView(product);
        }
      }}
      className="product-card group bg-white rounded-3xl overflow-hidden md:overflow-visible border border-brand-gold-border/30 hover:border-brand-gold/60 shadow-luxury hover:shadow-luxury-hover transition-all duration-500 hover:-translate-y-1.5 flex flex-col relative max-md:cursor-pointer"
    >
      {/* Product Image Stage */}
      <div className="relative overflow-hidden bg-brand-sand/50 aspect-square">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-108"
          loading="lazy"
        />

        {/* Brand Badges / Discount */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10">
          {shouldShowBestSeller && (
            <span className="bg-brand-gold text-brand-black font-extrabold text-[8px] px-2 py-0.5 rounded-full leading-none shadow-sm w-fit border border-[#c38d2d] tracking-[0.11em] uppercase">
              BEST SELLER
            </span>
          )}
          {shouldShowNew && (
            <span className={`text-[10px] uppercase tracking-wider px-3 py-1 rounded-full font-semibold leading-none shadow-sm ${TAG_STYLES.New || 'bg-brand-black text-white'}`}>
              NEW
            </span>
          )}
          {typeof discount === 'number' && discount > 0 && (
            <span className="bg-brand-gold text-brand-black font-extrabold text-[10px] px-2.5 py-1 rounded-full leading-none shadow-sm w-fit">
              SAVE {discount}%
            </span>
          )}
        </div>

        {/* Wishlist Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onWishlist(product);
          }}
          className={`absolute top-3 right-3 w-9 h-9 md:w-11 md:h-11 rounded-full flex items-center justify-center shadow-md transition-all duration-300 z-10 touch-target ${
            isWishlisted
              ? "bg-red-50 text-red-500 scale-100 border border-red-200"
              : "bg-white/80 backdrop-blur-md text-stone-500 hover:text-red-500 hover:bg-white border border-stone-200"
          }`}
          aria-label="Toggle Favorite List"
        >
          <Heart size={16} fill={isWishlisted ? "currentColor" : "none"} />
        </button>

        {/* Quick View Button on Hover */}
        <div
          className={`absolute inset-0 bg-brand-black/30 backdrop-blur-[2px] flex items-center justify-center transition-opacity duration-300 max-md:hidden ${
            hovered ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
        >
          <button
            onClick={() => onQuickView(product)}
            className="quick-preview-btn flex items-center gap-2 bg-white text-brand-black px-4 py-2.5 md:py-3 rounded-full text-xs font-bold tracking-wide shadow-xl hover:bg-brand-black hover:text-brand-gold transition-all duration-200 transform active:scale-95 border border-brand-gold/30 touch-target"
          >
            <Eye size={14} />
            Quick Preview
          </button>
        </div>
      </div>

      {/* Inline Admin Controls */}
      {user && user.role === 'admin' && (
        <div className="absolute top-3 left-3 flex gap-2 z-20">
          {/* Best seller toggle */}
          <button onClick={(e)=>{ e.stopPropagation(); actions.toggleHero(product.id); }} className={`w-9 h-9 md:w-11 md:h-11 rounded-full bg-white/90 flex items-center justify-center shadow touch-target ${product.hero? 'text-yellow-500': ''}`} title={product.hero? 'Unmark Best Seller' : 'Mark Best Seller'}>
            <Star size={14} fill={product.hero? 'currentColor' : 'none'} />
          </button>
          {onEdit && (
            <button onClick={(e)=>{ e.stopPropagation(); onEdit(product); }} className="w-9 h-9 md:w-11 md:h-11 rounded-full bg-white/90 flex items-center justify-center shadow touch-target">
              <Edit2 size={14} />
            </button>
          )}
          {onDelete && (
            <button onClick={(e)=>{ e.stopPropagation(); onDelete(product); }} className="w-9 h-9 md:w-11 md:h-11 rounded-full bg-white/90 flex items-center justify-center shadow text-red-500 touch-target">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}

      {/* Content Info */}
      <div className="product-card-info p-4 md:p-5 md:pb-6 flex flex-col flex-1 bg-white">
        {/* Brand Name */}
        <p className="text-[10px] md:text-[11px] font-bold text-brand-gold-dark tracking-widest uppercase mb-1.5">
          {product.brand}
        </p>

        {/* Product Title */}
        <h3 className="text-xs md:text-sm font-semibold text-brand-black leading-snug line-clamp-2 mb-3 flex-1 group-hover:text-brand-gold-dark transition-colors">
          {product.name}
        </h3>

        {/* Star Rating removed — adjust spacing */}
        

        {/* Price & Add to Bag CTA (stacked layout: price above CTA) */}
        <div className="pt-2 border-t border-stone-100">
          <div className="flex flex-col items-start gap-3">
            <div className="w-full">
                  {user && user.role === 'admin' ? (
                <div className="text-sm md:text-sm text-stone-700 space-y-1">
                  <div className="text-[12px] text-stone-400">Our Price</div>
                  <div className="text-sm font-semibold">EGP {(typeof product.price==='number' ? product.price : 0).toFixed(2)}</div>
                  <div className="text-[12px] text-stone-400 mt-1">General Price</div>
                  <div className="text-sm font-semibold line-through">EGP {(market !== undefined ? market : 0).toFixed(2)}</div>
                  <div className="text-[12px] text-stone-400 mt-1">Store Price</div>
                  <div className="text-base font-bold text-brand-black">EGP {(sell).toFixed(2)}</div>
                </div>
                  ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-sm md:text-base font-bold text-brand-black">EGP {(sell).toFixed(2)}</span>
                  {market !== undefined && (
                    <span className="text-[11px] md:text-xs text-stone-400 line-through -mt-1">EGP {market.toFixed(2)}</span>
                  )}
                </div>
              )}
            </div>

              <div className="w-full">
              <button
                onClick={handleAddClick}
                className={`card-add-btn w-full flex items-center justify-center gap-1 px-3 py-2 md:px-4 md:py-3 rounded-full text-xs font-bold tracking-wide transition-all duration-300 active:scale-95 shadow-sm touch-target ${
                  addedAnim
                    ? "bg-emerald-600 text-white"
                    : "bg-brand-black hover:bg-brand-gold hover:text-brand-black text-white"
                }`}
              >
                {addedAnim ? (
                  <>
                    <Check size={13} strokeWidth={3} />
                    <span>Added!</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag size={13} />
                    <span>Add</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
