import React, { useState } from "react";
import { ShoppingBag, Heart, Search, X, ShieldCheck, User, Truck } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

interface HeaderProps {
  cartCount: number;
  wishlistCount: number;
  onCartOpen: () => void;
  onTrackOpen?: (open: boolean) => void;
  onProfileOpen?: (open: boolean) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onHomeClick: () => void;
  onAuthOpen?: (open: boolean) => void;
}

export default function Header({
  cartCount,
  wishlistCount,
  onCartOpen,
  onTrackOpen,
  searchQuery,
  onSearchChange,
  onHomeClick,
  onAuthOpen,
}: HeaderProps) {
  const [mobileSearchVisible, setMobileSearchVisible] = useState(false);
  const { user, logout } = useAuth();

  return (
    <>
      {/* Top Luxury Announcement Bar */}
      <div className="bg-brand-black text-white text-[11px] font-medium tracking-wider py-1.5 px-4 border-b border-brand-charcoal">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
              {/* Account / Admin */}
              <div className="flex items-center">
                {user ? (
                  <div className="flex items-center gap-2">
                    <button className="px-3 py-1 rounded-full bg-stone-100" onClick={()=>onAuthOpen && onAuthOpen(true)}>
                      <User size={16} /> {user.name}
                    </button>
                    <button onClick={logout} className="px-3 py-1 rounded-full text-sm">Sign out</button>
                  </div>
                ) : (
                  <button onClick={()=>onAuthOpen && onAuthOpen(true)} className="px-3 py-1 rounded-full bg-stone-100">Account</button>
                )}
              </div>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-gold animate-pulse" />
            <span className="text-stone-300 hidden sm:inline">
              100% Authentic Dermo-Cosmetics & Pharmacy Formulations
            </span>
            <span className="text-stone-300 sm:hidden">
              100% Authentic Beauty & Pharmacy
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-tagline text-brand-gold font-medium tracking-wide">
              Ur favorite Mono choice
            </span>
            <span className="text-stone-600 hidden md:inline">|</span>
            <span className="text-stone-400 hidden md:inline flex items-center gap-1">
              <ShieldCheck size={13} className="text-brand-gold" /> Licensed Pharmacy Guaranteed
            </span>
          </div>
        </div>
      </div>

      {/* Main Sticky Header */}
      <header className="sticky top-0 z-30 glass-nav shadow-sm transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-20 gap-4">
            
            {/* Brand Logo & Tagline */}
            <button
              onClick={onHomeClick}
              className="flex items-center gap-3 group text-left transition-transform active:scale-98"
            >
              <div className="relative w-12 h-12 rounded-xl overflow-hidden shadow-sm border border-brand-gold-border bg-white flex items-center justify-center p-0.5 group-hover:border-brand-gold group-hover:shadow-luxury transition-all">
                <img
                  src="/logo.jpg"
                  alt="PherMono PhM Logo"
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <div className="flex items-baseline">
                  <span className="text-2xl font-bold tracking-tight text-brand-black font-sans group-hover:text-brand-gold-dark transition-colors">
                    Pher<span className="text-brand-gold">Mono</span>
                  </span>
                </div>
                <p className="font-tagline text-xs text-brand-gold font-medium tracking-wide -mt-0.5">
                  Ur favorite Mono choice
                </p>
              </div>
            </button>

            {/* Central Search Bar (Desktop) */}
            <div className="flex-1 max-w-lg hidden md:block">
              <div className="relative group">
                <Search
                  size={17}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 group-focus-within:text-brand-gold transition-colors duration-200"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Search over 1,000+ luxury cosmetics, skincare, perfumes..."
                  className="w-full pl-11 pr-10 py-3 text-sm bg-brand-cream/80 border border-stone-200 rounded-full focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold focus:bg-white transition-all placeholder-stone-400 text-brand-black shadow-inner"
                />
                {searchQuery && (
                  <button
                    onClick={() => onSearchChange("")}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-brand-black transition-colors"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            </div>

            {/* Header Right Actions */}
            <div className="flex items-center gap-2">
              {/* Mobile Search Toggle */}
              <button
                onClick={() => setMobileSearchVisible(!mobileSearchVisible)}
                className="md:hidden p-2.5 rounded-full hover:bg-brand-gold-light/60 text-brand-black transition-colors"
                aria-label="Search"
              >
                <Search size={21} />
              </button>

              {/* Wishlist */}
              <button
                className="relative p-2.5 rounded-full hover:bg-brand-gold-light/60 text-brand-black transition-colors group"
                aria-label="Wishlist"
              >
                <Heart size={21} className="group-hover:text-red-500 transition-colors" />
                {wishlistCount > 0 && (
                  <span className="absolute 1 top-0.5 right-0.5 min-w-[19px] h-[19px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow-sm animate-fadeIn">
                    {wishlistCount}
                  </span>
                )}
              </button>

              {/* Shopping Bag / Cart */}
              <button
                onClick={onCartOpen}
                className="relative flex items-center gap-2.5 bg-brand-black text-white pl-4 pr-5 py-2.5 rounded-full shadow-luxury hover:bg-brand-charcoal hover:shadow-luxury-hover transition-all duration-300 group"
              >
                <div className="relative">
                  <ShoppingBag size={18} className="text-brand-gold group-hover:scale-110 transition-transform" />
                  {cartCount > 0 && (
                    <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] bg-brand-gold text-brand-black text-[10px] font-extrabold rounded-full flex items-center justify-center px-0.5">
                      {cartCount}
                    </span>
                  )}
                </div>
                <span className="text-xs font-semibold tracking-wider uppercase hidden sm:inline">
                  Bag
                </span>
              </button>
                {/* Tracking Button */}
                <button onClick={()=>onTrackOpen && onTrackOpen(true)} className="ml-2 p-2.5 rounded-full hover:bg-brand-gold-light/60 text-brand-black transition-colors" aria-label="Track Orders">
                  <Truck size={18} />
                </button>
            </div>
          </div>

          {/* Mobile Search Bar Expansion */}
          {mobileSearchVisible && (
            <div className="md:hidden pb-4 pt-1 animate-fadeIn">
              <div className="relative">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Search products, brands, ingredients..."
                  autoFocus
                  className="w-full pl-10 pr-10 py-2.5 text-sm bg-brand-cream border border-brand-gold-border rounded-full focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:bg-white text-brand-black"
                />
                {searchQuery && (
                  <button
                    onClick={() => onSearchChange("")}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </header>
      {/* Auth modal is controlled by App via prop-driven handler */}
    </>
  );
}
