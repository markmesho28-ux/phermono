import React, { useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";
import { ShoppingBag, Heart, Search, X, ShieldCheck, User, Truck, Bot, Edit2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  DEFAULT_PROMO_BANNER,
  fetchPromoBannerConfig,
  savePromoBannerContent,
  type PromoBannerConfig,
} from "../utils/promoBanner";

interface HeaderProps {
  cartCount: number;
  wishlistCount: number;
  onCartOpen: () => void;
  cartOpen?: boolean;
  onTrackOpen?: (open: boolean) => void;
  onAssistantOpen?: () => void;
  onProfileOpen?: (open: boolean) => void;
  onWishlistOpen?: () => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onHomeClick: () => void;
  onAuthOpen?: (open: boolean) => void;
  // Accept an optional forceOpen boolean to explicitly open the sidebar when desired
  onMenuToggle?: (forceOpen?: boolean) => void;
  isMenuOpen?: boolean;
  activeCategory?: string;
}

export default function Header({
  cartCount,
  cartOpen,
  wishlistCount,
  onCartOpen,
  onTrackOpen,
  onAssistantOpen,
  onWishlistOpen,
  searchQuery,
  onSearchChange,
  onHomeClick,
  onAuthOpen,
  onMenuToggle,
  isMenuOpen,
  activeCategory,
}: HeaderProps) {
  const { user, logout } = useAuth();
  const headerRef = useRef<HTMLDivElement>(null);
  const lastMenuToggleRef = useRef(0);
  const lastCartToggleRef = useRef(0);
  const lastAuthActionRef = useRef(0);

  const handleAuthAction = (callback: () => void, event?: React.SyntheticEvent | React.PointerEvent | React.TouchEvent) => {
    if (event && typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }
    const now = Date.now();
    if (now - lastAuthActionRef.current < 300) {
      return;
    }
    lastAuthActionRef.current = now;
    callback();
  };

  const handleMenuAction = (event: React.SyntheticEvent) => {
    event.stopPropagation();
    const now = Date.now();
    if (now - lastMenuToggleRef.current < 400) {
      return;
    }
    lastMenuToggleRef.current = now;
    if (onMenuToggle) onMenuToggle(true);
  };

  const handleCartAction = (event: React.SyntheticEvent) => {
    event.stopPropagation();
    const now = Date.now();
    if (now - lastCartToggleRef.current < 400) {
      return;
    }
    lastCartToggleRef.current = now;
    if (onCartOpen) onCartOpen();
  };

  const BANNER_CACHE_KEY = 'phermono_promo_banner_v1';
  const readBannerCache = (): PromoBannerConfig | null => {
    try {
      const raw = localStorage.getItem(BANNER_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed?.content?.headline === 'string') return parsed as PromoBannerConfig;
    } catch (_) { /* ignore */ }
    return null;
  };

  const [bannerConfig, setBannerConfig] = useState<PromoBannerConfig>(() => readBannerCache() ?? DEFAULT_PROMO_BANNER);

  useEffect(() => {
    let isMounted = true;
    const loadBanner = async () => {
      try {
        const config = await fetchPromoBannerConfig();
        if (isMounted && config && config.content.headline) {
          setBannerConfig(config);
          try { localStorage.setItem(BANNER_CACHE_KEY, JSON.stringify(config)); } catch (_) {}
        }
      } catch (_) {}
    };
    loadBanner();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    const updateHeight = () => {
      if (headerRef.current) {
        const height = headerRef.current.offsetHeight;
        document.documentElement.style.setProperty('--header-height', `${height}px`);
      }
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, [bannerConfig]);

  return (
    <>
      {/* ── Sticky full-height header wrapper ── */}
      {/* Both the announcement bar AND the main nav live inside this sticky container.
          Using sticky keeps the header in document flow so the content below it
          starts cleanly beneath it at top of page, and stays pinned at top-0 during scroll. */}
      <div ref={headerRef} className="sticky top-0 z-50 w-full">
        {/* Top-Most Promotional Announcement Bar */}
        {bannerConfig && bannerConfig.content?.headline && (
          <div className="promo-banner-shell relative w-full overflow-hidden text-white z-[60]">
            <div className="promo-banner-inner">
              <span className="promo-banner-accent promo-banner-accent--left" aria-hidden="true" />

              <div className="promo-banner-copy-group">
                <span className="promo-banner-mark promo-banner-mark--left" aria-hidden="true">✦</span>
                <div className="promo-banner-text-group">
                  <p className="promo-banner-headline">{bannerConfig.content.headline}</p>
                </div>
                <span className="promo-banner-mark promo-banner-mark--right" aria-hidden="true">✦</span>
                {user?.role === 'admin' && (
                  <button
                    type="button"
                    aria-label="Edit promotional text"
                    onClick={() => {
                      const newText = window.prompt("Edit promotional announcement text:", bannerConfig.content.headline);
                      if (newText && newText.trim() && newText.trim() !== bannerConfig.content.headline) {
                        const updated: PromoBannerConfig = {
                          ...bannerConfig,
                          content: {
                            ...bannerConfig.content,
                            headline: newText.trim()
                          }
                        };
                        setBannerConfig(updated);
                        try { localStorage.setItem(BANNER_CACHE_KEY, JSON.stringify(updated)); } catch (_) {}
                        savePromoBannerContent(updated).catch(console.error);
                      }
                    }}
                    className="promo-banner-edit shrink-0 opacity-70 hover:opacity-100 transition-opacity"
                    style={{ touchAction: 'manipulation' }}
                  >
                    <Edit2 size={11} className="text-[#f5d97a]" />
                  </button>
                )}
              </div>

              <span className="promo-banner-accent promo-banner-accent--right" aria-hidden="true" />
            </div>
          </div>
        )}

        {/* Top Luxury Announcement Bar */}
        <div className="relative z-40 bg-gradient-to-r from-[#0c0c0d] via-[#141416] to-[#0c0c0d] text-white text-[11px] py-1.5 sm:py-2 px-3 sm:px-6 border-b border-brand-gold/25 shadow-sm">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            {/* Left: Auth Controls & Authentic Formulations Badge */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Account / Auth */}
              <div className="flex items-center gap-1.5 z-50">
                {user ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className="header-auth-btn px-2.5 py-0.5 rounded-full bg-gradient-to-r from-brand-gold to-brand-gold-hover text-brand-black font-bold hover:brightness-110 transition-all flex items-center gap-1 text-[10px] sm:text-[11px] tracking-wide touch-target shadow-xs border border-amber-300/40"
                      onPointerDown={(event) => handleAuthAction(() => onAuthOpen && onAuthOpen(true), event)}
                      onTouchStart={(event) => handleAuthAction(() => onAuthOpen && onAuthOpen(true), event)}
                      onClick={(event) => handleAuthAction(() => onAuthOpen && onAuthOpen(true), event)}
                      style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', pointerEvents: 'auto' }}
                    >
                      <User size={12} style={{ color: '#111827' }} />
                      <span>{user.name ? user.name.trim().split(/\s+/)[0] : 'Account'}</span>
                    </button>
                    <button
                      type="button"
                      onPointerDown={(event) => handleAuthAction(() => logout(), event)}
                      onTouchStart={(event) => handleAuthAction(() => logout(), event)}
                      onClick={(event) => handleAuthAction(() => logout(), event)}
                      className="header-auth-btn px-2.5 py-0.5 rounded-full bg-white/10 hover:bg-white/20 text-stone-300 hover:text-white text-[10px] sm:text-[11px] font-medium transition-colors touch-target border border-white/15"
                      style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', pointerEvents: 'auto' }}
                    >
                      Sign out
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onPointerDown={(event) => handleAuthAction(() => onAuthOpen && onAuthOpen(true), event)}
                    onTouchStart={(event) => handleAuthAction(() => onAuthOpen && onAuthOpen(true), event)}
                    onClick={(event) => handleAuthAction(() => onAuthOpen && onAuthOpen(true), event)}
                    className="header-auth-btn px-3 py-0.5 rounded-full bg-gradient-to-r from-brand-gold to-brand-gold-hover text-brand-black font-bold hover:brightness-110 transition-all text-[10px] sm:text-[11px] tracking-wide touch-target shadow-xs border border-amber-300/40"
                    style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', pointerEvents: 'auto' }}
                  >
                    Sign in
                  </button>
                )}
              </div>
            </div>

            {/* Desktop Center/Right: Tagline & Licensed Guarantee */}
            <div className="max-md:hidden flex items-center gap-3.5">
              <span className="font-tagline text-brand-gold text-[12px] tracking-wide italic font-medium drop-shadow-[0_1px_3px_rgba(245,166,35,0.25)]">
                Ur favorite Mono choice
              </span>
              <span className="h-3 w-[1px] bg-brand-gold/30" />
              <div className="flex items-center gap-1.5 text-stone-300 text-[10.5px] tracking-wider uppercase font-light">
                <ShieldCheck size={13} className="text-brand-gold shrink-0 drop-shadow-[0_1px_2px_rgba(245,166,35,0.3)]" />
                <span className="text-stone-200 font-medium">Licensed Pharmacy Guaranteed</span>
              </div>
            </div>

            {/* Mobile Right: Compact Tagline & Brand Logo */}
            <div className="hidden max-md:flex items-center gap-2 pr-0.5">
              <div className="w-5 h-5 rounded-md overflow-hidden border border-brand-gold/50 bg-white/95 shadow-xs shrink-0">
                <img src="/logo.jpg" alt="PherMono logo" className="w-full h-full object-contain" />
              </div>
              <span className="font-tagline text-[10px] text-brand-gold font-medium italic tracking-wide">
                Ur favorite Mono choice
              </span>
            </div>
          </div>
        </div>

        {/* Main Navigation Header */}
        <header className="glass-nav relative shadow-sm border-b border-brand-gold-border/40 backdrop-blur-xl transition-all duration-300 bg-white/95">
          {/* Subtle Luxury Gold Edge Highlight */}
          <div className="absolute bottom-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-brand-gold/50 to-transparent pointer-events-none" />

          <div className="max-w-7xl mx-auto px-3 sm:px-6">
            <div className="flex flex-col md:flex-row items-center justify-between h-auto md:h-20 py-2.5 md:py-0 gap-2.5 md:gap-4 w-full">

              <div className="hidden md:flex items-center">
                <button type="button" onClick={onHomeClick} className="flex items-center gap-3 group text-left transition-all duration-300 active:scale-98 touch-target">
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden shadow-xs border border-brand-gold/50 bg-white flex items-center justify-center p-0.5 group-hover:border-brand-gold group-hover:shadow-[0_0_16px_rgba(245,166,35,0.3)] transition-all duration-300">
                    <img src="/logo.jpg" alt="PherMono PhM Logo" className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105" />
                  </div>
                  <div className="pointer-events-none">
                    <div className="flex items-baseline">
                      <span className="text-sm md:text-2xl font-bold tracking-tight text-brand-black font-sans group-hover:text-brand-gold-dark transition-colors duration-300">Pher<span className="text-brand-gold">Mono</span></span>
                    </div>
                    <p className="font-tagline text-[11px] md:text-xs text-brand-gold font-medium tracking-wide -mt-0.5 transition-opacity duration-300 group-hover:opacity-95">Ur favorite Mono choice</p>
                  </div>
                </button>
              </div>

              <div className="w-full md:flex-1 md:max-w-lg order-3 md:order-2">
                <div className="flex items-center gap-2 w-full">
                  <button
                    type="button"
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      if (event.pointerType === 'touch' || event.pointerType === 'pen') {
                        event.preventDefault();
                      }
                      handleMenuAction(event);
                    }}
                    onClick={handleMenuAction}
                    className="header-menu-btn md:hidden flex shrink-0 items-center justify-center w-11 h-11 rounded-full bg-gradient-to-b from-white to-brand-cream border border-brand-gold/45 text-brand-black hover:bg-brand-gold-light/60 active:scale-95 active:border-brand-gold active:bg-brand-gold-light transition-all duration-200 cursor-pointer touch-target shadow-xs select-none z-10 relative"
                    style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                    aria-label="Open categories menu"
                    aria-expanded={isMenuOpen}
                  >
                    <Menu size={20} className="pointer-events-none text-brand-black" />
                  </button>
                  <div className="relative group flex-1 min-w-0 transition-all duration-300">
                    <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 group-focus-within:text-brand-gold group-hover:text-stone-600 transition-colors duration-300" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => onSearchChange(e.target.value)}
                      placeholder="Search luxury cosmetics, skincare, perfumes..."
                      className="w-full pl-11 pr-10 py-2.5 sm:py-3 text-sm max-md:text-base bg-[#FAF8F5] hover:bg-white border border-brand-gold/30 hover:border-brand-gold/60 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/30 rounded-full focus:bg-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] focus:shadow-[0_2px_15px_rgba(245,166,35,0.15)] transition-all duration-300 placeholder-stone-400 text-brand-black"
                      style={{ fontSize: '16px' }}
                    />
                    {searchQuery && (
                      <button type="button" onClick={() => onSearchChange("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-brand-black transition-colors duration-200 touch-target">
                        <X size={15} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="order-2 flex w-full flex-row items-center justify-around gap-1.5 overflow-hidden sm:justify-between sm:gap-2 md:w-auto md:justify-end md:gap-2.5">
                {/* Favorites Button */}
                <button
                  type="button"
                  onPointerDown={(event) => {
                    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
                      event.preventDefault();
                      if (onWishlistOpen) onWishlistOpen();
                    }
                  }}
                  onClick={() => {
                    if (onWishlistOpen) onWishlistOpen();
                  }}
                  style={{ touchAction: 'manipulation' }}
                  className={`header-wishlist-btn relative inline-flex shrink-0 items-center justify-center gap-1 rounded-full bg-gradient-to-b from-[#242426] via-[#1a1a1c] to-[#111111] px-1.5 py-2 text-[7.5px] font-bold whitespace-nowrap text-white border border-brand-gold/40 shadow-[0_2px_8px_rgba(0,0,0,0.18)] hover:border-brand-gold hover:shadow-[0_4px_16px_rgba(245,166,35,0.25)] hover:-translate-y-0.5 active:translate-y-0 active:scale-95 active:border-brand-gold active:shadow-[0_0_12px_rgba(245,166,35,0.4)] transition-all duration-200 group cursor-pointer touch-target sm:gap-1.5 sm:px-2 sm:py-2.5 sm:text-[8.5px] md:px-3.5 md:py-2 md:text-xs min-w-0 ${
                    activeCategory === "favorites" ? "active border-brand-gold ring-1 ring-brand-gold/60 shadow-[0_0_14px_rgba(245,166,35,0.35)]" : ""
                  }`}
                  aria-label="Favorite List"
                  data-active={activeCategory === "favorites"}
                >
                  <Heart size={11} className="text-brand-gold drop-shadow-[0_1px_3px_rgba(245,166,35,0.5)] group-hover:scale-110 transition-all duration-200 pointer-events-none shrink-0 sm:size-[12px] md:size-[13px]" />
                  <span className="pointer-events-none tracking-[0.14em] uppercase text-[7.5px] sm:text-[8.5px] md:text-[10px]">Favorites</span>
                </button>

                {/* Bag Button */}
                <button
                  type="button"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
                      event.preventDefault();
                    }
                    handleCartAction(event);
                  }}
                  onClick={handleCartAction}
                  style={{ touchAction: 'manipulation' }}
                  className={`header-cart-btn relative inline-flex shrink-0 items-center justify-center gap-1 rounded-full bg-gradient-to-b from-[#242426] via-[#1a1a1c] to-[#111111] text-white px-1.5 py-2 text-[7.5px] font-bold whitespace-nowrap border border-brand-gold/40 shadow-[0_2px_8px_rgba(0,0,0,0.18)] hover:border-brand-gold hover:shadow-[0_4px_16px_rgba(245,166,35,0.25)] hover:-translate-y-0.5 active:translate-y-0 active:scale-95 active:border-brand-gold active:shadow-[0_0_12px_rgba(245,166,35,0.4)] transition-all duration-200 group cursor-pointer touch-target sm:gap-1.5 sm:px-2 sm:py-2.5 sm:text-[8.5px] md:px-3.5 md:py-2 md:text-[10px] min-w-0 ${
                    (activeCategory === 'cart' || cartOpen) ? 'active border-brand-gold ring-1 ring-brand-gold/60 shadow-[0_0_14px_rgba(245,166,35,0.35)]' : ''
                  }`}
                  data-active={activeCategory === 'cart' || cartOpen}
                  aria-label="Bag"
                >
                  <div className="relative pointer-events-none shrink-0 flex items-center">
                    <ShoppingBag size={11} className="text-brand-gold drop-shadow-[0_1px_3px_rgba(245,166,35,0.5)] group-hover:scale-110 transition-all duration-200 sm:size-[12px] md:size-[13px]" />
                    {cartCount > 0 && (
                      <span className="absolute -top-1.5 -right-2.5 min-w-[15px] h-[15px] bg-brand-gold text-brand-black text-[8px] font-black rounded-full flex items-center justify-center px-0.5 shadow-md border border-[#111111] group-hover:scale-105 transition-transform duration-200">
                        {cartCount}
                      </span>
                    )}
                  </div>
                  <span className="uppercase tracking-[0.14em] pointer-events-none text-[7.5px] sm:text-[8.5px] md:text-[10px]">Bag</span>
                </button>

                {/* Tracking Button */}
                <button
                  type="button"
                  onPointerDown={(event) => {
                    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
                      event.preventDefault();
                      if (onTrackOpen) onTrackOpen(true);
                    }
                  }}
                  onClick={() => {
                    if (onTrackOpen) onTrackOpen(true);
                  }}
                  style={{ touchAction: 'manipulation' }}
                  className={`header-track-btn relative inline-flex shrink-0 items-center justify-center gap-1 rounded-full bg-gradient-to-b from-[#242426] via-[#1a1a1c] to-[#111111] px-1.5 py-2 text-[7.5px] font-bold whitespace-nowrap text-white border border-brand-gold/40 shadow-[0_2px_8px_rgba(0,0,0,0.18)] hover:border-brand-gold hover:shadow-[0_4px_16px_rgba(245,166,35,0.25)] hover:-translate-y-0.5 active:translate-y-0 active:scale-95 active:border-brand-gold active:shadow-[0_0_12px_rgba(245,166,35,0.4)] transition-all duration-200 cursor-pointer touch-target sm:gap-1.5 sm:px-2 sm:py-2.5 sm:text-[8.5px] md:px-3.5 md:py-2 md:text-[10px] min-w-0 ${
                    activeCategory === "tracking" ? "active border-brand-gold ring-1 ring-brand-gold/60 shadow-[0_0_14px_rgba(245,166,35,0.35)]" : ""
                  }`}
                  aria-label="Track Orders"
                  data-active={activeCategory === "tracking"}
                >
                  <Truck size={11} className="text-brand-gold drop-shadow-[0_1px_3px_rgba(245,166,35,0.5)] group-hover:scale-110 transition-all duration-200 pointer-events-none shrink-0 sm:size-[12px] md:size-[13px]" />
                  <span className="pointer-events-none tracking-[0.14em] uppercase text-[7.5px] sm:text-[8.5px] md:text-[10px]">Tracking</span>
                </button>

                {/* Assistant Button */}
                <button
                  type="button"
                  onPointerDown={(event) => {
                    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
                      event.preventDefault();
                      if (onAssistantOpen) onAssistantOpen();
                    }
                  }}
                  onClick={() => {
                    if (onAssistantOpen) onAssistantOpen();
                  }}
                  style={{ touchAction: 'manipulation' }}
                  className={`header-assistant-btn relative inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full bg-gradient-to-b from-[#28282a] via-[#1d1d20] to-[#111111] px-1.5 py-2 text-[7.5px] font-bold tracking-wide text-white border border-brand-gold/55 shadow-[0_2px_10px_rgba(245,166,35,0.15)] hover:border-brand-gold hover:shadow-[0_4px_20px_rgba(245,166,35,0.3)] hover:-translate-y-0.5 active:translate-y-0 active:scale-95 active:border-brand-gold active:shadow-[0_0_14px_rgba(245,166,35,0.45)] focus:outline-none focus:ring-2 focus:ring-brand-gold/40 transition-all duration-200 cursor-pointer touch-target sm:gap-1.5 sm:px-2 sm:py-2.5 sm:text-[8.5px] md:px-4 md:py-2 md:text-[10px] min-w-0 ${
                    activeCategory === "assistant" ? "active border-brand-gold ring-1 ring-brand-gold/70 shadow-[0_0_16px_rgba(245,166,35,0.4)]" : ""
                  }`}
                  aria-label="Your Assistant"
                  data-active={activeCategory === "assistant"}
                >
                  <Bot size={11} className="text-brand-gold drop-shadow-[0_1px_3px_rgba(245,166,35,0.6)] group-hover:scale-110 transition-all duration-200 shrink-0 sm:size-[12px] md:size-[13px]" />
                  <span className="pointer-events-none tracking-[0.14em] uppercase text-[7.5px] sm:text-[8.5px] md:text-[10px]">
                    <span className="hidden lg:inline">Your </span>Assistant
                  </span>
                </button>
              </div>
            </div>
          </div>
        </header>
      {/* Auth modal is controlled by App via prop-driven handler */}
      </div>
    </>
  );
}
