import React, { useState, useRef } from "react";
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

  const generalPrice = typeof product.marketPrice === 'number' ? product.marketPrice : (typeof product.originalPrice === 'number' ? product.originalPrice : undefined);
  const storePrice = typeof product.sellingPrice === 'number' ? product.sellingPrice : undefined;
  const ourPrice = typeof product.adminCost === 'number' ? product.adminCost : (typeof product.sellingPrice === 'number' ? product.sellingPrice : 0);
  const discount = (typeof generalPrice === 'number' && typeof storePrice === 'number' && generalPrice > 0)
    ? Math.round(((generalPrice - storePrice) / generalPrice) * 100)
    : null;
  const shouldShowBestSeller = showStatusBadges && (product.hero || product.tag === 'Best Seller');
  const shouldShowNew = showStatusBadges && product.tag === 'New';

  const handleAddClick = (e?: React.MouseEvent<HTMLButtonElement>) => {
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation();
    }
    onAddToCart(product);
    setAddedAnim(true);
    setTimeout(() => setAddedAnim(false), 1200);
  };

  const lastWishlistActionRef = useRef(0);

  const handleWishlistToggle = (
    e: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement> | React.PointerEvent<HTMLButtonElement>
  ) => {
    e.stopPropagation();
    if (typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    const now = Date.now();
    if (now - lastWishlistActionRef.current < 400) {
      return;
    }
    lastWishlistActionRef.current = now;
    onWishlist(product);
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
      className="group relative flex flex-col overflow-hidden rounded-[24px] border border-[#e7dcc5] bg-[linear-gradient(180deg,#fffdfb_0%,#f8f3ee_100%)] shadow-[0_14px_30px_rgba(17,17,17,0.08)] transition-all duration-300 hover:-translate-y-1.5 hover:border-[#d7b777] hover:shadow-[0_22px_42px_rgba(84,60,24,0.14)] max-md:cursor-pointer"
    >
      <div className="relative aspect-square overflow-hidden bg-[#f4efe9]">
        <img
          src={product.image}
          alt={product.name}
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
          loading="lazy"
        />

        <div className="absolute inset-0 bg-[linear-gradient(180deg,_rgba(29,18,13,0.00)_0%,_rgba(29,18,13,0.06)_100%)]" />

        <div className="absolute left-2.5 top-2.5 z-10 flex flex-col gap-1.5 md:left-3 md:top-3">
          {shouldShowBestSeller && (
            <span className="w-fit rounded-full border border-[#c38d2d] bg-brand-gold px-2 py-0.5 text-[7px] font-extrabold uppercase tracking-[0.16em] text-brand-black shadow-sm md:text-[8px]">
              Best Seller
            </span>
          )}
          {shouldShowNew && (
            <span className={`w-fit rounded-full px-2 py-0.5 text-[7px] font-semibold uppercase tracking-[0.14em] shadow-sm md:text-[8px] ${TAG_STYLES.New || 'bg-brand-black text-white'}`}>
              New
            </span>
          )}
          {typeof discount === 'number' && discount > 0 && (
            <span className="w-fit rounded-full border border-[#c38d2d] bg-brand-gold px-2 py-1 text-[7px] font-black uppercase tracking-[0.12em] text-brand-black shadow-[0_8px_20px_rgba(18,14,10,0.12)] md:text-[8px]">
              Save {discount}%
            </span>
          )}
        </div>

        <button
          type="button"
          onPointerDown={handleWishlistToggle}
          onTouchStart={handleWishlistToggle}
          onClick={handleWishlistToggle}
          style={{ touchAction: 'manipulation' }}
          className={`absolute right-2.5 top-2.5 z-10 flex h-8 w-8 items-center justify-center rounded-full border shadow-md transition-all duration-300 md:right-3 md:top-3 md:h-10 md:w-10 touch-target ${
            isWishlisted
              ? 'border-red-200 bg-red-50 text-red-500'
              : 'border-stone-200 bg-white/85 text-stone-500 backdrop-blur-sm hover:bg-white hover:text-red-500'
          }`}
          aria-label="Toggle Favorite List"
        >
          <Heart size={14} fill={isWishlisted ? 'currentColor' : 'none'} className="pointer-events-none md:size-[16px]" />
        </button>

        <div
          className={`absolute inset-0 flex items-center justify-center bg-brand-black/25 backdrop-blur-[1px] transition-opacity duration-300 max-md:hidden ${
            hovered ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <button
            onClick={() => onQuickView(product)}
            className="quick-preview-btn flex items-center gap-2 rounded-full border border-brand-gold/30 bg-white px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-black shadow-xl transition-all duration-200 hover:bg-brand-black hover:text-brand-gold active:scale-95 touch-target"
          >
            <Eye size={13} />
            Quick Preview
          </button>
        </div>
      </div>

      {user && user.role === 'admin' && (
        <div className="absolute left-2.5 top-2.5 z-20 flex gap-2 md:left-3 md:top-3">
          <button onClick={() => actions.toggleHero(product.id)} className={`flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow touch-target md:h-10 md:w-10 ${product.hero ? 'text-yellow-500' : ''}`} title={product.hero ? 'Unmark Best Seller' : 'Mark Best Seller'}>
            <Star size={14} fill={product.hero ? 'currentColor' : 'none'} />
          </button>
          {onEdit && (
            <button onClick={() => onEdit?.(product)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow touch-target md:h-10 md:w-10">
              <Edit2 size={14} />
            </button>
          )}
          {onDelete && (
            <button onClick={() => onDelete?.(product)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-red-500 shadow touch-target md:h-10 md:w-10">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}

      <div className="product-card-info flex flex-1 flex-col bg-[linear-gradient(180deg,_#fffdfb_0%,_#f8f2ea_100%)] p-3 md:p-4 md:pb-5">
        <p className="mb-1.5 text-[8px] font-bold uppercase tracking-[0.22em] text-[#8f6b3d] md:text-[9px]">
          {product.brand}
        </p>

        <h3 className="mb-3 flex-1 text-[12px] font-semibold leading-[1.35] text-[#1d130d] transition-colors duration-300 md:text-[14px]">
          {product.name}
        </h3>

        <div className="border-t border-[#f0e3d0] pt-3">
          <div className="flex flex-col gap-3">
            <div className="w-full">
              {user && user.role === 'admin' ? (
                <div className="space-y-1 text-[11px] text-stone-700 md:text-[12px]">
                  <div className="text-stone-400">Our Price</div>
                  <div className="font-semibold">EGP {ourPrice.toFixed(2)}</div>
                  <div className="mt-1 text-stone-400">General Price</div>
                  <div className="font-semibold line-through">EGP {(generalPrice !== undefined ? generalPrice : 0).toFixed(2)}</div>
                  <div className="mt-1 text-stone-400">Store Price</div>
                  <div className="text-base font-bold text-brand-black">EGP {(typeof storePrice === 'number' ? storePrice.toFixed(2) : '0.00')}</div>
                </div>
              ) : (
                <div className="flex items-end gap-2">
                  <span className="text-[14px] font-extrabold text-brand-black md:text-[18px]">
                    EGP {(typeof storePrice === 'number' ? storePrice.toFixed(2) : '0.00')}
                  </span>
                  {generalPrice !== undefined && (
                    <span className="text-[10px] text-stone-400 line-through md:text-[12px]">
                      EGP {generalPrice.toFixed(2)}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="w-full">
              <button
                onClick={handleAddClick}
                style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                className={`card-add-btn flex w-full items-center justify-center gap-1 rounded-full px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition-all duration-300 active:scale-95 touch-target md:px-4 md:py-2.5 md:text-[11px] ${
                  addedAnim
                    ? 'bg-emerald-600 text-white shadow-[0_12px_22px_rgba(16,185,129,0.28)]'
                    : 'bg-brand-black text-brand-gold shadow-[0_14px_24px_rgba(24,18,14,0.18)] hover:bg-brand-gold hover:text-brand-black hover:-translate-y-0.5 hover:shadow-[0_18px_30px_rgba(24,18,14,0.2)]'
                }`}
              >
                {addedAnim ? (
                  <>
                    <Check size={12} strokeWidth={3} />
                    <span>Added!</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag size={12} />
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
