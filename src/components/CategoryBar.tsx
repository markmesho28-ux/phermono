import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ShoppingBag } from 'lucide-react';
import type { Category } from '../types';

interface CategoryBarProps {
  categories: Category[];
  activeId?: string | null;
  onSelect?: (id: string) => void;
}

// Editorial fallback imagery if an admin-created category has no custom image URL
const getCategoryFallbackImage = (label: string, id: string): string => {
  const query = (label + ' ' + id).toLowerCase();
  if (query.includes('skin') || query.includes('بشر')) {
    return 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=800&q=80';
  }
  if (query.includes('hair') || query.includes('شعر')) {
    return 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80';
  }
  if (query.includes('perfume') || query.includes('fragrance') || query.includes('عطر')) {
    return 'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=800&q=80';
  }
  if (query.includes('makeup') || query.includes('make') || query.includes('كياج') || query.includes('cosmetic')) {
    return 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=800&q=80';
  }
  if (query.includes('body') || query.includes('bath') || query.includes('جسم') || query.includes('استحمام')) {
    return 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=800&q=80';
  }
  return 'https://images.unsplash.com/photo-1616683693504-3ea7e9ad6fec?auto=format&fit=crop&w=800&q=80';
};

// Deprecated: kept as empty array for backwards compatibility
export const DEFAULT_FALLBACK_CATEGORIES: Category[] = [];

const GAP = 14; // pixels between cards

export default function CategoryBar({ categories, activeId = null, onSelect }: CategoryBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const hasCategories = Boolean(categories && categories.length > 0);
  const baseList = hasCategories
    ? (categories.length === 1 ? [categories[0], categories[0]] : categories)
    : [];
  const baseCount = baseList.length;

  // Quadrupled list for infinite looping: [copy1, copy2, copy3, copy4]
  // Provides generous buffer so side-by-side (2-card) view never meets empty boundaries
  const displayItems = baseCount > 1
    ? [...baseList, ...baseList, ...baseList, ...baseList]
    : baseList;

  // Start at index baseCount (first item of copy 2)
  const [currentIndex, setCurrentIndex] = useState(baseCount > 1 ? baseCount : 0);
  const [isTransitioning, setIsTransitioning] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  // Ref tracking current index to eliminate stale closures in callbacks and event listeners
  const currentIndexRef = useRef(currentIndex);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // Initialize with sensible measurement so cards render immediately without 0px layout flash
  const [containerWidth, setContainerWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return Math.max(Math.min(window.innerWidth - 32, 1280), 320);
    }
    return 600;
  });

  // Touch tracking
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);

  // Keep index synced if categories change or finish loading
  useEffect(() => {
    if (baseCount > 1) {
      setIsTransitioning(false);
      setCurrentIndex(baseCount);
    } else {
      setCurrentIndex(0);
    }
  }, [baseCount]);

  // ResizeObserver to calculate exact container width
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        if (w > 0) setContainerWidth(w);
      }
    };

    updateSize();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      resizeObserver = new ResizeObserver(updateSize);
      resizeObserver.observe(containerRef.current);
    }

    window.addEventListener('resize', updateSize);
    return () => {
      window.removeEventListener('resize', updateSize);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, []);

  // Card width is exactly half of (containerWidth - GAP)
  const cardWidth = containerWidth > 0 ? (containerWidth - GAP) / 2 : 280;
  const stepSize = cardWidth + GAP;

  const handleNext = useCallback(() => {
    if (baseCount < 2) return;
    setIsTransitioning(true);
    setCurrentIndex((prev) => {
      if (prev >= 2 * baseCount) {
        return baseCount + 1;
      }
      return prev + 1;
    });
  }, [baseCount]);

  const handlePrev = useCallback(() => {
    if (baseCount < 2) return;
    setIsTransitioning(true);
    setCurrentIndex((prev) => {
      if (prev <= 0) {
        return baseCount - 1;
      }
      return prev - 1;
    });
  }, [baseCount]);

  // Auto-scroll every 3 seconds (pauses when hovered or tab is backgrounded)
  useEffect(() => {
    if (baseCount < 2 || isPaused) return;

    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      handleNext();
    }, 3000);

    return () => clearInterval(timer);
  }, [baseCount, isPaused, handleNext]);

  // Tab visibility safeguard: normalize out-of-bounds index if tab was backgrounded
  useEffect(() => {
    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden && baseCount > 1) {
        const cur = currentIndexRef.current;
        if (cur >= 2 * baseCount || cur < baseCount) {
          setIsTransitioning(false);
          const normalized = baseCount + (((cur - baseCount) % baseCount + baseCount) % baseCount);
          setCurrentIndex(normalized);
        }
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
      return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }
  }, [baseCount]);

  // Seamless looping on transition end
  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    // Only handle transitionend for the track container's own transform
    if (e.target !== e.currentTarget) return;
    if (baseCount < 2) return;

    const cur = currentIndexRef.current;
    if (cur >= 2 * baseCount) {
      setIsTransitioning(false);
      setCurrentIndex(cur - baseCount);
    } else if (cur < baseCount) {
      setIsTransitioning(false);
      setCurrentIndex(cur + baseCount);
    }
  };

  // Fallback safety timeout in case browser drops transitionend event
  useEffect(() => {
    if (!isTransitioning || baseCount < 2) return;

    const cur = currentIndex;
    if (cur >= 2 * baseCount || cur < baseCount) {
      const timer = setTimeout(() => {
        setIsTransitioning(false);
        setCurrentIndex((prev) => {
          if (prev >= 2 * baseCount) return prev - baseCount;
          if (prev < baseCount) return prev + baseCount;
          return prev;
        });
      }, 650);

      return () => clearTimeout(timer);
    }
  }, [currentIndex, isTransitioning, baseCount]);

  // Turn transitions back on after silent snap
  useEffect(() => {
    if (!isTransitioning) {
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsTransitioning(true);
        });
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [isTransitioning]);

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setIsPaused(true);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const deltaX = touchStartX.current - e.changedTouches[0].clientX;
    const deltaY = touchStartY.current - e.changedTouches[0].clientY;

    if (Math.abs(deltaX) > 35 && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX > 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }
    setIsPaused(false);
  };

  // Clean skeleton loading state: eliminates temporary placeholder flicker on initial boot
  if (!hasCategories) {
    return (
      <section id="our-departments" className="w-full mb-6 sm:mb-8 select-none scroll-mt-12" aria-label="Categories">
        <div className="flex items-end justify-between gap-4 mb-4 px-1">
          <div>
            <p className="text-[10px] md:text-[11px] font-bold uppercase tracking-[0.28em] text-brand-gold-dark">
              Curated Collections
            </p>
            <h2 className="mt-1 font-serif-luxury text-2xl sm:text-3xl md:text-4xl text-brand-black leading-none">
              Our Departments
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-[14px]">
          <div className="h-64 sm:h-72 md:h-80 rounded-3xl bg-stone-100 animate-pulse border border-stone-200/60" />
          <div className="h-64 sm:h-72 md:h-80 rounded-3xl bg-stone-100 animate-pulse border border-stone-200/60" />
        </div>
      </section>
    );
  }

  const activeCategoryIndex = ((currentIndex % baseCount) + baseCount) % baseCount;

  return (
    <section id="our-departments" className="w-full mb-6 sm:mb-8 select-none scroll-mt-12" aria-label="Categories">
      {/* Header with section title, dot indicators, and scroll arrows */}
      <div className="flex items-end justify-between gap-4 mb-4 px-1">
        <div>
          <p className="text-[10px] md:text-[11px] font-bold uppercase tracking-[0.28em] text-brand-gold-dark">
            Curated Collections
          </p>
          <h2 className="mt-1 font-serif-luxury text-2xl sm:text-3xl md:text-4xl text-brand-black leading-none">
            Our Departments
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {/* Dot indicators */}
          {baseCount > 1 && (
            <div className="flex items-center gap-1.5" aria-hidden="true">
              {baseList.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    activeCategoryIndex === i
                      ? 'bg-brand-black w-4'
                      : 'bg-stone-300 w-1.5'
                  }`}
                />
              ))}
            </div>
          )}

          {/* Desktop Controls */}
          {baseCount > 1 && (
            <div className="hidden sm:flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrev}
                className="w-8 h-8 rounded-full bg-white border border-stone-200 text-stone-700 hover:border-brand-gold hover:text-brand-black hover:bg-brand-gold-light/40 transition-all flex items-center justify-center shadow-xs cursor-pointer touch-target active:scale-95"
                aria-label="Previous categories"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="w-8 h-8 rounded-full bg-white border border-stone-200 text-stone-700 hover:border-brand-gold hover:text-brand-black hover:bg-brand-gold-light/40 transition-all flex items-center justify-center shadow-xs cursor-pointer touch-target active:scale-95"
                aria-label="Next categories"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2-Card Viewport */}
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex items-stretch"
          style={{
            gap: `${GAP}px`,
            transform: `translateX(-${currentIndex * stepSize}px)`,
            transition: isTransitioning ? 'transform 600ms cubic-bezier(0.25, 1, 0.5, 1)' : 'none',
            willChange: 'transform',
          }}
          onTransitionEnd={handleTransitionEnd}
        >
          {displayItems.map((cat, idx) => {
            const active = cat.id === activeId;
            const bgImage = cat.image?.trim() || getCategoryFallbackImage(cat.label, cat.id);

            return (
              <button
                key={`${cat.id}-${idx}`}
                type="button"
                onClick={() => onSelect && onSelect(cat.id)}
                className={`relative flex-shrink-0 h-64 sm:h-72 md:h-80 rounded-3xl overflow-hidden shadow-luxury border transition-all duration-300 group cursor-pointer text-left focus:outline-none touch-manipulation bg-white ${
                  active
                    ? 'border-brand-gold ring-2 ring-brand-gold ring-offset-2 ring-offset-brand-cream'
                    : 'border-stone-200/80 hover:border-brand-gold/70 hover:shadow-2xl'
                }`}
                style={{
                  width: `${cardWidth}px`,
                  minWidth: `${cardWidth}px`,
                  maxWidth: `${cardWidth}px`,
                  touchAction: 'pan-y',
                }}
                aria-pressed={active}
                aria-label={`Category: ${cat.label}`}
              >
                {/* 100% Clear, bright, fully exposed background image — zero dark overlays, zero dimming */}
                <img
                  src={bgImage}
                  alt={cat.label}
                  decoding="async"
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-108"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    const fallback = getCategoryFallbackImage(cat.label, cat.id);
                    if (target.src !== fallback) {
                      target.src = fallback;
                    }
                  }}
                />

                {/* Sleek top dark gradient overlay for crisp contrast and premium depth */}
                <div className="absolute top-0 inset-x-0 h-24 sm:h-28 bg-gradient-to-b from-brand-black/85 via-brand-black/40 to-transparent z-10 pointer-events-none" />

                {/* Redesigned Department Title Overlay */}
                <div className="absolute top-3.5 sm:top-4 inset-x-3.5 sm:inset-x-4 z-20 pointer-events-none flex flex-col items-center">
                  <h3 className="font-serif-luxury text-lg sm:text-xl md:text-2xl font-bold text-white tracking-wide text-center drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)] group-hover:text-brand-gold transition-colors duration-300 truncate max-w-full">
                    {cat.label}
                  </h3>
                  <div className="w-6 h-0.5 bg-brand-gold/70 rounded-full mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>

                {/* "Shop Collection" — solid black pill button matching header Tracking/Assistant button design */}
                <div className="absolute bottom-3.5 sm:bottom-4 inset-x-3.5 sm:inset-x-4 z-20 flex justify-center pointer-events-none">
                  <div className="inline-flex items-center justify-center gap-1.5 rounded-full bg-brand-black px-3 py-1.5 text-[11px] sm:text-xs font-semibold whitespace-nowrap text-white shadow-luxury tracking-wide">
                    <ShoppingBag size={11} className="text-brand-gold shrink-0" />
                    <span>Shop Collection</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
