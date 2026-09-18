import React, { useEffect, useRef } from "react";
import { Menu } from "lucide-react";
import { ShoppingBag, Heart, Search, X, ShieldCheck, User, Truck, Bot } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

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
  onMenuToggle?: () => void;
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
  // Keep header layout identical across viewports (no mobile-specific stacking)
  const { user, logout } = useAuth();
  const headerRef = useRef<HTMLDivElement>(null);
  const lastTouchTimeRef = useRef(0);

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
  }, []);

  const handleToggleTouchStart = (e: React.TouchEvent<HTMLButtonElement>) => {
    // Prevent the touch event from bubbling to document-level listeners
    e.stopPropagation();

    const now = Date.now();
    lastTouchTimeRef.current = now;
    if (onMenuToggle) onMenuToggle();
  };

  const handleToggleTouchEnd = (e: React.TouchEvent<HTMLButtonElement>) => {
    // Prevent the touchend from causing a bubbling click to close the sidebar elsewhere
    e.stopPropagation();
  };

  const handleToggleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Prevent the click from bubbling to document listeners
    e.stopPropagation();

    const now = Date.now();
    // If a touchstart occurred within the last 500ms, ignore this ghost click to prevent double toggling
    if (now - lastTouchTimeRef.current < 500) {
      return;
    }
    if (onMenuToggle) onMenuToggle();
  };

  return (
    <>
      {/* ── Sticky full-height header wrapper ── */}
      {/* Both the announcement bar AND the main nav live inside this sticky container.
          Using sticky keeps the header in document flow so the content below it
          starts cleanly beneath it at top of page, and stays pinned at top-0 during scroll. */}
      <div ref={headerRef} className="sticky top-0 z-50 w-full">
        {/* Top Luxury Announcement Bar */}
        <div className="bg-brand-black text-white text-[11px] font-medium tracking-wider py-1.5 px-4 border-b border-brand-charcoal">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
                {/* Account / Admin & Theme Toggle */}
                <div className="flex items-center gap-2 z-50">
                  {user ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        className="header-auth-btn px-2.5 py-1 rounded-full bg-amber-400 text-brand-black font-semibold hover:bg-amber-500 transition-colors flex items-center gap-1 text-[11px] touch-target"
                        onClick={() => onAuthOpen && onAuthOpen(true)}
                      >
                        <User size={13} style={{ color: '#111827' }} /> {user.name ? user.name.trim().split(/\s+/)[0] : ''}
                      </button>
                      <button
                        type="button"
                        onClick={logout}
                        className="header-auth-btn px-2.5 py-1 rounded-full bg-amber-400 text-brand-black text-[11px] font-semibold hover:bg-amber-500 transition-colors touch-target"
                      >
                        Sign out
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onAuthOpen && onAuthOpen(true)}
                      className="header-auth-btn px-2.5 py-1 rounded-full bg-amber-400 text-brand-black font-semibold hover:bg-amber-500 transition-colors text-[11px] touch-target max-md:bg-amber-400 max-md:text-brand-black max-md:border max-md:border-amber-500 max-md:shadow-sm max-md:font-bold"
                    >
                      Sign in
                    </button>
                  )}
                </div>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-gold animate-pulse" />
              <span className="text-stone-300 hidden sm:inline">
                100% Authentic Dermo-Cosmetics &amp; Pharmacy Formulations
              </span>
              <span className="text-stone-300 sm:hidden">
                100% Authentic Beauty &amp; Pharmacy
              </span>
            </div>

            <div className="max-md:hidden flex items-center gap-3">
              <span className="font-tagline text-brand-gold font-medium tracking-wide">
                Ur favorite Mono choice
              </span>
              <span className="text-stone-600 hidden md:inline">|</span>
              <span className="text-stone-400 hidden md:inline flex items-center gap-1">
                <ShieldCheck size={13} className="text-brand-gold" /> Licensed Pharmacy Guaranteed
              </span>
            </div>

            <div className="hidden max-md:flex items-center gap-2 pr-1">
              <div className="w-6 h-6 rounded-lg overflow-hidden border border-brand-gold/40 bg-white shadow-sm">
                <img src="/logo.jpg" alt="PherMono logo" className="w-full h-full object-contain" />
              </div>
              <span className="font-tagline text-[10px] text-brand-gold font-medium tracking-[0.08em]">
                Ur favorite Mono choice
              </span>
            </div>
          </div>
        </div>

        {/* Main Navigation Header */}
        <header className="glass-nav shadow-sm transition-all duration-300">
          <div className="max-w-7xl mx-auto px-3 sm:px-6">
            <div className="flex flex-col md:flex-row items-center justify-between h-auto md:h-20 py-2.5 md:py-0 gap-2.5 md:gap-4 w-full">

              <div className="hidden md:flex items-center">
                <button type="button" onClick={onHomeClick} className="flex items-center gap-3 group text-left transition-transform active:scale-98 touch-target">
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden shadow-sm border border-brand-gold-border bg-white flex items-center justify-center p-0.5 group-hover:border-brand-gold group-hover:shadow-luxury transition-all">
                    <img src="/logo.jpg" alt="PherMono PhM Logo" className="w-full h-full object-contain" />
                  </div>
                  <div className="pointer-events-none">
                    <div className="flex items-baseline">
                      <span className="text-sm md:text-2xl font-bold tracking-tight text-brand-black font-sans group-hover:text-brand-gold-dark transition-colors">Pher<span className="text-brand-gold">Mono</span></span>
                    </div>
                    <p className="font-tagline text-[11px] md:text-xs text-brand-gold font-medium tracking-wide -mt-0.5">Ur favorite Mono choice</p>
                  </div>
                </button>
              </div>

              <div className="w-full md:flex-1 md:max-w-lg order-3 md:order-2">
                <div className="flex items-center gap-2.5 w-full">
                  <button
                    type="button"
                    onPointerDown={(e) => { e.stopPropagation(); if (onMenuToggle) onMenuToggle(); }}
                    onTouchStart={handleToggleTouchStart}
                    onTouchEnd={handleToggleTouchEnd}
                    onClick={handleToggleClick}
                    style={{ touchAction: 'manipulation' }}
                    className="header-menu-btn md:hidden flex shrink-0 items-center justify-center w-11 h-11 rounded-full bg-brand-cream/90 border border-stone-200 text-brand-black hover:bg-brand-gold-light/60 active:scale-95 active:bg-brand-gold-light transition-all cursor-pointer touch-target shadow-inner select-none z-10 relative"
                    aria-label="Open categories menu"
                    aria-expanded={isMenuOpen}
                  >
                    <Menu size={20} className="pointer-events-none" />
                  </button>
                  <div className="relative group flex-1 min-w-0">
                    <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 group-focus-within:text-brand-gold transition-colors duration-200" />
                    <input type="text" value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} placeholder="Search over 1,000+ luxury cosmetics, skincare, perfumes..." className="w-full pl-11 pr-10 py-2.5 text-sm max-md:text-base bg-brand-cream/80 border border-stone-200 rounded-full focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold focus:bg-white transition-all placeholder-stone-400 text-brand-black shadow-inner" style={{ fontSize: '16px' }} />
                    {searchQuery && <button type="button" onClick={() => onSearchChange("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 touch-target"><X size={15} /></button>}
                  </div>
                </div>
              </div>

              <div className="order-2 grid grid-cols-4 gap-1.5 w-full md:flex md:w-auto md:items-center md:justify-end md:gap-2">
                <button
                  type="button"
                  onPointerDown={(e)=>{ e.stopPropagation(); if (onWishlistOpen) onWishlistOpen(); }}
                  onClick={onWishlistOpen}
                  style={{ touchAction: 'manipulation' }}
                  className={`header-wishlist-btn relative inline-flex items-center justify-center gap-1 sm:gap-2 rounded-full bg-brand-black px-1.5 py-1.5 text-[10px] sm:text-[11px] font-semibold whitespace-nowrap text-white shadow-luxury transition-all group cursor-pointer touch-target md:px-3 md:py-1.5 md:text-sm min-w-0 ${
                    activeCategory === "favorites" ? "active" : ""
                  }`}
                  aria-label="Favorite List"
                  data-active={activeCategory === "favorites"}
                >
                  <Heart size={12} className="text-brand-gold transition-colors pointer-events-none shrink-0" />
                  <span className="truncate pointer-events-none">Favorites</span>
                </button>

                <button
                  type="button"
                  onPointerDown={(e)=>{ e.stopPropagation(); if (onCartOpen) onCartOpen(); }}
                  onClick={onCartOpen}
                  style={{ touchAction: 'manipulation' }}
                  className={`header-cart-btn relative inline-flex items-center justify-center gap-1 sm:gap-2 bg-brand-black text-white px-1.5 py-1.5 text-[10px] sm:text-[11px] font-semibold whitespace-nowrap rounded-full shadow-luxury hover:bg-brand-charcoal hover:shadow-luxury-hover transition-all duration-300 group cursor-pointer touch-target md:px-3 md:py-1.5 md:text-sm min-w-0 ${
                    (activeCategory === 'cart' || cartOpen) ? 'active' : ''
                  }`}
                  data-active={activeCategory === 'cart' || cartOpen}
                  aria-label="Bag"
                >
                  <div className="relative pointer-events-none shrink-0 flex items-center">
                    <ShoppingBag size={12} className="text-brand-gold group-hover:scale-110 transition-transform" />
                    {cartCount > 0 && (
                      <span className="absolute -top-1.5 -right-2 min-w-[14px] h-[14px] bg-brand-gold text-brand-black text-[8px] font-extrabold rounded-full flex items-center justify-center px-0.5 shadow-sm">
                        {cartCount}
                      </span>
                    )}
                  </div>
                  <span className="uppercase tracking-wider pointer-events-none">Bag</span>
                </button>

                <button
                  type="button"
                  onPointerDown={(e)=>{ e.stopPropagation(); if (onTrackOpen) onTrackOpen(true); }}
                  onClick={() => onTrackOpen && onTrackOpen(true)}
                  style={{ touchAction: 'manipulation' }}
                  className={`header-track-btn relative inline-flex items-center justify-center gap-1 sm:gap-2 rounded-full bg-brand-black px-1.5 py-1.5 text-[10px] sm:text-[11px] font-semibold whitespace-nowrap text-white shadow-luxury transition-all cursor-pointer touch-target md:px-3 md:py-1.5 md:text-sm min-w-0 ${
                    activeCategory === "tracking" ? "active" : ""
                  }`}
                  aria-label="Track Orders"
                  data-active={activeCategory === "tracking"}
                >
                  <Truck size={12} className="text-brand-gold pointer-events-none shrink-0" />
                  <span className="truncate pointer-events-none">Tracking</span>
                </button>

                <button
                  type="button"
                  onPointerDown={(e)=>{ e.stopPropagation(); if (onAssistantOpen) onAssistantOpen(); }}
                  onClick={onAssistantOpen}
                  style={{ touchAction: 'manipulation' }}
                  className={`header-assistant-btn relative inline-flex items-center justify-center gap-1 sm:gap-2 whitespace-nowrap rounded-full bg-brand-black px-1.5 py-1.5 text-[10px] sm:text-[11px] font-semibold tracking-wide text-white shadow-luxury transition hover:bg-brand-charcoal hover:shadow-luxury-hover focus:outline-none focus:ring-2 focus:ring-brand-gold/40 cursor-pointer touch-target md:px-4 md:py-1.5 md:text-sm min-w-0 ${
                    activeCategory === "assistant" ? "active" : ""
                  }`}
                  aria-label="Your Assistant"
                  data-active={activeCategory === "assistant"}
                >
                  <Bot size={12} className="text-brand-gold shrink-0" />
                  <span className="truncate pointer-events-none">
                    <span className="hidden sm:inline">Your </span>Assistant
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
