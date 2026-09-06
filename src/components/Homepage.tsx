import React, { useState, useEffect, useRef } from "react";
import {
  ShoppingBag,
  Heart,
  Eye,
  Star,
  ChevronLeft,
  ChevronRight,
  Flame,
  Check,
  Sparkles,
} from "lucide-react";
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
}: HomepageProps) {
  const { products } = useData();
  // Best Sellers dataset controlled by admin `hero` flag
  const bestSellers = products.filter((p) => p.hero);
  const totalSlides = bestSellers.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [addedAnim, setAddedAnim] = useState(false);

  // Gesture / Drag tracking
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const dragDistanceRef = useRef(0);
  const [autoPlayKey, setAutoPlayKey] = useState(0);

  // ─── RELIABLE 3000ms AUTO-PLAY INTERVAL ──────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % totalSlides);
    }, 3000);

    return () => clearInterval(timer);
  }, [totalSlides, autoPlayKey]);

  // Manual navigation handlers that reset the 3s timer seamlessly
  const handleNext = () => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % totalSlides);
    setAutoPlayKey((k) => k + 1); // Resets the 3s interval timer on user click
  };

  const handlePrev = () => {
    setCurrentIndex((prevIndex) => (prevIndex - 1 + totalSlides) % totalSlides);
    setAutoPlayKey((k) => k + 1);
  };

  const handleGoTo = (index: number) => {
    setCurrentIndex(index);
    setAutoPlayKey((k) => k + 1);
  };

  // Touch & Mouse Drag Handlers
  const handleDragStart = (clientX: number) => {
    setIsDragging(true);
    startXRef.current = clientX;
    dragDistanceRef.current = 0;
  };

  const handleDragMove = (clientX: number) => {
    if (!isDragging) return;
    dragDistanceRef.current = clientX - startXRef.current;
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    if (dragDistanceRef.current < -40) {
      handleNext();
    } else if (dragDistanceRef.current > 40) {
      handlePrev();
    }
  };

  const currentProduct = bestSellers[currentIndex] || bestSellers[0];

  // Discount calculation using marketPrice & sellingPrice
  const market = currentProduct ? (typeof currentProduct.marketPrice === 'number' ? currentProduct.marketPrice : (typeof currentProduct.originalPrice === 'number' ? currentProduct.originalPrice : undefined)) : undefined;
  const sell = currentProduct ? (typeof currentProduct.sellingPrice === 'number' ? currentProduct.sellingPrice : currentProduct.price || 0) : 0;
  const discount = typeof market === 'number' && market > 0 ? Math.round(((market - sell) / market) * 100) : null;

  const isWishlisted = wishlist.some((w) => w.id === currentProduct?.id);

  const handleAddClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!currentProduct) return;
    onAddToCart(currentProduct);
    setAddedAnim(true);
    setTimeout(() => setAddedAnim(false), 1400);
  };

  if (!currentProduct) return null;

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 pt-4 pb-20 md:pb-8 animate-fadeIn select-none">
      
      {/* ─── FULL-WIDTH HERO BEST SELLERS CAROUSEL (3s RELIABLE AUTOPLAY) ── */}
      <div
        onMouseDown={(e) => handleDragStart(e.clientX)}
        onMouseMove={(e) => handleDragMove(e.clientX)}
        onMouseUp={handleDragEnd}
        onTouchStart={(e) => handleDragStart(e.touches[0].clientX)}
        onTouchMove={(e) => handleDragMove(e.touches[0].clientX)}
        onTouchEnd={handleDragEnd}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-black via-brand-charcoal to-brand-stone text-white shadow-2xl border border-brand-gold/30 min-h-[540px] sm:min-h-[580px] flex flex-col justify-between cursor-grab active:cursor-grabbing"
      >
        {/* Ambient Gold Glow Backdrop */}
        <div className="absolute -right-24 -top-24 w-[520px] h-[520px] bg-brand-gold/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-24 -bottom-24 w-[420px] h-[420px] bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header: Badge, Slogan & Clean Navigation Arrows */}
        <div className="relative z-10 p-6 sm:p-10 pb-0 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-brand-gold/20 border border-brand-gold/40 text-brand-gold text-xs font-bold uppercase tracking-wider shadow-sm">
              <Flame size={14} className="text-amber-400 fill-amber-400 animate-pulse" />
              <span>PhM Best Seller #{currentIndex + 1}</span>
            </div>
            <span className="font-tagline text-xs sm:text-sm text-stone-300 hidden md:inline">
              Ur favorite Mono choice
            </span>
          </div>

          {/* Navigation Arrow Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-brand-gold hover:text-brand-black border border-white/15 text-white flex items-center justify-center transition-all duration-200 backdrop-blur-sm shadow-sm active:scale-95"
              aria-label="Previous product"
            >
              <ChevronLeft size={20} />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-brand-gold hover:text-brand-black border border-white/15 text-white flex items-center justify-center transition-all duration-200 backdrop-blur-sm shadow-sm active:scale-95"
              aria-label="Next product"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {/* Main Center Content: Left Details + Right Framed Product Image */}
        <div className="relative z-10 px-6 sm:px-10 py-6 flex-1 flex flex-col lg:flex-row items-center justify-between gap-8 sm:gap-12">
          
          {/* Left Column: Typography, Ratings, Price & Action Buttons */}
          <div
            className="flex-1 max-w-xl text-left space-y-4 animate-fadeIn transition-opacity duration-300"
            key={currentProduct.id}
          >
            {/* Brand Name & Subcategory */}
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-extrabold uppercase tracking-widest text-brand-gold">
                {currentProduct.brand}
              </span>
              <span className="text-stone-500">•</span>
              <span className="text-xs text-stone-400 capitalize">
                {currentProduct.subcategory.replace("-", " ")}
              </span>
            </div>

            {/* Product Title */}
            <h1 className="font-serif-luxury text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-[1.15]">
              {currentProduct.name}
            </h1>

            {/* Star Ratings & Verified Reviews */}
            <div className="flex items-center gap-2">
              <div className="flex text-brand-gold">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    size={14}
                    fill={i < Math.floor(currentProduct.rating) ? "currentColor" : "none"}
                    stroke="currentColor"
                  />
                ))}
              </div>
              <span className="text-xs text-stone-300 font-medium">
                {currentProduct.rating} ({currentProduct.reviews.toLocaleString()} verified buyers)
              </span>
            </div>

            {/* Description */}
            <p className="text-xs sm:text-sm text-stone-300 leading-relaxed max-w-md line-clamp-3">
              {currentProduct.description}
            </p>

            {/* Target Skin Type */}
            {currentProduct.skinType && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-stone-400">Target Type:</span>
                <span className="text-xs font-bold text-brand-gold bg-brand-gold/15 border border-brand-gold/30 px-3 py-0.5 rounded-full">
                  {currentProduct.skinType} Skin
                </span>
              </div>
            )}

            {/* Price & Discount */}
            <div className="flex items-baseline gap-3 pt-2">
              <span className="text-3xl sm:text-4xl font-extrabold text-white">
                ${sell.toFixed(2)}
              </span>
              {market !== undefined && (
                <span className="text-base sm:text-lg text-stone-400 line-through">
                  ${market.toFixed(2)}
                </span>
              )}
              {discount && (
                <span className="bg-brand-gold text-brand-black font-extrabold text-xs px-3 py-1 rounded-full shadow-sm">
                  SAVE {discount}%
                </span>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-4">
              <button
                onClick={handleAddClick}
                className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-full font-bold text-xs uppercase tracking-wider shadow-gold-glow transition-all duration-300 active:scale-95 ${
                  addedAnim
                    ? "bg-emerald-500 text-white"
                    : "bg-brand-gold hover:bg-brand-gold-hover text-brand-black"
                }`}
              >
                {addedAnim ? (
                  <>
                    <Check size={16} strokeWidth={3} />
                    <span>Added to Bag!</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag size={16} />
                    <span>Add to Bag</span>
                  </>
                )}
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickView(currentProduct);
                }}
                className="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold uppercase tracking-wider transition-all backdrop-blur-md active:scale-95"
              >
                <Eye size={15} />
                <span>Quick View</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onWishlist(currentProduct);
                }}
                className={`p-4 rounded-full border transition-all active:scale-95 ${
                  isWishlisted
                    ? "bg-red-500/20 text-red-400 border-red-400/50"
                    : "bg-white/10 border-white/20 text-stone-300 hover:text-red-400 hover:bg-white/15"
                }`}
                aria-label="Save to Wishlist"
              >
                <Heart size={18} fill={isWishlisted ? "currentColor" : "none"} />
              </button>
            </div>
          </div>

          {/* Right Column: Prominent Luxury Product Image Stage */}
          <div className="w-full lg:w-5/12 max-w-sm sm:max-w-md flex justify-center pointer-events-none">
            <div className="relative group w-full aspect-square max-w-[360px] sm:max-w-[400px]">
              {/* Outer Glow */}
              <div className="absolute inset-0 bg-brand-gold rounded-3xl blur-xl opacity-25 group-hover:opacity-45 transition-opacity duration-700" />
              
              {/* Luxury Frame Container */}
              <div className="relative w-full h-full rounded-3xl overflow-hidden border-2 border-brand-gold/40 shadow-2xl bg-white/5 backdrop-blur-md p-4 sm:p-6 flex items-center justify-center">
                <img
                  src={currentProduct.image}
                  alt={currentProduct.name}
                  draggable={false}
                  className="w-full h-full object-cover rounded-2xl shadow-lg transition-transform duration-700 group-hover:scale-105"
                />

                {/* 100% Authentic Tag Pill */}
                <div className="absolute top-7 left-7 bg-brand-black/85 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-brand-gold/40 flex items-center gap-1.5 shadow-md">
                  <Sparkles size={13} className="text-brand-gold animate-pulse" />
                  <span className="text-[10px] font-bold text-brand-gold tracking-wide uppercase">
                    100% Authentic
                  </span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Bottom Pagination Bar: 3-Second Progress Bar & Slide Dots */}
        <div className="relative z-10 p-6 sm:p-10 pt-0 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-white/10">
          
          {/* Progress / Step Counter */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-brand-gold tracking-widest">
              {String(currentIndex + 1).padStart(2, "0")}
            </span>
            <div className="w-28 sm:w-44 h-1 bg-white/15 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-gold transition-all duration-500 rounded-full"
                style={{
                  width: `${((currentIndex + 1) / totalSlides) * 100}%`,
                }}
              />
            </div>
            <span className="text-xs font-medium text-stone-400 tracking-widest">
              {String(totalSlides).padStart(2, "0")}
            </span>
          </div>

          {/* Interactive Slide Dots */}
          <div className="flex items-center gap-2">
            {bestSellers.map((item, idx) => (
              <button
                key={item.id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleGoTo(idx);
                }}
                className={`h-2 rounded-full transition-all duration-500 ${
                  idx === currentIndex
                    ? "w-8 bg-brand-gold"
                    : "w-2 bg-white/30 hover:bg-white/60"
                }`}
                aria-label={`Go to Best Seller product ${idx + 1}`}
              />
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
