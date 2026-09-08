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
  activeCategory,
}: HeaderProps) {
  // Keep header layout identical across viewports (no mobile-specific stacking)
  const { user, logout } = useAuth();
  const headerRef = useRef<HTMLDivElement>(null);

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
                        className="header-auth-btn px-2.5 py-1 rounded-full bg-stone-100 text-[#e0e0e0] font-semibold hover:bg-stone-200 transition-colors flex items-center gap-1 text-[11px] touch-target"
                        onClick={() => onAuthOpen && onAuthOpen(true)}
                      >
                        <User size={13} style={{ color: '#e0e0e0' }} /> {user.name ? user.name.trim().split(/\s+/)[0] : ''}
                      </button>
                      <button
                        type="button"
                        onClick={logout}
                        className="header-auth-btn px-2.5 py-1 rounded-full text-[11px] text-[#e0e0e0] hover:text-white hover:bg-white/10 transition-colors touch-target"
                      >
                        Sign out
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onAuthOpen && onAuthOpen(true)}
                      className="header-auth-btn px-2.5 py-1 rounded-full bg-stone-100 text-[#e0e0e0] font-semibold hover:bg-stone-200 transition-colors text-[11px] touch-target max-md:bg-brand-black max-md:text-white max-md:border max-md:border-brand-gold max-md:shadow-sm max-md:font-bold"
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
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="flex flex-col md:flex-row items-center justify-between h-auto md:h-20 gap-3 md:gap-4 w-full">

              <div className="w-full md:w-auto flex items-center">
                <button type="button" onClick={() => onMenuToggle && onMenuToggle()} className="hidden" aria-label="Open menu">
                  <Menu size={20} />
                </button>
                <button type="button" onClick={onHomeClick} className="max-md:hidden flex items-center gap-3 group text-left transition-transform active:scale-98">
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

              <div className="w-full md:flex-1 md:max-w-lg mt-2 md:mt-0 order-3 md:order-2">
                <div className="relative group">
                  <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 group-focus-within:text-brand-gold transition-colors duration-200" />
                  <input type="text" value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} placeholder="Search over 1,000+ luxury cosmetics, skincare, perfumes..." className="w-full pl-11 pr-10 py-2.5 text-sm bg-brand-cream/80 border border-stone-200 rounded-full focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold focus:bg-white transition-all placeholder-stone-400 text-brand-black shadow-inner" />
                  {searchQuery && <button type="button" onClick={() => onSearchChange("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400"><X size={15} /></button>}
                </div>
              </div>

              <div className="order-2 flex w-full flex-row items-center justify-between gap-1 overflow-visible md:order-3 md:w-auto md:justify-end">
                <button type="button" onClick={onWishlistOpen} className={`header-wishlist-btn relative inline-flex w-auto items-center justify-center gap-2 rounded-full bg-brand-black px-3 py-1 text-[9px] font-semibold whitespace-nowrap text-white shadow-luxury transition-all group cursor-pointer touch-target md:px-3 md:py-1.5 ${activeCategory === "favorites" ? "active" : ""}`} aria-label="Favorite List" data-active={activeCategory === "favorites"}>
                  <div className="inline-flex items-center gap-2"><Heart size={12} className="text-brand-gold transition-colors pointer-events-none" /><span className="text-[9px] md:text-sm">Favorites</span></div>
                </button>

                <button type="button" onClick={onCartOpen} className={`header-cart-btn relative inline-flex w-auto items-center justify-center gap-2 bg-brand-black text-white px-3 py-1 text-[9px] font-semibold whitespace-nowrap rounded-full shadow-luxury hover:bg-brand-charcoal hover:shadow-luxury-hover transition-all duration-300 group cursor-pointer touch-target md:px-3 md:py-1.5 ${(activeCategory === 'cart' || cartOpen) ? 'active' : ''}`} data-active={activeCategory === 'cart' || cartOpen} aria-label="Bag">
                  <div className="relative pointer-events-none">
                    <ShoppingBag size={11} className="text-brand-gold group-hover:scale-110 transition-transform" />
                    {cartCount > 0 && (<span className="absolute -top-2 -right-2 min-w-[14px] h-[14px] bg-brand-gold text-brand-black text-[8px] font-extrabold rounded-full flex items-center justify-center px-0.5">{cartCount}</span>)}
                  </div>
                  <span className="uppercase tracking-wider pointer-events-none text-[9px] md:text-sm">Bag</span>
                </button>

                <button type="button" onClick={()=>onTrackOpen && onTrackOpen(true)} className={`header-track-btn inline-flex w-auto items-center justify-center gap-2 rounded-full bg-brand-black px-3 py-1 text-[9px] font-semibold whitespace-nowrap text-white shadow-luxury transition-all cursor-pointer touch-target md:px-3 md:py-1.5 ${activeCategory === "tracking" ? "active" : ""}`} aria-label="Track Orders" data-active={activeCategory === "tracking"}>
                  <Truck size={12} className="text-brand-gold pointer-events-none" />
                  <span className="text-[9px] md:text-sm">Tracking</span>
                </button>

                <button
                  type="button"
                  onClick={onAssistantOpen}
                  className="header-assistant-btn inline-flex w-auto items-center justify-center gap-2 whitespace-nowrap rounded-full bg-brand-black px-3 py-1 text-[9px] font-semibold tracking-wide text-white shadow-luxury transition hover:bg-brand-charcoal hover:shadow-luxury-hover focus:outline-none focus:ring-2 focus:ring-brand-gold/40 md:px-4 md:py-1.5 md:text-sm"
                  aria-label="Your Assistant"
                >
                  <Bot size={12} className="text-brand-gold" />
                  <span className="text-white text-[9px] md:text-sm">Your Assistant</span>
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
